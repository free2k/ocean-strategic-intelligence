// Explicit shared services: AI and source registration only. No article,
// classification, vector, research, export or database endpoint is proxied.
import http from 'node:http';
import fs from 'node:fs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {allowedSharedSource,allowedSharedProvider,sharedRegistryPayload} from './shared-policy.mjs';
const settings={};
const allowed=new Set(['SITE_PASSWORD','OPENAI_BASE_URL','OPENAI_API_KEY','CHAT_MODEL','EMBEDDING_MODEL','MP2_RSS_LINK','MP2_RSS_EXTRA_LINKS']);
for(const line of fs.readFileSync(process.env.LC_SHARED_CONFIG_FILE,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(m&&allowed.has(m[1]))settings[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
// Read the protected allowlist once, then serve requests without root privileges.
if(process.getuid?.()===0){process.setgid('lcshared');process.setuid('lcshared');}
const token=process.env.LC_GATEWAY_TOKEN;if(!token)throw Error('SHARED_GATEWAY_TOKEN_REQUIRED');
for(const key of ['MP2_RSS_LINK','MP2_RSS_EXTRA_LINKS'])if(settings[key])process.env[key]=settings[key];
const {client:providerClient}=await import('../../server/integrations/mp2rss-client.mjs');
let provider;
const equal=(a,b)=>{a=Buffer.from(a||'');b=Buffer.from(b||'');return a.length===b.length&&timingSafeEqual(a,b);};
http.createServer(async(req,res)=>{
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(!equal(req.headers.authorization,'Bearer '+token))return json(401,{error:'Unauthorized'});
 const u=new URL(req.url,'http://local');
 if(u.pathname==='/status')return json(200,{ai:!!settings.OPENAI_API_KEY&&settings.OPENAI_API_KEY!=='your-api-key',sources:true,provider:!!settings.MP2_RSS_LINK,model:settings.CHAT_MODEL||'qwen-plus',embeddingModel:settings.EMBEDDING_MODEL||'text-embedding-v4'});
 try{
  let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>4*1024*1024)return json(413,{error:'Payload too large'});}
  if(u.pathname.startsWith('/provider/')){
   const route=u.pathname.slice('/provider'.length)+u.search;
   if(!allowedSharedProvider(u.pathname.slice('/provider'.length),req.method))return json(403,{error:'Provider route not allowed'});
   provider||=providerClient();return json(200,await provider(route));
  }
  let upstream,headers={'Content-Type':'application/json'};
  if(req.method==='POST'&&['/v1/chat/completions','/v1/embeddings'].includes(u.pathname)){
   if(!settings.OPENAI_API_KEY||settings.OPENAI_API_KEY==='your-api-key')return json(503,{error:'共享模型尚未配置'});
   upstream=(settings.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+u.pathname.slice(3);
   headers.Authorization='Bearer '+settings.OPENAI_API_KEY;
  }else if(allowedSharedSource(u.pathname,req.method,data?JSON.parse(data):{})){
   upstream=(process.env.LC_SHARED_SOURCE_ORIGIN||'http://127.0.0.1:3000')+u.pathname+u.search;
   const exp=String(Date.now()+300000);headers.Cookie='site_auth='+exp+'.'+createHmac('sha256',settings.SITE_PASSWORD||'').update(exp).digest('hex');
  }else return json(403,{error:'共享接口仅开放 AI 和订阅源管理'});
  const response=await fetch(upstream,{method:req.method,headers,...(data?{body:data}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});
  if(response.ok&&['/api/subscriptions/action','/api/subscriptions'].includes(u.pathname))provider=null;
  if(response.ok&&req.method==='GET'&&['/api/subscriptions','/api/rss/sources'].includes(u.pathname))return json(response.status,sharedRegistryPayload(u.pathname,await response.json()));
  res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error('Shared gateway request failed',u.pathname.startsWith('/provider/')?'provider':'shared',e.name,e.status||e.code||'unavailable');json(502,{error:'共享服务暂不可用，请稍后重试'});}
}).listen(Number(process.env.LC_GATEWAY_PORT||3270),'127.0.0.1',()=>console.log('Low-carbon shared AI and sources gateway ready'));
