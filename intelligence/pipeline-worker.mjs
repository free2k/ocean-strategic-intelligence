import {autoExtract} from './auto-extract.mjs';import {enrich} from './enrich.mjs';
import {enrichEvidence} from './enrich-evidence.mjs';
const dir=process.env.INTEL_DATA_DIR||'.data/intelligence';
console.log(JSON.stringify({step:'automatic-extraction',...await autoExtract(dir)}));
await enrich(dir,{limit:Number(process.env.INTEL_ENRICH_LIMIT??0)||Number.MAX_SAFE_INTEGER});
await enrichEvidence(dir);
