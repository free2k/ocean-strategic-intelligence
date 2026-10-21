import fs from 'node:fs/promises';
import path from 'node:path';
import {readTaskWorkspace as readSnapshot,saveTaskWorkspace} from './task-workspace.mjs';
import {autoExtract} from './auto-extract.mjs';import {enrich} from './enrich.mjs';
import {enrichEvidence} from './enrich-evidence.mjs';
const dir=process.env.INTEL_DATA_DIR||'.data/intelligence';
const file=path.join(dir,'snapshot.json'),workspace=await readSnapshot(file);
console.log(JSON.stringify({step:'automatic-extraction',...await autoExtract(dir,{workspace,limit:Math.max(1,Number(process.env.INTEL_AUTO_EXTRACT_LIMIT)||6)})}));
await enrich(dir,{workspace,limit:Number(process.env.INTEL_ENRICH_LIMIT??0)||Number.MAX_SAFE_INTEGER});
await enrichEvidence(dir,{workspace,limit:Math.max(1,Number(process.env.INTEL_ENRICH_LIMIT)||6)});

await saveTaskWorkspace(file,workspace);
