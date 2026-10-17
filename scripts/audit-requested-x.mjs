import {pool} from '../server/integrations/mp2rss-store.mjs';
const requested=['OGCInews','jogmec_jp','OxfordEnergy','BIMCONews','MarineInsight','Seatrade','CarbonCaptureMg','APIenergy'];
try{
 const rows=(await pool.query('SELECT payload FROM mp2rss.subscriptions WHERE present')).rows.map(r=>r.payload);
 console.log(JSON.stringify({total:rows.length,x:rows.filter(s=>s.platform==='x').map(s=>({name:s.name,handle:s.handle})),requested:requested.map(handle=>({handle,subscribed:rows.some(s=>s.platform==='x'&&s.handle?.toLowerCase()===handle.toLowerCase())}))}));
}finally{await pool.end();}
