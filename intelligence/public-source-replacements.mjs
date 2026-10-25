import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import XLSX from 'xlsx';
import pg from 'pg';
import {getResource} from './net.mjs';
import {readTaskWorkspace,saveTaskWorkspace} from './task-workspace.mjs';
import {id,clean,chunks} from './core.mjs';

export const replacementProfiles=[
 {id:'wnn-marine-news',replaces:'iaea-news',name:'世界核新闻 · 海上核能',country:'GLOBAL',level:'S4',method:'rss',url:'https://www.world-nuclear-news.org/rss',scope:'替代受访问限制的 IAEA 新闻；核能行业新闻中的浮动核电、核动力船舶、海水淡化与海水资源。行业报道，非 IAEA 官方公告。'},
 {id:'wna-marine-reference',replaces:'iaea-publications',name:'世界核协会 · 海上核能技术资料',country:'GLOBAL',level:'S3',method:'web-reference',url:'https://world-nuclear.org/information-library/non-power-nuclear-applications/industry/nuclear-desalination',pages:['https://world-nuclear.org/information-library/non-power-nuclear-applications/industry/nuclear-desalination','https://world-nuclear.org/information-library/non-power-nuclear-applications/transport/nuclear-powered-ships'],scope:'替代受访问限制的 IAEA 出版物；公开技术资料覆盖核能海水淡化与核动力船舶，保留参考文献；不是 IAEA 出版目录。'},
 {id:'eho-hydrogen',replaces:'iea-hydrogen-production-and-infrastructure-projects-database',name:'欧洲氢能观察站 · 氢能项目与产能',country:'GLOBAL',level:'S1',method:'public-xlsx',url:'https://observatory.clean-hydrogen.europa.eu/hydrogen-landscape/production-trade-and-cost/hydrogen-production',scope:'替代需登录的 IEA 氢能工作簿；欧洲公开氢能装置清单、产能和产量原表。地区、年份、技术和单位按原表保存，不等同全球项目库，不将欧洲总量解释为海洋能源指标。'},
 {id:'nsta-carbon-register',replaces:'iea-ccus-projects-database',name:'NSTA · 海上碳封存许可登记',country:'GB',level:'S1',method:'web-register',url:'https://www.nstauthority.co.uk/regulatory-information/carbon-storage/carbon-storage-public-register/',scope:'替代需登录的 IEA CCUS 工作簿；英国海上二氧化碳勘查、封存许可及修订原件索引。覆盖英国许可，非全球 CCUS 项目库；许可数量不等于在运项目或封存量。'},
 {id:'usgs-minerals',replaces:'iea-critical-minerals-dataset',name:'USGS · 关键矿产统计与报告',country:'GLOBAL',level:'S1',method:'web-report',url:'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf',discoverUrl:'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf',pages:['https://pubs.usgs.gov/publication/mcs2026'],scope:'替代需登录的 IEA 关键矿产工作簿；USGS 矿产商品统计报告介绍、版本与原始 PDF。涵盖产量、储量与贸易等，非 IEA 情景需求预测；未解析 PDF 数值不作为结构化指标。'}
];

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const marine=/floating|marine|maritime|desalination|seawater|naval|\bships?\b|offshore/i;
export function referenceText(html){
 const {document}=parseHTML(html);
 if(/just a moment|human verification|access denied|page not found|404 error/i.test(document.title))throw Error('访问验证或错误页面，不是正文');
 const parsed=new Readability(document.cloneNode(true)).parse();
 const title=clean(document.querySelector('h1')?.textContent||parsed?.title||document.title);
 const content=clean(parsed?.textContent);
 if(!title||content.length<150)throw Error('正文不足，拒绝将目录或摘要当成全文');
 return {document,title,content};
}
export function hydrogenRows(bytes,sourceUrl){
 if(bytes.subarray(0,2).toString()!=='PK')throw Error('无效氢能工作簿');
 const workbook=XLSX.read(bytes),sheet='Plant by plant data',table=workbook.Sheets[sheet];
 if(!table)throw Error('氢能工作簿结构已变化');
 const rows=XLSX.utils.sheet_to_json(table,{header:1,defval:null}),header=rows.findIndex(r=>r.includes('Project name')&&r.includes('Country')&&r.includes('Year'));
 if(header<0)throw Error('氢能工作簿列名已变化');
 const heads=rows[header].map(v=>clean(v||''));
 const result=[];
 for(let i=header+1;i<rows.length;i++){
  const values=Object.fromEntries(heads.flatMap((key,c)=>key?[[key,rows[i][c]]]:[]));
  if(!values['Project name']||!values.Country||!Number.isInteger(values.Year))continue;
  result.push({id:`eho-${i+1}`,project:values['Project name'],country:values.Country,technology:values['Process type'],year:values.Year,sheet,row:i+1,sourceUrl,raw:values,classification:{status:'unmatched',primary:null,reason:'欧洲氢能原表，尚未证明海洋能源专属范围'}});
 }
 if(!result.length)throw Error('氢能装置记录为空');
 return result;
}
export function carbonLicences(document,base){
 const found=new Map();
 for(const a of document.querySelectorAll('a[href]')){
  const href=new URL(a.getAttribute('href'),base);
  const label=clean(a.textContent),code=(label+' '+href.pathname).match(/\bCS\d{3}\b/i)?.[0]?.toUpperCase();
  if(href.hostname!==new URL(base).hostname||!code||!href.pathname.endsWith('.pdf'))continue;
  const row=found.get(code)||{id:code,licence:code,sourceUrl:base,documents:[]};
  if(!row.documents.some(d=>d.url===href.href))row.documents.push({label,url:href.href});
  found.set(code,row);
 }
 if(!found.size)throw Error('碳封存登记未发现许可原件');
 return [...found.values()];
}
function published(document,fallback){
 const value=document.querySelector('meta[property="article:published_time"],meta[name="citation_publication_date"],time[datetime]');
 const raw=value?.getAttribute('content')||value?.getAttribute('datetime')||fallback;
 const n=Date.parse(raw);return Number.isFinite(n)?new Date(n).toISOString():null;
}
function putDocument(data,p,url,html,fallback){
 const {document,title,content}=referenceText(html),now=new Date().toISOString();
 const doc={id:id('doc',url),sourceId:p.id,url,title,titleZh:title,content,contentHash:id('sha',content),versionId:id('ver',url+content),language:'en',publishedAt:published(document,fallback),collectedAt:now,publishedPrecision:fallback?'second':'unknown',originalPublisher:p.name,chunks:chunks(content),contentKind:p.method==='rss'?'news':'reference',translationType:'英文原文；按既有流程处理',extractionStatus:'candidate',extractionVersion:'source-replacement-v1',industry:{status:'unmatched',primary:null,reason:'来源正文已验证，沿用已发布行业规则进行后续分类'},extraction:{entities:[],events:[],relations:[],observations:[],evidence:[]}};
 const existing=data.documents.find(d=>d.id===doc.id);
 if(existing?.versionId===doc.versionId)return {doc:existing,document};
 data.documents=data.documents.filter(d=>d.id!==doc.id);data.documents.push(doc);
 return {doc,document};
}
export async function collectPublicReplacements(dir,{sourceIds=null,fetchResource=getResource}={}){
 const file=path.join(dir,'snapshot.json'),data=await readTaskWorkspace(file);
 data.sources||=[];data.documents||=[];data.errors||=[];data.assetRegistries||={};data.sourceReplacements||=[];
 for(const p of replacementProfiles.filter(p=>!sourceIds||sourceIds.includes(p.id))){
  const now=new Date().toISOString(),report={...p,pages:undefined,language:'en',checkedAt:now,status:'ready',failed:0,records:0};
  const staged=structuredClone({sources:[],documents:data.documents.filter(d=>d.sourceId===p.id)});
  try{
   if(p.method==='rss'){
    const xml=await fetchResource(p.url);if(XMLValidator.validate(xml)!==true)throw Error('无效 RSS');
    const items=new XMLParser().parse(xml)?.rss?.channel?.item;
    if(!Array.isArray(items)||!items.length)throw Error('RSS 没有内容');
    const cutoff=Date.now()-90*86400000;
    const candidates=items.filter(i=>marine.test(i.title||'')&&Date.parse(i.pubDate)>=cutoff&&Date.parse(i.pubDate)<=Date.now()).slice(-12);
    if(!candidates.length)throw Error('RSS 近90天未发现相关核能资讯');
    report.discovered=candidates.length;
    for(const item of candidates){const url=new URL(item.link);if(url.hostname!=='www.world-nuclear-news.org')throw Error('RSS 正文域名异常');const raw=await fetchResource(url.href);const {doc}=putDocument(staged,p,url.href,raw,item.pubDate);await fs.writeFile(path.join(dir,doc.versionId+'.html'),raw);}
   }else{
    for(const url of p.pages||[p.url]){
     const raw=await fetchResource(url),{doc,document}=putDocument(staged,p,url,raw);
     await fs.writeFile(path.join(dir,doc.versionId+'.html'),raw);
     if(p.id==='eho-hydrogen'){
      const links=[...document.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),url)).filter(u=>u.hostname===new URL(url).hostname&&u.pathname.endsWith('.xlsx')).sort((a,b)=>b.pathname.localeCompare(a.pathname));
      if(!links.length)throw Error('氢能工作簿下载链接缺失');
      const workbook=await fetchResource(links[0].href,true);if(workbook.length>40*1024**2)throw Error('工作簿超出大小限制');
      const rows=hydrogenRows(workbook,links[0].href),archive=`eho-hydrogen-${hash(workbook)}.xlsx`;
      await fs.writeFile(path.join(dir,archive),workbook);report.records=rows.length;report.downloadUrl=links[0].href;report.archive=archive;report.metricLabel='氢能装置登记';
      data.assetRegistries[p.id]={name:p.name,sourceId:p.id,country:p.country,sourceUrl:links[0].href,checkedAt:now,archive,contentHash:hash(workbook),note:p.scope,rows};
     }
     if(p.id==='nsta-carbon-register'){
      const rows=carbonLicences(document,url),sample=rows[0].documents[0].url,bytes=await fetchResource(sample,true);
      if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('许可原件不是有效 PDF');
      const archive=`nsta-carbon-sample-${hash(bytes)}.pdf`;await fs.writeFile(path.join(dir,archive),bytes);
      report.records=rows.length;report.metricLabel='碳封存许可';
      data.assetRegistries[p.id]={name:p.name,sourceId:p.id,country:p.country,sourceUrl:url,checkedAt:now,note:p.scope,sampleArchive:archive,sampleUrl:sample,rows};
     }
     if(p.id==='usgs-minerals'){
      const url=[...document.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),doc.url)).find(u=>u.hostname==='pubs.usgs.gov'&&/\/periodicals\/mcs20\d{2}\/mcs20\d{2}\.pdf$/.test(u.pathname));
      if(!url)throw Error('矿产报告原件链接缺失');
      const bytes=await fetchResource(url.href,true);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('矿产原件不是有效 PDF');
      const archive=`usgs-minerals-${hash(bytes)}.pdf`;await fs.writeFile(path.join(dir,archive),bytes);report.downloadUrl=url.href;report.archive=archive;
     }
    }
   }
   const own=staged.documents.filter(d=>d.sourceId===p.id);if(!own.length)throw Error('没有验证成功的正文');
   data.documents=[...data.documents.filter(d=>d.sourceId!==p.id),...own];
   report.articleCount=own.length;report.bodyDocuments=own.filter(d=>(d.content||'').length>=150).length;
   data.errors=data.errors.filter(e=>e.sourceId!==p.id&&e.sourceId!==p.replaces);
   const old=data.sources.find(s=>s.id===p.replaces);
   if(old){const archived={...old,lastCheckedAt:old.checkedAt||old.lastCheckedAt,checkedAt:null,status:'retired',retiredAt:old.retiredAt||now,replacedBy:p.id,retirementReason:p.scope};data.sources=data.sources.map(s=>s.id===p.replaces?archived:s);if(!data.sourceReplacements.some(r=>r.id===p.replaces))data.sourceReplacements.push({id:p.replaces,replacement:p.id,at:now,previous:old,reason:p.scope});}
  }catch(error){report.status='failed';report.error=error.message;report.failed=1;data.errors.push({sourceId:p.id,url:p.url,error:error.message,at:now});}
  data.sources=[...data.sources.filter(s=>s.id!==p.id),report];
  console.log(JSON.stringify({source:p.id,status:report.status,documents:report.articleCount,records:report.records,error:report.error}));
 }
 data.generatedAt=new Date().toISOString();await saveTaskWorkspace(file,data);return data;
}

