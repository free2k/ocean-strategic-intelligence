import fs from 'node:fs/promises';import path from 'node:path';
import {autoExtract} from './auto-extract.mjs';import {enrich} from './enrich.mjs';
import {enrichEvidence} from './enrich-evidence.mjs';
const dir=process.env.EIA_NEWS_STAGE_DIR;if(!dir)throw Error('Explicit stage required');
const incoming=path.join(dir,'incoming.json'),snapshot=path.join(dir,'snapshot.json');
await fs.writeFile(snapshot,await fs.readFile(incoming));
await autoExtract(dir);await enrich(dir,{limit:Number.MAX_SAFE_INTEGER});
await enrichEvidence(dir);
await fs.writeFile(incoming,await fs.readFile(snapshot));
