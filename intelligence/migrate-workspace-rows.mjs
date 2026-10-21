import pg from 'pg';
import {workspaceSchemaSql,readWorkspaceClient,writeWorkspace} from './workspace-storage.mjs';
import {lockData} from './insight-data.mjs';

// Run once under the worker's resource limits, with writers stopped. Retain one
// transactional pre-migration backup for rollback before processing is enabled.
const pool=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:1});
const client=await pool.connect();
try{
 await client.query('BEGIN');await lockData(client);await client.query(workspaceSchemaSql);
 const head=(await client.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0]?.payload;
 if(!head)throw Error('No committed workspace');
 if(head._workspaceDelta)console.log('Article row storage already active');
 else{
  await client.query("CREATE TABLE ocean_intel.workspace_before_worker_runs AS SELECT * FROM ocean_intel.runs WHERE id='current'");
  await client.query('CREATE TABLE ocean_intel.workspace_before_worker_parts AS TABLE ocean_intel.workspace_parts');
  const data=await readWorkspaceClient(client);
  const manifest=await writeWorkspace(client,data);
  console.log(JSON.stringify({revision:manifest.revision,documents:data.documents.length,fields:manifest.fields,memory:process.memoryUsage()}));
 }
 await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
