// Explicit, one-time migration for this instance. Never run against the marine DB.
import {verifyLowCarbonEnvironment} from './runtime.mjs';
import pg from 'pg';
import {lowCarbonSeedRules,lowCarbonTopics} from './taxonomy.mjs';
const migration='low-carbon-lexicons-20261018-v3';
await verifyLowCarbonEnvironment();
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");
 await db.query('SELECT pg_advisory_xact_lock(73201912)');
 await db.query('CREATE TABLE IF NOT EXISTS public.lc_rule_migrations(id text PRIMARY KEY,before_config jsonb NOT NULL,after_config jsonb NOT NULL,applied_at timestamptz DEFAULT now())');
 if((await db.query('SELECT id FROM public.lc_rule_migrations WHERE id=$1',[migration])).rowCount){await db.query('ROLLBACK');console.log(JSON.stringify({migration,alreadyApplied:true}));}
 else{
  const before=(await db.query('SELECT * FROM public.filter_rules ORDER BY id FOR UPDATE')).rows;
  const desired=lowCarbonSeedRules().rules;
  // This upgrade consolidates the two original seed rows per domain. Retain any
  // user-added phrases from those rows and preserve disabled domain settings.
  for(const rule of desired){
   const related=before.filter(r=>r.type===rule.type&&r.topic===rule.topic);
   if(rule.type==='include'){
    const primary=related.find(r=>!r.require_all)||related[0];
    if(primary?.enabled===false)rule.enabled=false;
    for(const field of ['title_keywords','content_keywords'])rule[field]=[...new Set([...rule[field],...related.flatMap(r=>r[field]||[])])];
    if(primary?.description&&!lowCarbonTopics.some(t=>primary.description===t.definition||primary.description===t.definition+' 组合语境'))rule.description+=' 原有备注：'+primary.description;
   }
  }
  // Complete before/after drafts are retained transactionally for rollback.
  await db.query('DELETE FROM public.filter_rules');
  for(const r of desired)await db.query('INSERT INTO public.filter_rules(id,type,topic,description,title_keywords,content_keywords,priority,require_all,groups,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.id,r.type,r.topic,r.description,JSON.stringify(r.title_keywords),JSON.stringify(r.content_keywords),r.priority,r.require_all,JSON.stringify(r.groups),r.enabled]);
  await db.query("SELECT setval(pg_get_serial_sequence('public.filter_rules','id'),(SELECT max(id) FROM public.filter_rules),true)");
  await db.query('INSERT INTO public.lc_rule_migrations(id,before_config,after_config) VALUES($1,$2,$3)',[migration,{rules:before},{rules:desired}]);
  await db.query('COMMIT');console.log(JSON.stringify({migration,rules:desired.map(r=>({type:r.type,topic:r.topic,title:r.title_keywords.length,body:r.content_keywords.length}))}));
 }
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
