import {publicationInput} from './publication-input.mjs';
import {readWorkspace} from '../workspace-storage.mjs';
import pg from 'pg';
import {PostgresResearchRepository} from './repositories.mjs';
import {publishWorkspace} from './publish-workspace.mjs';
// Read only the atomically committed DB workspace; use a separate publisher lock.
// The release-head compare-and-swap prevents overwriting a concurrent publication.
process.env.INTEL_DATABASE_URL ||= process.env.DATABASE_URL;
if(!process.env.INTEL_DATABASE_URL)throw Error('INTEL_DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL,max:2,connectionTimeoutMillis:10000});
try{
  await pool.query(`CREATE TABLE IF NOT EXISTS ocean_intel.workspace_publication_state
    (id text PRIMARY KEY,workspace_updated_at text NOT NULL,release_id text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
  const current=(await pool.query(`SELECT r.updated_at::text AS revision,h.payload->>'releaseId' AS release_id,
    s.workspace_updated_at AS published_revision,s.release_id AS published_release
    FROM ocean_intel.runs r LEFT JOIN ocean_research.head h ON h.id='latest'
    LEFT JOIN ocean_intel.workspace_publication_state s ON s.id=r.id WHERE r.id='current'`)).rows[0];
  if(!current)throw Error('Committed workspace not found');
  if(current.revision===current.published_revision&&current.release_id===current.published_release){
    console.log(JSON.stringify({status:'unchanged',releaseId:current.release_id,reason:'workspace_and_release_unchanged'}));
  }else{
  let source=await readWorkspace(pool);
  if(!source)throw Error('Committed workspace not found');
  const payload=publicationInput(source);
  // Release ingestion-only fields before building historical registries.
  source=null;
  const release=await publishWorkspace(new PostgresResearchRepository(pool),payload,{trigger:'scheduled_workspace_publication',completeness:payload.errors?.length?'partial':'complete'});
  // Store the revision observed BEFORE reading the MVCC workspace. If collection
  // commits meanwhile, the next tick cannot mistake that newer version for done.
  await pool.query(`INSERT INTO ocean_intel.workspace_publication_state(id,workspace_updated_at,release_id)
    VALUES('current',$1,$2) ON CONFLICT(id) DO UPDATE SET workspace_updated_at=EXCLUDED.workspace_updated_at,
    release_id=EXCLUDED.release_id,updated_at=now()`,[current.revision,release.releaseId]);
  console.log(JSON.stringify({status:release.unchanged?'unchanged':'published',releaseId:release.releaseId,snapshotId:release.snapshotId,objectRegistryId:release.objectRegistryId}));
  }
}catch(e){console.error(JSON.stringify({stage:'publish_committed_workspace',code:e.code||'WORKSPACE_PUBLICATION_FAILED',message:e.message,at:new Date().toISOString()}));process.exitCode=1;}finally{await pool.end();}
