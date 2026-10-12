import {pool,init} from '../server/integrations/mp2rss-store.mjs';
import {initDiscovery} from '../server/integrations/mp-discovery.mjs';
import {localCandidates} from '../server/integrations/mp-discovery-pipeline.mjs';
import fs from 'node:fs/promises';
await init();await initDiscovery(pool);
const names=(await fs.readFile('/opt/knowledge-base/wechatPost-import.txt','utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const results=[];for(const name of names){const r=await localCandidates(pool,name);results.push({name,existing:r.active.length,sources:r.sources.map(s=>({id:s.id,name:s.name})),links:r.links.length});}console.log(JSON.stringify(results));await pool.end();
