import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {createTaskWorkspace,readTaskWorkspace,saveTaskWorkspace,finishTaskWorkspace,recoverTaskWorkspaces} from '../task-workspace.mjs';
import {workspaceSchemaSql,writeWorkspace,readWorkspace} from '../workspace-storage.mjs';

test('pinned article versions survive live updates, share bodies, save only deltas and retain failed differences',
 {skip:!process.env.TASK_TEST_DATABASE_URL},async t=>{
 const url=process.env.TASK_TEST_DATABASE_URL,oldUrl=process.env.DATABASE_URL,oldIntelUrl=process.env.INTEL_DATABASE_URL;assert.match(new URL(url).pathname,/\/ocean_task_test$/);process.env.DATABASE_URL=url;process.env.INTEL_DATABASE_URL=url;
 const pool=new pg.Pool({connectionString:url}),root=await fs.mkdtemp(path.join(os.tmpdir(),'task-refs-'));
 t.after(async()=>{await pool.end();await fs.rm(root,{recursive:true,force:true});if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;if(oldIntelUrl===undefined)delete process.env.INTEL_DATABASE_URL;else process.env.INTEL_DATABASE_URL=oldIntelUrl;});
 await pool.query('CREATE SCHEMA ocean_intel; CREATE TABLE ocean_intel.runs(id text PRIMARY KEY,payload jsonb,updated_at timestamptz DEFAULT now())');
 await pool.query(workspaceSchemaSql);
 const data={documents:[{id:'a',content:'中文😀'.repeat(10000)},{id:'b',content:'second'}],events:[],metadata:{tag:'old'},generatedAt:'old'};
 const write=async d=>{const c=await pool.connect();try{await c.query('BEGIN');await writeWorkspace(c,d);await c.query('COMMIT');}finally{c.release();}};
 await write(data);let live=await readWorkspace(pool);
 const one=path.join(root,'one'),two=path.join(root,'two');await fs.mkdir(one);await fs.mkdir(two);
 await createTaskWorkspace(pool,live,one);await createTaskWorkspace(pool,live,two);
 assert.deepEqual(await fs.readdir(one),['task-input.json']);
 assert((await fs.stat(path.join(one,'task-input.json'))).size<1024);
 const count=async()=>Number((await pool.query('SELECT count(*) FROM ocean_intel.task_objects')).rows[0].count);
 const initial=await count();assert.equal(initial,4);
 await write({...data,documents:[{id:'a',content:'new live version'}]});
 const first=await readTaskWorkspace(path.join(one,'snapshot.json'));
 assert.equal(first.documents[0].content,data.documents[0].content);
 await saveTaskWorkspace(path.join(one,'snapshot.json'),first);assert.equal(await count(),initial);
 first.documents[0].titleZh='Changed';first.documents.pop();first.documents.push({id:'c',content:'new'});
 await saveTaskWorkspace(path.join(one,'snapshot.json'),first);assert.equal(await count(),initial+2);
 const reread=await readTaskWorkspace(path.join(one,'snapshot.json'));assert.deepEqual(reread,first);
 assert.deepEqual(await readTaskWorkspace(path.join(two,'snapshot.json')),data);
 // Independent process advances generation; stale writers must fail atomically.
 await pool.query("UPDATE ocean_intel.task_workspaces SET generation=generation+1 WHERE id='one'");
 await assert.rejects(saveTaskWorkspace(path.join(one,'snapshot.json'),first),/Concurrent/);
 await finishTaskWorkspace(pool,one,{committed:false});
 assert.equal(JSON.parse(await fs.readFile(path.join(one,'task-input.json'),'utf8')).status,'failed');
 const failed=(await pool.query("SELECT field,key,deleted FROM ocean_intel.task_inputs WHERE job_id='one' ORDER BY key")).rows;
 assert.deepEqual(failed,[{field:'documents',key:'id:a',deleted:false},{field:'documents',key:'id:b',deleted:true},{field:'documents',key:'id:c',deleted:false}]);
 await finishTaskWorkspace(pool,two,{committed:true});assert.deepEqual(await fs.readdir(two),[]);
 assert.equal((await pool.query("SELECT count(*) FROM ocean_intel.task_inputs i JOIN ocean_intel.task_objects o ON o.hash=i.base_hash WHERE i.job_id='one' AND i.key='id:a'")).rows[0].count,'1');
 assert.equal((await pool.query("SELECT count(*) FROM ocean_intel.task_inputs WHERE job_id='two'")).rows[0].count,'0');
 await assert.rejects(readTaskWorkspace(path.join(one,'snapshot.json')),/not resumable/);
 const crash=path.join(root,'crash');await fs.mkdir(crash);await createTaskWorkspace(pool,await readWorkspace(pool),crash);
 assert.equal(await recoverTaskWorkspaces(pool),1);
 assert.equal((await pool.query("SELECT count(*) FROM ocean_intel.task_inputs WHERE job_id='crash'")).rows[0].count,'0');
});
