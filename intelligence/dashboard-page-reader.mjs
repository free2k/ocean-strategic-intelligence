import {dashboardOverview,dashboardThemes} from './dashboard-overview.mjs';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import {packDashboard} from './public/dashboard-codec.mjs';
import {authenticated} from './sensing-page-reader.mjs';
export function createDashboardPageReader({cache,auth={},world=[],assets=async()=>null}){
 const encoded=new Map(),worldRaw=Buffer.from(JSON.stringify(world)),worldGzip=gzipSync(worldRaw);
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Dashboard-Reader','1');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  let url;try{url=new URL(req.url,'http://localhost');}catch{return send(400,{error:'无效的读取地址'});}
  if(url.pathname.startsWith('/assets/')){
   if(req.method!=='GET')return send(405,{error:'公共文件只接受 GET'});
   try{const asset=await assets(url.pathname.slice(8));if(!asset)return send(404,{error:'文件不存在'});res.setHeader('ETag',asset.etag);res.setHeader('Cache-Control','public, no-cache');res.setHeader('Vary','Accept-Encoding');if(req.headers['if-none-match']===asset.etag){res.writeHead(304);return res.end();}const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});return res.end(gzip?asset.gzip:asset.raw);}catch{return send(404,{error:'文件不存在'});}
  }
  if(url.pathname==='/world.json'&&req.method==='GET'){const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.setHeader('Cache-Control','public, max-age=3600');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Vary':'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});return res.end(gzip?worldGzip:worldRaw);}
  if(url.pathname==='/health'&&req.method==='GET')return send(200,{ok:true,readOnly:true});
  if(!['/api/dashboard-page','/api/dashboard-freshness','/api/dashboard-themes'].includes(url.pathname))return send(404,{error:'页面不存在'});
  if(!authenticated(req,auth))return send(401,{error:'请先登录研究空间'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'国别读取接口只接受 GET'});}
  try{
   const params=Object.fromEntries(url.searchParams),ids=params.ids;if(url.pathname==='/api/dashboard-themes')delete params.ids;const force=params.refresh==='1';delete params.refresh;const page=await cache.get(params,force),freshness=url.pathname==='/api/dashboard-freshness';
   if(url.pathname==='/api/dashboard-themes'){const value=packDashboard(dashboardThemes(page,ids)),raw=Buffer.from(JSON.stringify(value)),gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});return res.end(gzip?gzipSync(raw):raw);}
   const tag='"dashboard-overview1-'+new Date(Date.now()+8*3600000).toISOString().slice(0,10)+'-'+page.dashboardView.version+(freshness?'-head':'')+(page.dashboardView.refreshing?'-checking':'')+(page.dashboardView.error?'-stale':'')+'"';res.setHeader('ETag',tag);res.setHeader('Vary','Accept-Encoding');
   if(req.headers['if-none-match']===tag){res.writeHead(304);res.end();return;}
   let bytes=encoded.get(tag);if(!bytes){const value=freshness?{releaseId:page.meta.releaseId,workspaceAt:page.meta.generatedAt}:packDashboard(dashboardOverview(page)),raw=Buffer.from(JSON.stringify(value));bytes={raw,gzip:gzipSync(raw)};if(encoded.size>=32)encoded.delete(encoded.keys().next().value);encoded.set(tag,bytes);}
   const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?bytes.gzip:bytes.raw);
  }catch(e){send(e.status||503,{message:e.status?e.message:'国别资料暂不可用，请稍后重试。',error:e.status?e.message:'国别资料暂不可用，请稍后重试。',code:e.status?e.code:'DASHBOARD_READ_UNAVAILABLE'});}
 });
}
