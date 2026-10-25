import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {replacementProfiles} from '../intelligence/public-source-replacements.mjs';

const dir=process.env.SOURCE_MAINTENANCE_DIR;
if(!dir)throw Error('请指定 SOURCE_MAINTENANCE_DIR');
const data=JSON.parse(await fs.readFile(path.join(dir,'collection-stage/snapshot.json'),'utf8'));
const activeIds=[...replacementProfiles.map(p=>p.id),'oilprice-main','oilprice-news'];
const retiredIds=replacementProfiles.map(p=>p.replaces);
for(const profile of replacementProfiles){const report=data.sources.find(s=>s.id===profile.id);if(report?.status!=='ready'||!(report.bodyDocuments>0))throw Error('替代源尚未通过正文验证：'+profile.id);}
if(!process.argv.includes('--apply')){
 console.log(JSON.stringify({ready:true,sources:data.sources.filter(s=>activeIds.includes(s.id)).map(s=>({id:s.id,documents:s.articleCount,records:s.records,status:s.status})),documents:data.documents.length}));
}else{
 const artifactNames=new Set([...data.sources.filter(s=>activeIds.includes(s.id)).map(s=>s.archive),...Object.values(data.assetRegistries||{}).flatMap(r=>[r.archive,r.sampleArchive])].filter(Boolean));
 for(const name of artifactNames){if(path.basename(name)!==name)throw Error('无效原件路径');await fs.copyFile(path.join(dir,'collection-stage',name),path.join(process.env.INTEL_DATA_DIR||'/opt/ocean-intelligence/data',name));}
 const pool=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:1});
 try{
  // The scheduler uses the same advisory lock. All work here is bounded row
  // updates; no 600 MB library deserialization and no live-process restart.
  await pool.query('BEGIN');await pool.query("SET LOCAL lock_timeout='5s'");await pool.query("SELECT pg_advisory_xact_lock(hashtext('ocean_intel.insight-data'))");
  const head=(await pool.query("SELECT payload FROM ocean_intel.runs WHERE id='current' FOR UPDATE")).rows[0]?.payload;
  if(!head?._workspaceDelta)throw Error('工作区版本索引缺失，未进行发布');
  const sourceKeys=[...activeIds,...retiredIds].map(id=>'id:'+id),documentKeys=data.documents.map(d=>'id:'+d.id);
  const before={at:new Date().toISOString(),head,workspace:(await pool.query("SELECT * FROM ocean_intel.workspace_rows WHERE field='sources' AND key=ANY($1::text[]) OR field='documents' AND key=ANY($2::text[]) OR field='errors' AND NOT deleted OR field='sourceReplacements'",[sourceKeys,documentKeys])).rows,sources:(await pool.query('SELECT * FROM ocean_intel.sources WHERE id=ANY($1::text[])',[[...activeIds,...retiredIds]])).rows,documents:(await pool.query('SELECT * FROM ocean_intel.documents WHERE id=ANY($1::text[])',[data.documents.map(d=>d.id)])).rows,rss:(await pool.query("SELECT * FROM public.sources WHERE type='rss' AND alias LIKE 'https://www.iaea.org/feeds/%'")).rows};
  await fs.writeFile(path.join(dir,'database-before.json'),JSON.stringify(before),{flag:'wx',mode:0o600});
  const revision=(await pool.query("SELECT nextval('ocean_intel.workspace_revision')::text revision")).rows[0].revision;
  const fields=new Set(head._workspaceDelta.fields);
  async function writeRow(field,row){
   fields.add(field);const key='id:'+row.id,old=(await pool.query('SELECT position,payload FROM ocean_intel.workspace_rows WHERE field=$1 AND key=$2',[field,key])).rows[0];
   const position=old?.position??(await pool.query('SELECT coalesce(max(position),-1)+1 position FROM ocean_intel.workspace_rows WHERE field=$1',[field])).rows[0].position;
   if(field==='documents'&&old?.payload&&JSON.parse(old.payload).sourceId!==row.sourceId)throw Error('原文已有其他采集来源，需人工核对：'+row.url);
   const payload=JSON.stringify(row),hash=createHash('sha256').update(payload).digest('hex');
   await pool.query(`INSERT INTO ocean_intel.workspace_rows(field,key,position,payload,hash,revision,deleted) VALUES($1,$2,$3,$4,$5,$6,false) ON CONFLICT(field,key) DO UPDATE SET payload=EXCLUDED.payload,hash=EXCLUDED.hash,revision=EXCLUDED.revision,deleted=false`,[field,key,position,payload,hash,revision]);
  }
  for(const source of data.sources.filter(s=>activeIds.includes(s.id))){
   await writeRow('sources',source);await pool.query('INSERT INTO ocean_intel.sources(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[source.id,source]);
  }
  for(const profile of replacementProfiles){
   const previous=before.sources.find(s=>s.id===profile.replaces)?.payload;if(!previous)continue;
   const retired={...previous,status:'retired',checkedAt:null,lastCheckedAt:previous.checkedAt||previous.lastCheckedAt,retiredAt:new Date().toISOString(),replacedBy:profile.id,retirementReason:profile.scope};
   await writeRow('sources',retired);await pool.query('UPDATE ocean_intel.sources SET payload=$2,updated_at=now() WHERE id=$1',[retired.id,retired]);
   await writeRow('sourceReplacements',{id:profile.replaces,replacement:profile.id,at:new Date().toISOString(),previous,reason:profile.scope});
  }
  for(const doc of data.documents){
   // An artifact must be present before any database record references it.
   await fs.copyFile(path.join(dir,'collection-stage',doc.versionId+'.html'),path.join(process.env.INTEL_DATA_DIR||'/opt/ocean-intelligence/data',doc.versionId+'.html'));
   await writeRow('documents',doc);await pool.query('INSERT INTO ocean_intel.documents(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[doc.id,doc]);
   await pool.query('INSERT INTO ocean_intel.document_versions(id,document_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[doc.versionId,doc.id,doc]);
  }
  for(const [id,registry] of Object.entries(data.assetRegistries||{})){
   head.assetRegistries={...(head.assetRegistries||{}),[id]:registry};
  }
  for(const row of before.workspace.filter(r=>r.field==='errors'&&!r.deleted))if(retiredIds.includes(JSON.parse(row.payload).sourceId))await pool.query("UPDATE ocean_intel.workspace_rows SET deleted=true,payload=null,hash=null,revision=$3 WHERE field=$1 AND key=$2",[row.field,row.key,revision]);
  await pool.query("UPDATE public.sources SET type='rss_archived' WHERE type='rss' AND alias LIKE 'https://www.iaea.org/feeds/%'");
  head.generatedAt=new Date().toISOString();head._workspaceDelta={revision,fields:[...fields]};
  await pool.query("UPDATE ocean_intel.runs SET payload=$1,updated_at=now() WHERE id='current'",[head]);await pool.query('COMMIT');
  console.log(JSON.stringify({published:true,revision,newDocuments:data.documents.length,active:activeIds,retired:retiredIds,backup:path.join(dir,'database-before.json')}));
 }catch(error){await pool.query('ROLLBACK');throw error;}finally{await pool.end();}
}
