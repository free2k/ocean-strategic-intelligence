import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
// The marine release predates the optional low-carbon branding module.
const {brandText}=process.env.APP_ID==='low-carbon'?await import('./system-profile.mjs'):{brandText:text=>text};

export function authenticated(req,{secret,prefix='',cookies=['ocean_auth','site_auth'],allowNoAuth=false}){
 if(!secret)return allowNoAuth;
 const values=new Map(String(req.headers.cookie||'').split(';').map(part=>{const i=part.indexOf('=');return [part.slice(0,i).trim(),part.slice(i+1)];}));
 const token=cookies.map(name=>values.get(name)).find(Boolean);if(!token)return false;
 const [expires,signature]=token.split('.');if(!/^\d+$/.test(expires)||Number(expires)<=Date.now()||!signature)return false;
 const expected=Buffer.from(createHmac('sha256',secret).update(prefix+expires).digest('hex')),received=Buffer.from(signature);
 return received.length===expected.length&&timingSafeEqual(received,expected);
}

// This server only reads an atomically published, authenticated source view.
// It never loads a workspace, opens a database or imports any model client.
export function createSensingPageReader({dir,scope,publicDir,auth={},refresh=async()=>{},ttl=30000}={}){
 const file=path.join(dir,'sensing-page.json');let saved=null,fileKey='',pending=null,error=null,dirty=false,generation=0,collection=null,encoded=null;
 const styles=new Map();
 function read(){
  const stat=fs.statSync(file),key=[stat.ino,stat.mtimeMs,stat.size].join(':');
  if(key!==fileKey){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schema!==1||value.scope!==scope||!Array.isArray(value.payload?.subscriptions)||!Array.isArray(value.payload?.rss?.list))throw Error('SOURCE_VIEW_IDENTITY_MISMATCH');saved=value;fileKey=key;encoded=null;}
  if(!saved)throw Error('SOURCE_VIEW_UNAVAILABLE');return saved;
 }
 function requestRefresh(){
  if(pending)return pending;
  const epoch=generation,task=Promise.resolve().then(refresh).then(result=>{read();if(epoch===generation){dirty=false;error=null;}if(result?.collection)collection=result.collection;}).catch(()=>{error='渠道数据更新暂未完成，显示上次成功读取的记录';});
  pending=task;task.finally(()=>{if(pending===task)pending=null;});return task;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Source-Reader','1');
  let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  const asset=url.pathname.match(/^\/assets\/(sensing|research-layout|ui-controls)\.css$/);
  if(asset&&publicDir&&['GET','HEAD'].includes(req.method)){
   try{const target=path.join(publicDir,asset[1]+'.css'),stat=fs.statSync(target),key=[stat.ino,stat.mtimeMs,stat.size].join(':');let value=styles.get(target);
    if(value?.key!==key){const body=Buffer.from(brandText(fs.readFileSync(target,'utf8')));value={key,body,gzip:gzipSync(body),tag:'"style-'+createHash('sha256').update(body).digest('hex')+'"'};styles.set(target,value);}
    res.setHeader('Cache-Control','public, no-cache');res.setHeader('ETag',value.tag);
    if(req.headers['if-none-match']===value.tag){res.writeHead(304);res.end();return;}
    const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'text/css; charset=utf-8',Vary:'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(req.method==='HEAD'?undefined:gzip?value.gzip:value.body);return;
   }catch{res.writeHead(404);res.end();return;}
  }
  if(url.pathname==='/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"readOnly":true}');return;}
  if(url.pathname!=='/api/sensing-page'){res.writeHead(404);res.end();return;}
  if(!authenticated(req,auth)){res.writeHead(401,{'Content-Type':'application/json; charset=utf-8'});res.end('{"error":"请先登录研究空间"}');return;}
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  try{
   if(url.searchParams.get('refresh')==='1'){
    // Explicit reloads follow writes and must cross a fresh publication barrier.
    generation++;dirty=true;if(pending)await pending;await requestRefresh();if(error)throw Error('SOURCE_REFRESH_UNAVAILABLE');
   }
   const value=read();if(dirty||Date.now()-value.at>=ttl)void requestRefresh();
   const currentCollection=collection?{...value.payload.collection,...collection}:value.payload.collection;
   const sourceView={version:value.version,refreshing:!!pending,error};
   const tag='"sources-'+createHash('sha256').update(JSON.stringify([sourceView,currentCollection])).digest('hex')+'"';res.setHeader('ETag',tag);
   if(req.headers['if-none-match']===tag){res.writeHead(304);res.end();return;}
   const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');
   if(!encoded||encoded.tag!==tag){const body=Buffer.from(JSON.stringify({...value.payload,collection:currentCollection,sourceView}));encoded={tag,body,gzip:gzipSync(body)};}
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',Vary:'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?encoded.gzip:encoded.body);
  }catch{res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});res.end('{"error":"渠道数据暂不可用，请重试"}');}
 });
 server.invalidate=()=>{generation++;dirty=true;};
 server.updateCollection=value=>{collection=value;};
 return server;
}

export async function startSensingPageReader({dir,scope,publicDir,appId='ocean',port,auth,onRefresh,collection=()=>({}),returnRefresh=false,workerUrl=new URL('./sensing-page-worker.mjs',import.meta.url),readerData={}}){
 const worker=new Worker(workerUrl,{workerData:{...readerData,dir,scope,publicDir,port,auth},env:{APP_ID:appId},execArgv:[]});
 let closed=false;
 worker.on('message',async message=>{
  if(closed||message.action!=='refresh')return;
  try{const value=await onRefresh(message);if(!closed)worker.postMessage({id:message.id,ok:true,...(returnRefresh?{value}:{}),collection:collection()});}
  catch{if(!closed)worker.postMessage({id:message.id,ok:false});}
 });
 const actualPort=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)resolve(m.port);});worker.once('error',reject);worker.once('exit',code=>reject(Error('Source reader exited: '+code)));});
 worker.on('error',error=>console.error('Source reader:',error.code||error.name));
 const timer=setInterval(()=>worker.postMessage({collection:collection()}),5000);timer.unref();
 return {port:actualPort,invalidate:()=>worker.postMessage({invalidate:true}),close:async()=>{closed=true;clearInterval(timer);await worker.terminate();}};
}
