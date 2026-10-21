import {createHash} from 'node:crypto';
import http from 'node:http';
import {TaskJournal} from './research/task-journal.mjs';
import path from 'node:path';

export async function createProcessingClient({store,serial,dir}){
 const origin=process.env.INTEL_PROCESSING_URL||'http://127.0.0.1:3105';
 const token=createHash('sha256').update('processing-worker:'+process.env.SITE_PASSWORD).digest('hex');
 let state={running:false,enabled:true,workerAvailable:false},closed=false;
 const request=async(route,method='GET')=>{
  const response=await fetch(origin+route,{method,headers:{'x-processing-token':token},signal:AbortSignal.timeout(5000)});
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'后台处理暂不可用'),{status:response.status});return result;
 };
 const poll=async()=>{
  try{state={...await request('/status'),workerAvailable:true};}catch{state={...state,workerAvailable:false};}
  try{await serial(()=>store.refresh());}catch(error){console.error('Workspace refresh:',error.code||error.name);}
  if(!closed){const timer=setTimeout(poll,5000);timer.unref();}
 };
 void poll();
 return {
  status:()=>state,journal:new TaskJournal(path.join(dir,'research-tasks')),
  run:async({processOnly=false}={})=>{const result=await request('/run?mode='+(processOnly?'processing':'collection'),'POST');state={...state,running:true};return result;},
  close:()=>{closed=true;},
  async proxy(req,res,url){
   if(!url.pathname.startsWith('/api/processing-runs'))return false;
   // Stream bounded request/response bodies; preserve the worker's HTTP status.
   const upstream=http.request(new URL(url.pathname+url.search,origin),{method:req.method,headers:{'content-type':'application/json','x-processing-token':token},timeout:30000},response=>{
    res.writeHead(response.statusCode,{'Content-Type':'application/json','Cache-Control':'no-store'});response.pipe(res);
   });
   upstream.on('timeout',()=>upstream.destroy(Error('worker timeout')));
   upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'后台处理服务暂不可用；已有网站数据保留'}));}else res.destroy();});
   req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return true;
  }
 };
}
