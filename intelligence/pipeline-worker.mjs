import {autoExtract} from './auto-extract.mjs';import {enrich} from './enrich.mjs';
import {enrichEvidence} from './enrich-evidence.mjs';
const dir=process.env.INTEL_DATA_DIR||'.data/intelligence';
console.log(JSON.stringify({step:'automatic-extraction',...await autoExtract(dir,{limit:Math.max(1,Number(process.env.INTEL_AUTO_EXTRACT_LIMIT)||6)})}));
await enrich(dir,{limit:Number(process.env.INTEL_ENRICH_LIMIT??0)||Number.MAX_SAFE_INTEGER});
await enrichEvidence(dir,{limit:Math.max(1,Number(process.env.INTEL_ENRICH_LIMIT)||6)});
