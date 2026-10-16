import pg from 'pg';
import {PostgresResearchRepository} from './repositories.mjs';
import {publishWorkspace} from './publish-workspace.mjs';
// Must be launched under the same flock as collection; never read a staged snapshot.
if(!process.env.INTEL_DATABASE_URL)throw Error('INTEL_DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL,max:2,connectionTimeoutMillis:10000});
try{
 const active=(await pool.query("SELECT id FROM classification.jobs WHERE status IN ('queued','classifying','processing') LIMIT 1")).rows[0];
 if(active){console.log(JSON.stringify({status:'waiting',classificationJob:active.id}));}
 else{
  const row=(await pool.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0];
  if(!row)throw Error('Committed workspace not found');
  const release=await publishWorkspace(new PostgresResearchRepository(pool),row.payload,{trigger:'scheduled_workspace_publication',completeness:row.payload.errors?.length?'partial':'complete'});
  console.log(JSON.stringify({status:release.unchanged?'unchanged':'published',releaseId:release.releaseId,snapshotId:release.snapshotId,objectRegistryId:release.objectRegistryId}));
 }
}catch(e){console.error(e.code||'WORKSPACE_PUBLICATION_FAILED');process.exitCode=1;}finally{await pool.end();}
