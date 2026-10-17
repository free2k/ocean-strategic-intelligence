import assert from 'node:assert/strict';
import {mergeAccountClients} from '../server/integrations/mp2rss-accounts.mjs';
const mp=id=>({sourceType:'mp',mpId:String(id),mpName:'MP '+id}),x=id=>({sourceType:'x',xUserId:String(id),xUsername:'x'+id});
let catalogs=[[mp(1),x(2)],[x(2),x(3)]],fail=false;const calls=[];
const accounts=[0,1].map(index=>async(route,options={})=>{
 calls.push({index,route,method:options.method||'GET'});
 if(route.startsWith('/open-api/subscriptions?')){if(index===1&&fail)throw Error('account unavailable');return {items:catalogs[index],total:catalogs[index].length};}
 return {from:index};
});
const api=mergeAccountClients(accounts);
let first=await api('/open-api/subscriptions?page=1&pageSize=2');
assert.equal(first.total,3);assert.deepEqual(first.items[1].accountLabels,[1,2]);
assert.equal((await api('/open-api/subscriptions?page=2&pageSize=2')).items[0].xUserId,'3');
assert.equal((await api('/open-api/x/3/posts?page=1')).from,1);
assert.equal((await api('/open-api/subscriptions/1/articles')).from,0);
assert.equal((await api('/open-api/subscriptions',{method:'POST',body:{}})).from,0);
catalogs[0]=[];
assert.equal((await api('/open-api/subscriptions?page=1&pageSize=50')).total,2);
assert.equal((await api('/open-api/x/2/articles')).from,1);
fail=true;await assert.rejects(api('/open-api/subscriptions?page=1'),/unavailable/);
fail=false;assert.equal((await api('/open-api/subscriptions?page=1')).total,2);
catalogs=[[mp(1)],[mp(1)]];await api('/open-api/subscriptions?page=1');
await assert.rejects(api('/open-api/subscriptions/1',{method:'DELETE'}),/多个/);
assert.ok(!calls.some(c=>c.method==='DELETE'));
assert.equal((await api('/open-api/subscriptions/1/articles')).from,0);
console.log('PASS union pagination, channel deduplication, owner routing, removals, failed-account safety, retry, ambiguous deletion safety');
