import {pool} from '../server/integrations/mp2rss-store.mjs';
import {client} from '../server/integrations/mp2rss-client.mjs';
import {getResource} from '../server/integrations/x-evidence.mjs';
import {parseWechatIdentity} from '../server/integrations/wechat-identity.mjs';
import {parseHTML} from 'linkedom';
try{
 const url='https://mp.weixin.qq.com/s/ptrxxW3D4tOEbWStsuPK6A';
 const item=(await pool.query("SELECT i.payload,s.id,s.last_sync,s.status,s.error,s.payload source FROM mp2rss.items i JOIN mp2rss.subscriptions s ON s.id=i.subscription_id WHERE i.payload->>'url'=$1",[url])).rows[0];
 const jobs=(await pool.query("SELECT id,action,target,status,created_at,started_at,finished_at,result->'streams' streams,error FROM mp2rss.jobs WHERE target=$1 OR (action='sync' AND target IS NULL) ORDER BY id DESC LIMIT 5",[item.id])).rows;
 console.log(JSON.stringify({account:item.source.name,lastSync:item.last_sync,status:item.status,error:item.error,jobs:jobs.map(j=>({...j,streams:j.streams?.filter(s=>s.source===item.id)}))}));
 const response=await client()('/open-api/subscriptions/'+item.source.remoteId+'/articles?page=1&pageSize=100');const raw=response.items.find(x=>x.originalUrl===url);
 console.log(JSON.stringify({providerBodyLength:raw?.contentMarkdown?.length||0,providerSummary:raw?.summary,providerUpdatedAt:raw?.updatedAt}));
 try{const result=await getResource(url,{maxBytes:3*1024*1024});const html=result.buffer?.toString('utf8')||'';const identity=parseWechatIdentity(html,result.url);const {document}=parseHTML(html);
 console.log(JSON.stringify({direct:{status:result.status,kind:result.kind,finalHost:new URL(result.url).hostname,finalPath:new URL(result.url).pathname,identity,title:document.querySelector('title')?.textContent,bodyPreview:document.querySelector('#js_content')?.textContent?.trim().slice(0,100),verification:/环境异常|完成验证|访问过于频繁|验证码/.test(html)}}));
 }catch(e){console.log(JSON.stringify({directError:e.message}));}
}finally{await pool.end();}
