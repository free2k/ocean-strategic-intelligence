import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {workspaceData} from './workspace-data.mjs';
const compress=promisify(gzip);

// A read-only adapter allows deployment while the main process finishes its
// collection jobs. Authentication and scope filtering stay with that process.
export function createWorkspaceDataServer({upstream='http://127.0.0.1:3101',fetchImpl=fetch}={}){
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"readOnly":true}');return;}
  if(url.pathname!=='/api/data'){res.writeHead(404);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  const projection=url.searchParams.get('projection');
  if(projection&&!['summary','relations','full'].includes(projection)){res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":"页面数据范围无效"}');return;}
  const abort=new AbortController(),closed=()=>{if(!res.writableFinished)abort.abort();};res.on('close',closed);
  try{
   const source=await fetchImpl(upstream+'/api/data'+url.search,{headers:{cookie:req.headers.cookie||'','accept-encoding':'identity'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(120000)])});
   const type=source.headers.get('content-type')||'application/json; charset=utf-8';
   if(!source.ok||!projection){res.writeHead(source.status,{'Content-Type':type});await pipeline(Readable.fromWeb(source.body),res);return;}
   const snapshot=await source.json();
   // The main service may already support native projections after a normal
   // restart. Preserve its original scope counts and avoid projecting twice.
   const payload=snapshot.projection===projection?snapshot:workspaceData(snapshot,projection);
   const json=JSON.stringify(payload),encoded=/\bgzip\b/.test(req.headers['accept-encoding']||'');
   const bytes=encoded?await compress(json):Buffer.from(json);
   if(abort.signal.aborted)return;
   res.writeHead(200,{'Content-Type':type,Vary:'Accept-Encoding',...(encoded?{'Content-Encoding':'gzip'}:{})});res.end(bytes);
  }catch(error){
   if(!abort.signal.aborted&&!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"页面资料暂不可用，请稍后重试"}');}
  }finally{res.off('close',closed);}
 });
}
