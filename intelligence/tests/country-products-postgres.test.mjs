import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {countryProductsFixture} from './fixtures/country-products.mjs';
import {PostgresResearchRepository} from '../research/repositories.mjs';
import {ResearchLedger} from '../research/ledger.mjs';
import {readCountries} from '../research/countries.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';

test('PostgreSQL country projections and complete publication history match the file backend', {skip:!process.env.TEST_PROJECTION_DATABASE_URL&&!process.env.TEST_PGLITE_MODULE},async t=>{
 let client;
 if(process.env.TEST_PGLITE_MODULE){
  const {PGlite}=await import(process.env.TEST_PGLITE_MODULE),db=new PGlite();
  client={query:async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rows.length};},end:()=>db.close()};
 }else{
  const {default:pg}=await import('pg');client=new pg.Client({connectionString:process.env.TEST_PROJECTION_DATABASE_URL});await client.connect();
 }
 t.after(()=>client.end());
 const {repository,ledger,data,release,dir}=await countryProductsFixture(t);
 data.generatedAt='2026-10-17T00:00:00Z';data.documents[0].content='新版本的正文与旧引用不同。';await publishWorkspace(repository,data);
 await client.query('CREATE TEMP TABLE country_products_records (id text PRIMARY KEY,kind text,payload jsonb)');
 await client.query('CREATE TEMP TABLE country_products_head (id text PRIMARY KEY,payload jsonb)');
 for(const file of await fs.readdir(dir))if(/^(snapshot|batch|release|registry|product)_/.test(file)){
  const record=JSON.parse(await fs.readFile(dir+'/'+file));await client.query('INSERT INTO country_products_records VALUES ($1,$2,$3)',[file.slice(0,-5),record.kind,record]);
 }
 await client.query('INSERT INTO country_products_head VALUES ($1,$2)',['latest',await repository.head()]);
 const pgRepository=new PostgresResearchRepository({query:(sql,args)=>client.query(sql.replaceAll('ocean_research.records','pg_temp.country_products_records').replaceAll('ocean_research.head','pg_temp.country_products_head'),args)}),pgLedger=new ResearchLedger(pgRepository);
 for(const query of [{},{view:'overview'},{countryCodes:'NO'},{countryCodes:'NO,SE',relationMode:'within'},{sourceId:'source-a',topic:'海洋低碳',from:'2026-10-14',to:'2026-10-14'},{releaseId:release.releaseId},{releaseId:release.releaseId,view:'overview',sourceId:'source-b'}])assert.deepEqual(await readCountries(pgLedger,query),await readCountries(ledger,query),JSON.stringify(query));
});
