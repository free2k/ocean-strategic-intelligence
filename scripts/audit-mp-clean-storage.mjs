import assert from 'node:assert/strict';
import {pool} from '../server/integrations/mp2rss-store.mjs';
import {prepareMPItem} from '../server/integrations/mp-content-clean.mjs';
try{
 const rows=(await pool.query("SELECT i.payload,i.content_hash,a.content,a.filter_status,i.classification FROM mp2rss.items i JOIN public.articles a ON a.id=i.article_id WHERE i.payload->>'kind'='mp_article'")).rows;
 for(const r of rows){assert.equal(r.payload.cleaning.version,'mp-body-v1');assert.equal(r.content_hash,prepareMPItem(r.payload).hash);assert.equal(typeof r.payload.originalContent,'string');}
 console.log(JSON.stringify({cleanedAndOriginalPreserved:rows.length,idempotent:true,removedBoilerplate:rows.filter(r=>r.payload.cleaning.removed.length).length}));
 const {sourceFunnels}=await import('/opt/ocean-intelligence/current/intelligence/source-funnel.mjs');
 const at=Date.now(),f=await sourceFunnels(pool);assert.ok(Object.keys(f).length>0);for(const r of Object.values(f))assert.equal(r.collected,r.included+r.candidate+r.excluded+r.pending);
 console.log(JSON.stringify({channelCounts:Object.keys(f).length,queryMs:Date.now()-at}));
}finally{await pool.end();}
