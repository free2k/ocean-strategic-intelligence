import assert from 'node:assert/strict';
import {pool,status} from '../server/integrations/mp2rss-store.mjs';
import {subscriptionArticles} from '../server/integrations/subscription-articles.mjs';
try{
 const data=await status();let checked=0;const started=Date.now();
 for(const s of data.list.filter(s=>s.present)){
  const all=await subscriptionArticles(pool,{source:s.id});
  assert.equal(all.counts.mp2rss,s.count,s.payload.name+' mp2rss');assert.equal(all.counts.legacy,s.legacy_count,s.payload.name+' legacy');assert.equal(all.total,s.count+s.legacy_count);
  assert.equal(all.counts.ready+all.counts.missing,all.total);
  assert.ok(all.items.every((v,i,a)=>i===0||new Date(a[i-1].published_at)>=new Date(v.published_at)));
  checked++;if(checked%10===0)console.log(JSON.stringify({checked,elapsedMs:Date.now()-started}));
 }
 const source=data.list.find(s=>s.payload.name==='中国能源报');
 const history=await subscriptionArticles(pool,{source:source.id,origin:'legacy'}),second=await subscriptionArticles(pool,{source:source.id,origin:'legacy',page:2});
 assert.equal(history.total,source.legacy_count);assert.ok(history.items.every(i=>i.origin==='legacy'));assert.equal(new Set([...history.items,...second.items].map(i=>i.item_id)).size,history.items.length+second.items.length);
 const missing=await subscriptionArticles(pool,{source:source.id,origin:'mp2rss',missing:true});assert.equal(missing.total,source.count-source.ready);
 assert.equal(await subscriptionArticles(pool,{source:'unknown'}),null);
 console.log(JSON.stringify({checkedAccounts:checked,example:{name:source.payload.name,mp2rss:source.count,legacy:source.legacy_count,total:source.count+source.legacy_count},paginationAndFilters:'passed'}));
}finally{await pool.end();}
