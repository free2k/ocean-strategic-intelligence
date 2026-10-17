import {client,subscriptions} from '../server/integrations/mp2rss-client.mjs';
const links=[process.env.MP2_RSS_LINK,...JSON.parse(process.env.MP2_RSS_EXTRA_LINKS||'[]')];
const union=new Set();const results=[];
for(const [index,link] of links.entries()){
 const rows=await subscriptions(client({link}));const overlap=rows.filter(s=>union.has(s.id)).length;
 for(const s of rows)union.add(s.id);
 results.push({account:index+1,count:rows.length,mp:rows.filter(s=>s.platform==='mp').length,x:rows.filter(s=>s.platform==='x').length,overlap,newChannels:rows.length-overlap});
}
console.log(JSON.stringify({accounts:results,uniqueChannels:union.size}));