// The OilPrice worker stores bodies in its evidence library, not public.articles.
// Retain that provenance and count the union by original URL for each feed.
export async function updateOilpriceMetrics(dir){
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return;
 const pool=new pg.Pool({connectionString,max:1}),file=path.join(dir,'snapshot.json');
 try{
  const state=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='oilprice-sync'")).rows[0]?.payload;if(!state)return;
  const evidence=(await pool.query(`SELECT payload->>'url' url,length(payload->>'content') length,payload->'origins' origins FROM mp2rss.evidence_documents WHERE payload->'origins' @> '[{"provider":"OilPrice RSS"}]'`)).rows;
  const local=(await pool.query(`SELECT a.link url,length(a.content) length,s.alias FROM public.articles a JOIN public.sources s ON s.id=a.source_id WHERE s.type='rss' AND s.alias LIKE 'https://oilprice.com/rss/%'`)).rows;
  const data=await readTaskWorkspace(file);
  for(const [key,suffix] of [['oilprice-main','main'],['oilprice-news','energy']]){
   const url='https://oilprice.com/rss/'+suffix,feed=state.feeds?.find(f=>f.url===url);if(!feed)continue;
   const rows=new Map();for(const r of [...local.filter(r=>r.alias===url),...evidence.filter(r=>r.origins.some(o=>o.feedUrl===url||o.subscriptionId===key))])rows.set(r.url,{length:Math.max(r.length||0,rows.get(r.url)?.length||0)});
   const source={id:key,name:feed.name,url,method:'rss',country:'GLOBAL',level:'S4',language:'en',status:feed.status==='success'?'ready':'failed',checkedAt:state.checkedAt,articleCount:rows.size,bodyDocuments:[...rows.values()].filter(r=>r.length>=150).length,scope:'OilPrice RSS 发现；原始正文保存在证据库，按原文 URL 与文章库去重统计。摘要和待抓取链接不计入正文。'};
   data.sources=[...data.sources.filter(s=>s.id!==key),source];
  }
  await saveTaskWorkspace(file,data);
 }finally{await pool.end();}
}
