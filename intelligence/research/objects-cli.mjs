import path from 'node:path';
import {ResearchLedger} from './ledger.mjs';
import {FileResearchRepository} from './repositories.mjs';
import {publishObjects} from './objects.mjs';
const args=process.argv.slice(2),at=args.indexOf('--archive'),dir=args[at+1];
if(at<0||!dir)throw Error('Usage: node intelligence/research/objects-cli.mjs --archive <derived-archive>');
const ledger=new ResearchLedger(new FileResearchRepository(path.resolve(dir))),latest=await ledger.latest();if(!latest)throw Error('Explicit baseline required');
const release=await publishObjects(ledger,latest.releaseId);console.log(JSON.stringify({releaseId:release.releaseId,snapshotId:release.snapshotId,registryId:release.objectRegistryId,unchanged:!!release.unchanged,modelCalls:0}));
