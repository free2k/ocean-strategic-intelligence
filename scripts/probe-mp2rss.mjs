import fs from 'node:fs/promises';
import {fetch,ProxyAgent} from 'undici';
try{
 const u=new URL(process.env.MP2_RSS_LINK);if(u.protocol!=='https:'||u.hostname!=='mp2rss.bugcode.dev')throw Error('unsupported_feed_host');
 const token=u.pathname.match(/^\/feed\/([^/]+)\//)?.[1];if(!token)throw Error('invalid_feed_path');
 async function get(path){for(const proxy of [false,true]){try{const r=await fetch(u.origin+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000),...(proxy&&process.env.DOWNLOAD_PROXY?{dispatcher:new ProxyAgent(process.env.DOWNLOAD_PROXY)}:{})});if(!r.ok)throw Error('HTTP_'+r.status);return await r.json();}catch(e){if(proxy)throw Error(/^HTTP_\d+$/.test(e.message)?e.message:'network_or_response_error');}}}
 const subs=await get('/open-api/subscriptions?pageSize=50');
 console.log(JSON.stringify({subscriptionTotal:subs.total,count:subs.items?.length,accounts:subs.items?.map(x=>({type:x.sourceType,id:x.mpId||x.xUserId,name:x.mpName||x.xDisplayName}))}));
 const samples=[];for(const s of subs.items||[]){for(const kind of s.sourceType==='x'?['posts','articles']:['articles']){const route=s.sourceType==='mp'?`/open-api/subscriptions/${s.mpId}/articles`:`/open-api/x/${s.xUserId}/${kind}`;const r=await get(route+'?pageSize=2');samples.push({source:s,kind,response:r});console.log(JSON.stringify({name:s.mpName||s.xDisplayName,kind,total:r.total,sampleCount:r.items?.length,fields:Object.keys(r.items?.[0]||{}),bodyLengths:r.items?.map(x=>(x.contentMarkdown||x.content||'').length)}));}}
 await fs.mkdir('.data/mp2rss',{recursive:true});await fs.writeFile('.data/mp2rss/probe.json',JSON.stringify({subs,samples}),{mode:0o600});
}catch(e){console.error('Probe failed:',e.message?.replace(/https?:\S+/g,'[url]'));process.exitCode=1;}
