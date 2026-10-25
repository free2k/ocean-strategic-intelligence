import {verifyLowCarbonEnvironment} from './runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {lowCarbonSeedRules} from './taxonomy.mjs';
import {compileRules} from '../industry-classification.mjs';
import {initClassification} from '../classification-jobs.mjs';
import {Store} from '../store.mjs';
import {ResearchLedger} from '../research/ledger.mjs';
import {PostgresResearchRepository} from '../research/repositories.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';
import {projectionSchema} from './shared-projection.mjs';

await verifyLowCarbonEnvironment({bootstrap:true});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
 await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;
 CREATE TABLE IF NOT EXISTS public.app_instance(app_id text PRIMARY KEY,instance_id text NOT NULL,created_at timestamptz DEFAULT now());
 CREATE TABLE IF NOT EXISTS public.sources(id serial PRIMARY KEY,fakeid varchar(64) UNIQUE,name varchar(255) NOT NULL,alias varchar(255),avatar text,type varchar(32) DEFAULT 'rss',is_overseas boolean NOT NULL DEFAULT false,created_at timestamp DEFAULT now());
 CREATE TABLE IF NOT EXISTS public.articles(id serial PRIMARY KEY,title text NOT NULL,link text NOT NULL UNIQUE,cover text,digest text,content text,author_name varchar(255),source_id integer REFERENCES public.sources(id),source_type varchar(32) DEFAULT 'rss',external_id varchar(128),published_at timestamptz,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),vectorized boolean NOT NULL DEFAULT false,filter_status varchar(16) NOT NULL DEFAULT 'pending',matched_topic varchar(128),reject_reason varchar(255),classify_method varchar(16),manual_classify boolean DEFAULT false NOT NULL,matched_keywords_json text,summary text,summary_status varchar(16) DEFAULT 'pending',download_status varchar(16) DEFAULT 'pending');
 CREATE TABLE IF NOT EXISTS public.article_chunks(id serial PRIMARY KEY,article_id integer NOT NULL REFERENCES public.articles(id),chunk_index integer NOT NULL,content text NOT NULL,embedding vector(1024),created_at timestamp DEFAULT now());
 CREATE TABLE IF NOT EXISTS public.filter_rules(id serial PRIMARY KEY,type varchar(16) NOT NULL,topic varchar(128),description text,title_keywords jsonb NOT NULL DEFAULT '[]',content_keywords jsonb NOT NULL DEFAULT '[]',priority integer NOT NULL DEFAULT 99,require_all boolean NOT NULL DEFAULT false,groups jsonb NOT NULL DEFAULT '[]',enabled boolean NOT NULL DEFAULT true,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
 CREATE TABLE IF NOT EXISTS public.lc_sources(id text PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE SCHEMA IF NOT EXISTS mp2rss;
 CREATE TABLE IF NOT EXISTS mp2rss.subscriptions(id text PRIMARY KEY,source_id integer REFERENCES public.sources(id),payload jsonb NOT NULL,enabled boolean DEFAULT true,posts boolean DEFAULT false,articles boolean DEFAULT true,present boolean DEFAULT true,checked_at timestamptz,last_sync timestamptz,status text,error text);
 CREATE TABLE IF NOT EXISTS mp2rss.items(id text PRIMARY KEY,subscription_id text REFERENCES mp2rss.subscriptions(id),article_id integer REFERENCES public.articles(id),payload jsonb NOT NULL,content_hash text NOT NULL,classification jsonb NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE INDEX IF NOT EXISTS lc_mp2rss_items_article_idx ON mp2rss.items(article_id,updated_at DESC,id);
 CREATE TABLE IF NOT EXISTS mp2rss.versions(id text NOT NULL,hash text NOT NULL,payload jsonb NOT NULL,captured_at timestamptz DEFAULT now(),PRIMARY KEY(id,hash));
 CREATE TABLE IF NOT EXISTS mp2rss.jobs(id bigserial PRIMARY KEY,action text NOT NULL,target text,status text DEFAULT 'queued',created_at timestamptz DEFAULT now(),started_at timestamptz,finished_at timestamptz,result jsonb,error text,request jsonb);
 CREATE TABLE IF NOT EXISTS mp2rss.state(id text PRIMARY KEY,payload jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS mp2rss.evidence_links(url text PRIMARY KEY,kind text DEFAULT 'article',origins jsonb DEFAULT '[]',payload jsonb DEFAULT '{}',status text DEFAULT 'pending',next_check timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.evidence_documents(url text PRIMARY KEY,payload jsonb NOT NULL,classification jsonb NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.evidence_versions(url text NOT NULL,hash text NOT NULL,payload jsonb NOT NULL,created_at timestamptz DEFAULT now(),PRIMARY KEY(url,hash));`);
 // v1 wrote UTC ISO strings into the legacy timestamp column. Preserve those UTC
 // instants when upgrading this isolated instance; do not reinterpret them as CST.
 const column=(await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='articles' AND column_name='published_at'")).rows[0];
 if(column?.data_type==='timestamp without time zone')await pool.query("ALTER TABLE public.articles ALTER COLUMN published_at TYPE timestamptz USING published_at AT TIME ZONE 'UTC'");
 const identity=(await pool.query("SELECT instance_id FROM public.app_instance WHERE app_id='low-carbon'")).rows[0];
 if(identity&&identity.instance_id!==process.env.LC_INSTANCE_ID)throw Error('LOW_CARBON_INSTANCE_REJECTED');
 await pool.query("INSERT INTO public.app_instance(app_id,instance_id) VALUES('low-carbon',$1) ON CONFLICT DO NOTHING",[process.env.LC_INSTANCE_ID]);
 await initClassification(pool);
 await pool.query(projectionSchema);
 for(const file of (await fs.readdir(new URL('../research/migrations/',import.meta.url))).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await pool.query(await fs.readFile(new URL('../research/migrations/'+file,import.meta.url),'utf8'));
 if(!(await pool.query('SELECT 1 FROM public.filter_rules LIMIT 1')).rowCount){for(const r of lowCarbonSeedRules().rules)await pool.query('INSERT INTO public.filter_rules(type,topic,description,title_keywords,content_keywords,priority,require_all,groups,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[r.type,r.topic,r.description,JSON.stringify(r.title_keywords),JSON.stringify(r.content_keywords),r.priority,r.require_all,JSON.stringify(r.groups),r.enabled]);}
 const config={rules:(await pool.query('SELECT * FROM public.filter_rules ORDER BY id')).rows};
 if(!(await pool.query('SELECT 1 FROM classification.jobs LIMIT 1')).rowCount)await pool.query("INSERT INTO classification.jobs(version,config,scope,status,preview,result,started_at,finished_at) VALUES($1,$2,'{}','completed','{}','{}',now(),now())",[compileRules(config).version,JSON.stringify(config)]);
 const dir=process.env.INTEL_DATA_DIR,snapshot=path.join(dir,'snapshot.json');
 try{await fs.access(snapshot);}catch{await fs.writeFile(snapshot,JSON.stringify({version:1,appId:'low-carbon',instanceId:process.env.LC_INSTANCE_ID,generatedAt:new Date().toISOString(),window:{since:'2024-01-01',until:new Date().toISOString().slice(0,10)},sources:[],documents:[],events:[],entities:[],relations:[],observations:[],evidence:[],errors:[],series:[],assetRegistries:{}}));}
 const store=new Store(dir,process.env.DATABASE_URL);await store.init();await store.import(store.data);
 const repository=new PostgresResearchRepository(pool),ledger=new ResearchLedger(repository);
 if(!await repository.head())await ledger.publish(store.data,{baseline:true,expectedReleaseId:null,trigger:'low-carbon-initialization'});
 await publishWorkspace(repository,store.data,{trigger:'low-carbon-initialization'});
 await store.pool.end();
 console.log(JSON.stringify({initialized:true,appId:'low-carbon',database:'low_carbon_kb',rules:config.rules.length}));
}finally{await pool.end();}
