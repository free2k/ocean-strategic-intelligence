import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../store.mjs';
import {readWorkspace,writeWorkspace} from '../workspace-storage.mjs';
import {lockData} from '../insight-data.mjs';

test('atomic article deltas, deletion, unchanged row reuse and stale-writer rejection',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.match(url.pathname,/\/ocean_worker_test$/);
 const pool=new pg.Pool({connectionString:url.href});
 const dir=await mkdtemp(path.join(tmpdir(),'worker-db-'));
 const initial={generatedAt:'first',documents:[{id:'a',versionId:'v1',content:'中文😀'},{id:'b',versionId:'v2',content:'keep'}],events:[{id:'e',documentId:'a',reviewedAt:'today',status:'accepted'}],sources:[],entities:[],relations:[],observations:[],evidence:[],empty:[],nested:{value:'x'}};
 let writer,reader;
 try{
  await writeFile(path.join(dir,'snapshot.json'),JSON.stringify(initial));writer=new Store(dir,url.href);await writer.init();await writer.import(initial);
  reader=new Store(dir,url.href);await reader.init();const first=reader.data,retained=first.documents[1];
  const changed={...writer.data,generatedAt:'second',documents:[{...writer.data.documents[0],content:'updated',versionId:'v3'},writer.data.documents[1]],events:[]};
  await writer.import(changed);await reader.refresh();
  assert.equal(reader.data.documents[0].content,'updated');assert.equal(reader.data.documents[1],retained);assert.deepEqual(reader.data.events,[]);
  assert.equal(first.documents[0].content,'中文😀');
  const revision=reader.data._workspaceDelta.revision;
  await writer.import({...writer.data,generatedAt:'third'});
  const changedRows=(await pool.query('SELECT count(*)::int AS n FROM ocean_intel.workspace_rows WHERE revision>$1',[revision])).rows[0].n;
  assert.equal(changedRows,0);
  await assert.rejects(reader.import({...reader.data,generatedAt:'stale'}),{code:'WORKSPACE_CONFLICT'});
  await reader.refresh();assert.equal(reader.data.generatedAt,'third');
  const c=await pool.connect();try{await c.query('BEGIN');await lockData(c);await writeWorkspace(c,{...reader.data,generatedAt:'uncommitted',documents:[]});assert.equal((await readWorkspace(pool)).generatedAt,'third');await c.query('ROLLBACK');}finally{c.release();}
  assert.equal((await readWorkspace(pool)).documents.length,2);
 }finally{await writer?.pool.end();await reader?.pool.end();await pool.end();await rm(dir,{recursive:true,force:true});}
});
