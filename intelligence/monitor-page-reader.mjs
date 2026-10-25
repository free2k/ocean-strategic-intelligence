import http from 'node:http';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {authenticated} from './sensing-page-reader.mjs';
export function createMonitorPageReader({cache,auth={}}){
 const encoded=new Map();
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Monitor-Reader','1');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  let url;try{url=new URL(req.url,'http://localhost');}catch{return send(400,{error:'无效的读取地址'});}
  if(url.pathname==='/health'&&req.method==='GET')return send(200,{ok:true,readOnly:true});
  if(!['/api/monitor-page','/api/monitor-summary'].includes(url.pathname))return send(404,{error:'页面不存在'});
  if(!authenticated(req,auth))return send(401,{error:'请先登录研究空间'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'监测读取接口只接受 GET'});}
  try{
   const params=Object.fromEntries(url.searchParams),force=params.refresh==='1';delete params.refresh;const page=await cache.get(params,force),value=url.pathname==='/api/monitor-summary'?page.summary:page;
   const body=JSON.stringify(value),tag='"monitor-'+createHash('sha256').update(body).digest('hex')+'"';res.setHeader('ETag',tag);res.setHeader('Vary','Accept-Encoding');
   if(req.headers['if-none-match']===tag){res.writeHead(304);res.end();return;}
   let bytes=encoded.get(tag);if(!bytes){const raw=Buffer.from(body);bytes={raw,gzip:gzipSync(raw)};if(encoded.size>=32)encoded.delete(encoded.keys().next().value);encoded.set(tag,bytes);}
   const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?bytes.gzip:bytes.raw);
  }catch(e){send(e.status||503,{message:e.status?e.message:'监测资料暂不可用，请稍后重试。',error:e.status?e.message:'监测资料暂不可用，请稍后重试。',code:e.status?e.code:'MONITOR_READ_UNAVAILABLE'});}
 });
}
