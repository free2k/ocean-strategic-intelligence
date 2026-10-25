import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../store.mjs';
import {previewImport,commitImport} from '../insight-import.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
import {queryData} from '../insight-data.mjs';
const config=JSON.parse(await fs.readFile(new URL('../quant-preview/legacy-rules.json',import.meta.url),'utf8'));
test('PostgreSQL import commits rows, workspace metadata, original versions and receipts atomically and survives refresh',async()=>{
 const db=new PGlite(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'import-postgres-'));
 const query=(sql,args)=>!args&&sql.split(';').filter(s=>s.trim()).length>1?db.exec(sql):db.query(sql,args);
 const pool={query,connect:async()=>({query,release(){}})};
 try{
  const data={generatedAt:'2026-10-20',sources:[],documents:[],events:[],evidence:[],observations:[],entities:[],relations:[],series:[],assetRegistries:{}};attachPublishedRules(data,{config});
  await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(data));
  const store=new Store(dir);store.pool=pool;await store.init();attachPublishedRules(store.data,{config});await store.import(store.data);
  const draft=await previewImport(store,{mode:'data',name:'data.csv',text:'指标,统计期,数值,单位\n发电量,2026-01,0,MWh\n发电量,2026-02,-2,MWh',metadata:{topic:'海上风电',country:'CN',nature:'实际'}},'actor');
  await commitImport(store,draft,'actor');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ocean_intel.documents')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ocean_intel.observations')).rows[0].n,2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ocean_intel.document_versions')).rows[0].n,1);
  const reader=new Store(dir);reader.pool=pool;await reader.refresh();assert.equal(reader.data.insightImportResults[draft.id].observations,2);assert.deepEqual(reader.data.series[0].rows.map(r=>r.value),[0,-2]);assert.equal(queryData(reader.data,{kind:'statistics',origin:'imported'}).total,2);
  const retry=await commitImport(reader,draft,'actor');assert.equal(retry.repeated,true);
  const next=await previewImport(reader,{mode:'data',name:'bad-transaction.csv',text:'指标,统计期,数值,单位\n装机容量,2026-01,3,MW\n装机容量,2026-02,4,MW',metadata:{topic:'海上风电',nature:'实际'}},'actor');
  const connect=pool.connect;pool.connect=async()=>{const client=await connect();return {...client,query:(sql,args)=>{if(sql.startsWith('INSERT INTO ocean_intel.observations'))throw Error('simulated write failure');return client.query(sql,args);}};};
  await assert.rejects(commitImport(reader,next,'actor'),/simulated/);pool.connect=connect;
  await store.refresh();assert.equal(store.data.documents.length,1);assert.equal(store.data.observations.length,2);assert.equal(store.data.insightImportResults[next.id],undefined);assert.equal((await db.query('SELECT count(*)::int AS n FROM ocean_intel.document_versions')).rows[0].n,1);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
