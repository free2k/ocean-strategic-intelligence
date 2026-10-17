import {client,subscriptions} from '../server/integrations/mp2rss-client.mjs';
const api=client();const all=await subscriptions(api);
console.log(JSON.stringify({total:all.length,mp:all.filter(s=>s.platform==='mp').length,x:all.filter(s=>s.platform==='x').length,second:all.filter(s=>s.accountLabels?.includes(2)).length}));
for(const s of all.filter(s=>s.accountLabels?.includes(2)).slice(0,3)){
 const r=await api(`/open-api/x/${s.remoteId}/posts?page=1&pageSize=1`);
 console.log(JSON.stringify({name:s.name,handle:s.handle,availablePosts:r.total,sampleCount:r.items?.length}));
}
