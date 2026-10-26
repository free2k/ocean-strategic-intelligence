import {setImmediate as yieldTurn} from 'node:timers/promises';
import {sourceRecordRevision} from './insight-data.mjs';
import {workspaceRowHash} from './workspace-deltas.mjs';
const documentCache=new WeakMap();
const rootFields=['generatedAt','window','sources','documents','events','entities','relations','observations','evidence','series','assetRegistries','ieaDatasets','officialData','reportCatalog','sourceCandidates','insightEdits','insightRevision','industryRuleConfig','industryRuleVersion','industryRulePublication','_workspaceDelta'];
// Keep the full source text and classifications. Extraction checkpoints, image
// diagnostics, embeddings and chunk copies do not participate in catalogue reads.
export async function projectWorkspaceSnapshot(data){
 const snapshot=Object.fromEntries(rootFields.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]])),documents=[],revisions=new Map();let batch=0;
 for(const document of data.documents||[]){
  const key=Buffer.from(JSON.stringify([document.id])).toString('base64url'),editedAt=data.insightEdits?.['documents:'+key]?.updatedAt,sourceHash=document[workspaceRowHash],old=documentCache.get(document);let value;
  if(sourceHash&&old?.sourceHash===sourceHash&&old.editedAt===editedAt)value=old;
  else{
   const row={};for(const [k,v]of Object.entries(document))if(v===null||typeof v!=='object'||['industry','ingestion','countries'].includes(k))row[k]=v;
   if(document.autoExtraction)row.autoExtraction={status:document.autoExtraction.status};
   value={row,revision:sourceRecordRevision('documents',key,document,editedAt),sourceHash,editedAt};if(sourceHash)documentCache.set(document,value);
  }
  documents.push(value.row);revisions.set('documents:'+key,value.revision);
  if(++batch===8){batch=0;await yieldTurn();}
 }
 snapshot.documents=documents;return {snapshot,revisions};
}
