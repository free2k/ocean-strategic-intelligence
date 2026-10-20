// Run over SSH with stdin. Only business records are exported; no environment or credentials.
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),{createGzip}=require('node:zlib'),{once}=require('node:events');
const {createHash}=require('node:crypto');const sha=v=>createHash('sha256').update(v).digest('hex');
const app=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='knowledge-base');
if(!app)throw Error('APPLICATION_NOT_FOUND');
const pg=createRequire(app.pm2_env.pm_cwd+'/package.json')('pg');pg.types.setTypeParser(1114,value=>value); // Preserve timestamp-without-timezone verbatim.
(async()=>{const pool=new pg.Pool({connectionString:app.pm2_env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,options:'-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000'}),zip=createGzip();zip.pipe(process.stdout);
 const client=await pool.connect();
 const emit=async row=>{if(!zip.write(JSON.stringify(row)+'\n'))await once(zip,'drain');};
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=(await client.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('TimeZone') AS session_timezone,transaction_timestamp() AS captured_at,txid_current_snapshot()::text AS transaction_snapshot")).rows[0];if(state.read_only!=='on')throw Error('READ_ONLY_REQUIRED');await emit({kind:'manifest',format:1,...state,timestampWithoutTimezone:'preserved_verbatim_not_inferred',bodyProjection:process.argv.includes('--text-baseline')?'readable_text_with_original_hash':'original'});
 const snapshotOnly=process.argv.includes('--snapshot');
 const tables=snapshotOnly?['ocean_intel.runs','classification.jobs']:['public.articles','public.sources','public.filter_rules','classification.articles','classification.audit','mp2rss.manual_bodies','mp2rss.evidence_versions','ocean_intel.documents','ocean_intel.document_versions','ocean_intel.events','ocean_intel.entities','ocean_intel.relations','ocean_intel.observations','ocean_intel.evidence'];
 const counts={};for(const table of tables){const sql=snapshotOnly?(table==='ocean_intel.runs'?"SELECT id,payload,updated_at FROM ocean_intel.runs WHERE id='current'":"SELECT id,version,config,scope,started_at,finished_at,status FROM classification.jobs WHERE status IN ('processing','partial','completed') ORDER BY id DESC LIMIT 1"):'SELECT * FROM '+table;await client.query('DECLARE export_rows NO SCROLL CURSOR FOR '+sql);let count=0;for(;;){const rows=(await client.query('FETCH FORWARD 50 FROM export_rows')).rows;if(!rows.length)break;for(const row of rows){let projected=row,original;
 if(table==='ocean_intel.runs'&&row.payload?._workspaceParts){
  const manifest=row.payload._workspaceParts;if(manifest.version!==1)throw Error('UNSUPPORTED_WORKSPACE_STORAGE');
  const payload={...row.payload};delete payload._workspaceParts;
  for(const [field,expected] of Object.entries(manifest.fields)){
   const parts=(await client.query('SELECT part,payload FROM ocean_intel.workspace_parts WHERE generation=$1 AND field=$2 ORDER BY part',[manifest.generation,field])).rows;
   const text=parts.map(p=>p.payload).join('');
   if(parts.length!==expected.parts||parts.some((p,i)=>p.part!==i)||sha(text)!==expected.sha256)throw Error('WORKSPACE_PARTS_INVALID');
   payload[field]=JSON.parse(text);
  }
  projected={...row,payload};
 }
if(process.argv.includes('--text-baseline')&&table==='public.articles'){const raw=String(row.content||'');original={rowSha256:sha(JSON.stringify(row)),bodySha256:sha(raw),bodyBytes:Buffer.byteLength(raw),bodyStorage:'production_original_unchanged',transform:'readable-html-text-v1'};const text=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|li|tr|h[1-6])>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();projected={...row,content:row.content==null?null:text};}await emit({kind:'row',table,row:projected,...(original?{original}:{})});count++;}}await client.query('CLOSE export_rows');counts[table]=count;}
 await client.query('ROLLBACK');await emit({kind:'complete',counts,completedAt:new Date().toISOString()});zip.end();await once(zip,'end');
 }finally{client.release();await pool.end();}
})().catch(e=>{console.error('READ_ONLY_EXPORT_FAILED',e.code||e.name);process.exitCode=1;});
