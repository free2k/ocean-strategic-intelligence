import {digest,fail,prepareSnapshot} from './ledger.mjs';

export const publicationHash=data=>{const {researchPublication,...content}=data;return digest(content);};

// Checkpoint first, source marker second, research release last. A restart never reruns
// collection or models to finish an interrupted publication. Caller holds scheduler lock.
export class ResearchPublication{
 constructor({ledger,journal,store}){Object.assign(this,{ledger,journal,store});}
 async prepare(task,data,{completeness='complete',errors=[]}={}){
  const latest=await this.ledger.latest();if(!latest)fail('BASELINE_REQUIRED','Capture an explicit research baseline before enabling scheduler publication',409);
  if(latest.releaseId!==task.expectedReleaseId)fail('VERSION_CONFLICT','Research release changed during collection',409);
  const previous=await this.ledger.snapshot(latest.snapshotId);
  prepareSnapshot(data,{...previous,snapshotId:latest.snapshotId},{completeness});
  const checkpoint={data,hash:publicationHash(data),options:{expectedReleaseId:task.expectedReleaseId,trigger:task.trigger,taskIds:[task.id,...task.upstreamTaskIds],startedAt:task.createdAt,completeness,errors}};
  await this.journal.checkpoint(task.id,checkpoint);
  return this.journal.update(task.id,task.revision,{status:'ready_to_publish',checkpointHash:checkpoint.hash});
 }
 async finish(task){
  const checkpoint=await this.journal.readCheckpoint(task.id);
  if(publicationHash(checkpoint.data)!==checkpoint.hash)fail('CHECKPOINT_CORRUPT','Publication checkpoint failed integrity validation',409);
  if(this.store.data.researchPublication?.taskId!==task.id||this.store.data.researchPublication?.hash!==checkpoint.hash)fail('SOURCE_COMMIT_UNCONFIRMED','Cannot prove the source snapshot was committed; no automatic replay',409);
  const latest=await this.ledger.latest();let release;
  // Recover the gap between committing the research release and recording task completion.
  if(latest&&latest.releaseId!==task.expectedReleaseId){const batch=await this.ledger.batch(latest.batchId);if(!batch.taskIds.includes(task.id))fail('VERSION_CONFLICT','A newer research release has already been published',409);release=latest;}
  else release=await this.ledger.publish(checkpoint.data,checkpoint.options);
  return this.journal.update(task.id,task.revision,{status:checkpoint.options.completeness==='partial'?'partial':'published',releaseId:release.releaseId,snapshotId:release.snapshotId,batchId:release.batchId,unchanged:release.unchanged||false,finishedAt:new Date().toISOString(),reason:null});
 }
 async recover(id){
  let task=await this.journal.get(id);if(['published','partial','failed'].includes(task.status))return task;
  if(task.checkpointHash){try{return await this.finish(task);}catch(e){return this.journal.update(task.id,task.revision,{status:'deferred',reason:e.code||'PUBLICATION_RECOVERY_FAILED'});}}
  return this.journal.update(task.id,task.revision,{status:'deferred',reason:'INTERRUPTED_BEFORE_PUBLICATION',interruptedAt:new Date().toISOString()});
 }
}
