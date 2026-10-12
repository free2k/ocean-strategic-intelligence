import {pool,init} from '../server/integrations/mp2rss-store.mjs';
import {initDiscovery} from '../server/integrations/mp-discovery.mjs';
import {localCandidates} from '../server/integrations/mp-discovery-pipeline.mjs';
import {verifyWithHistory} from '../server/integrations/wechat-history.mjs';
import fs from 'node:fs/promises';
await init();await initDiscovery(pool);const names=(await fs.readFile('/opt/knowledge-base/wechatPost-import.txt','utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const out=[];
for(const name of names){const local=await localCandidates(pool,name);if(local.active.length)continue;let verified=0;for(const c of local.links){const p=await verifyWithHistory(pool,name,c.url,{fetchPage:async()=>{throw Error('offline audit')}});if(p.status==='verified')verified++;}out.push({name,links:local.links.length,verified});}console.log(JSON.stringify(out));await pool.end();
