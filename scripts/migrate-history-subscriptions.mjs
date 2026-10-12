import fs from 'node:fs/promises';
import {pool,init} from '../server/integrations/mp2rss-store.mjs';
import {initDiscovery,enqueueDiscovery} from '../server/integrations/mp-discovery.mjs';
import {localCandidates} from '../server/integrations/mp-discovery-pipeline.mjs';
await init();await initDiscovery(pool);const names=(await fs.readFile('/opt/knowledge-base/wechatPost-import.txt','utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),historical=[],search=[];
for(const name of names){const r=await localCandidates(pool,name);if(r.active.length)continue;(r.links.length?historical:search).push(name);}
if(process.argv.includes('--queue')){if(historical.length)console.log({historical:await enqueueDiscovery(pool,historical,true)});if(search.length)console.log({search:await enqueueDiscovery(pool,search,true)});}
console.log({historical,search});await pool.end();
