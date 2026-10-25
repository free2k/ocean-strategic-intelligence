import {ResearchLedger,fail} from './ledger.mjs';
import {publishObjects} from './objects.mjs';
import {publishCountries} from './countries.mjs';
// Build all derived registries before advancing the public head once.
export async function publishWorkspace(repository,data,options={}){
 const original=await repository.head();if(!original)fail('BASELINE_REQUIRED','Existing research baseline required');
 let head=original;const records={};
 const staged={head:async()=>head,read:async id=>records[id]||repository.read(id),readSnapshotComparison:async id=>records[id]||(repository.readSnapshotComparison?repository.readSnapshotComparison(id):repository.read(id)),commit:async change=>{
  if(change.expectedReleaseId!==head.releaseId)fail('VERSION_CONFLICT','Staged research head changed');
  Object.assign(records,change.records);head=change.head;
 }};
 const ledger=new ResearchLedger(staged);
 let release=await ledger.publish(data,{...options,expectedReleaseId:original.releaseId});
 release=await publishObjects(ledger,release.releaseId);
 release=await publishCountries(ledger,release.releaseId);
 if(head.releaseId!==original.releaseId)await repository.commit({expectedReleaseId:original.releaseId,head,records});
 return {...release,unchanged:head.releaseId===original.releaseId};
}
