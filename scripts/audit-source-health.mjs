import fs from 'node:fs/promises';
import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 const rows=(await pool.query(`SELECT i.payload->>'title' title,i.payload->>'url' url,i.payload->>'publishedAt' published,i.classification->>'status' status FROM mp2rss.items i JOIN (SELECT id,min(captured_at) first_seen FROM mp2rss.versions GROUP BY id) v ON v.id=i.id JOIN mp2rss.jobs j ON j.id=97 WHERE i.subscription_id='x:84679163' AND v.first_seen BETWEEN j.started_at AND j.finished_at ORDER BY i.payload->>'publishedAt' DESC`)).rows;
 console.log(JSON.stringify({added:rows}));
 const d=JSON.parse(await fs.readFile('/opt/ocean-intelligence/data/snapshot.json','utf8'));
 console.log(JSON.stringify({sources:d.sources.filter(s=>s.id.startsWith('iaea')),errors:d.errors.slice(-20).map(e=>({...e,document:e.documentId?d.documents.filter(x=>x.id===e.documentId).map(x=>({title:x.title,url:x.url,length:x.content?.length,status:x.autoExtraction}))[0]:null})),processing:d.processing}));
}finally{await pool.end();}
