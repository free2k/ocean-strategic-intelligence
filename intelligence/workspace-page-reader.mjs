import http from 'node:http';import {gzipSync} from 'node:zlib';
import {authenticated} from './sensing-page-reader.mjs';
const routes=new Map([['/api/insight-page','inventory'],['/quant/api/page','quant'],['/quant/api/card','card'],['/quant/api/catalog','legacy'],['/api/strategy/catalog','research']]);
export function createWorkspacePageReader({cache,auth={}}){
 const encoded=new Map();return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Workspace-Reader','1');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  let url;try{url=new URL(req.url,'http://localhost');}catch{return send(400,{error:'读取地址无效'});}
  if(url.pathname==='/health')return send(200,{ok:true,readOnly:true});const type=routes.get(url.pathname);if(!type)return send(404,{error:'读取接口不存在'});
  if(!authenticated(req,auth))return send(401,{error:'请先登录研究空间'});if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'读取接口只接受 GET'});}
  try{const params=Object.fromEntries(url.searchParams),force=params.refresh==='1';delete params.refresh;const result=await cache.get(type,params,force),tag='"workspace-'+result.version+'"';res.setHeader('ETag',tag);res.setHeader('Vary','Accept-Encoding');if(req.headers['if-none-match']===tag){res.writeHead(304);return res.end();}
   let value=encoded.get(tag);if(!value){const raw=Buffer.from(JSON.stringify(result.value));value={raw,gzip:gzipSync(raw)};if(encoded.size>=40)encoded.delete(encoded.keys().next().value);encoded.set(tag,value);}const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?value.gzip:value.raw);
  }catch(e){send(e.status||503,{error:e.status?e.message:'资料目录暂不可用，请稍后重试',message:e.status?e.message:'资料目录暂不可用，请稍后重试'});}
 });
}
