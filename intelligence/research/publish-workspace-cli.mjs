import pg from 'pg';
import {PostgresResearchRepository} from './repositories.mjs';
import {publishWorkspace} from './publish-workspace.mjs';
// Read only the atomically committed DB workspace; use a separate publisher lock.
// The release-head compare-and-swap prevents overwriting a concurrent publication.
process.env.INTEL_DATABASE_URL ||= process.env.DATABASE_URL;
if(!process.env.INTEL_DATABASE_URL)throw Error('INTEL_DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL,max:2,connectionTimeoutMillis:10000});
try{
  const row=(await pool.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0];
  if(!row)throw Error('Committed workspace not found');
  const release=await publishWorkspace(new PostgresResearchRepository(pool),row.payload,{trigger:'scheduled_workspace_publication',completeness:row.payload.errors?.length?'partial':'complete'});
  console.log(JSON.stringify({status:release.unchanged?'unchanged':'published',releaseId:release.releaseId,snapshotId:release.snapshotId,objectRegistryId:release.objectRegistryId}));
}catch(e){console.error(JSON.stringify({stage:'publish_committed_workspace',code:e.code||'WORKSPACE_PUBLICATION_FAILED',message:e.message,at:new Date().toISOString()}));process.exitCode=1;}finally{await pool.end();}
