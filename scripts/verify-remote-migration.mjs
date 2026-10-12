import {pool} from '../server/integrations/mp2rss-store.mjs';
import {client,subscriptions} from '../server/integrations/mp2rss-client.mjs';
const remote=await subscriptions(client()),proofs=(await pool.query("SELECT payload FROM mp2rss.discovery WHERE payload->>'status'='verified'")).rows.map(r=>r.payload);
const confirmed=[],pending=[];for(const p of proofs){const id=Buffer.from(p.biz,'base64').toString('utf8'),match=remote.find(s=>s.platform==='mp'&&s.remoteId===id);(match?confirmed:pending).push(p.name);}
console.log(JSON.stringify({confirmed,pending,totalRemote:remote.length}));await pool.end();
