// Local preparation only: never constructs a provider client or dispatches paid requests.
import path from 'node:path';
import {ResearchLedger} from './ledger.mjs';
import {FileResearchRepository} from './repositories.mjs';
import {FileRuntimeState} from './runtime-state.mjs';
import {BriefWorker} from './brief-worker.mjs';
const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
const archive=value('--archive'),runtime=value('--runtime');
if(!archive||!runtime||!args.includes('--prepare'))throw Error('Usage: node intelligence/research/briefs-cli.mjs --archive <derived-archive> --runtime <derived-runtime> --prepare');
const ledger=new ResearchLedger(new FileResearchRepository(path.resolve(archive))),state=new FileRuntimeState(path.resolve(runtime)),worker=new BriefWorker({ledger,state});
const tasks=await worker.enqueue();for(const task of tasks)if(task.status==='queued')await worker.run(task.id);
const release=await worker.publish();console.log(JSON.stringify({releaseId:release.releaseId,snapshotId:release.snapshotId,productStatus:release.productStatus,tasks:tasks.length,paidRequests:0}));
