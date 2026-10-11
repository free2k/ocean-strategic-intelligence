import fs from 'node:fs/promises';
import path from 'node:path';
import {filterData,overview,countries,topics} from '../core.mjs';
import {translatedData} from '../title-translations.mjs';
import {selectSeries} from '../series-evidence.mjs';
// Read-only preview of the actual dashboard assets. No production API or model calls.
export async function dashboardPreview(req,res,snapshot,publicRoot){
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/dashboard/'))return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;};
 if(req.method!=='GET')return send(405,{error:'本地只读预览不支持此操作'});
 const route=url.pathname.slice('/dashboard/'.length);
 if(route.startsWith('api/')){
  if(route==='api/session')return send(200,{authenticated:true,modelReady:false});
  if(route==='api/research')return send(200,[]);
  const raw=JSON.parse(await fs.readFile(snapshot,'utf8')),all=translatedData(raw),filters=Object.fromEntries(url.searchParams),data=filterData(all,filters);
  if(route==='api/options'){const scope=filterData(all,{...filters,country:''});return send(200,{dashboard:countries.filter(c=>scope.events.some(e=>e.countries.includes(c.code))),graph:countries.filter(c=>scope.events.some(e=>e.countries.includes(c.code))),analysis:countries.filter(c=>selectSeries(raw,{...filters,country:''}).some(s=>s.country===c.code))});}
  if(route==='api/data')return send(200,{...data,...overview(data),countryOptions:countries,topics,series:selectSeries(raw,filters),backend:'local-preview',collection:{running:false,enabled:false},processing:raw.processing||{}});
  if(route.startsWith('api/document/')){const id=route.slice('api/document/'.length),doc=all.documents.find(d=>d.id===id);if(!doc)return send(404,{error:'资料不存在'});return send(200,{...doc,...Object.fromEntries(['evidence','events','relations','observations'].map(k=>[k,all[k].filter(r=>r.documentId===id)]))});}
  return send(404,{error:'本地预览未提供此接口'});
 }
 const asset=route||'index.html';if(!/^[\w.-]+\.(?:html|js|css|json|png|svg)$/.test(asset))return send(404,{error:'未找到资源'});
 try{let content=await fs.readFile(path.join(publicRoot,asset));if(asset==='index.html')content=Buffer.from(content.toString().replace('<main>','<main><div class="notice">本地地图预览 · 不写入线上数据 · <a href="/">返回量化模板库 ↗</a></div>'));
 const ext=path.extname(asset);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[ext]+'; charset=utf-8');res.end(content);return true;}catch{return send(404,{error:'未找到资源'});}
}
