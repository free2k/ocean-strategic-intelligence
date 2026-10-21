import {readTaskWorkspace as readSnapshot,saveTaskWorkspace} from './task-workspace.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {parseHTML} from 'linkedom';import {Readability} from '@mozilla/readability';import {XMLParser} from 'fast-xml-parser';
import {getResource} from './net.mjs';import {id,clean,canonical,chunks,mergeRecords} from './core.mjs';import {ruleExtract} from './rules.mjs';
export const profiles=[
 {id:'iaea-news',name:'IAEA 官方新闻',country:'GLOBAL',level:'S1',url:'https://www.iaea.org/feeds/topnews',method:'rss',scope:'发现近期新闻并抓取正文；仅海洋能源相关内容进入后续六领域分类，其余保留候选'},
 {id:'iaea-publications',name:'IAEA 出版物',country:'GLOBAL',level:'S1',url:'https://www.iaea.org/feeds/publications',method:'rss',scope:'出版物介绍页及报告链接；仅发现 PDF 不代表已提取量化数据'},
 {id:'boem-news',name:'BOEM 官方新闻',country:'US',level:'S1',url:'https://www.boem.gov/webteam/rss/boem-rss.xml',method:'rss',scope:'BOEM 新闻 RSS 发现近90天文章；采集可访问正文，随后自动翻译、提取并执行原六大类别规则；RSS 摘要不冒充全文'},
 {id:'boem-policy',name:'BOEM 可再生能源法规索引',country:'US',level:'S1',url:'https://www.boem.gov/renewable-energy/rules-development-and-interim-policy',method:'web-index',scope:'历史法规与临时政策索引，定期检查修订；不是最新新闻，索引读取日期不作为政策发布日期或生效日期'},
 {id:'equinor',name:'Equinor',country:'NO',level:'S2',url:'https://www.equinor.com/news',pattern:/^\/news\/\d{8}-/,scope:'官网当前新闻列表；海上油气、CCS与海上新能源相关正文，不代表历史全量'},
 {id:'nsta',name:'英国北海转型管理局 NSTA',country:'GB',level:'S1',url:'https://www.nstauthority.co.uk/news-publications/',pattern:/^\/news-publications\/[^/]+\/$/,scope:'监管新闻与报告介绍页；海上生产、退役、许可相关内容；未解析全部PDF'},
 {id:'iea-oes',name:'IEA-OES 海洋能源系统',country:'GLOBAL',level:'S3',url:'https://www.ocean-energy-systems.org/',pattern:/^\/news\/[^/]+\/$/,scope:'官网首页发现的海洋能新闻；波浪、潮汐、温差能及研究合作'},
 {id:'imo',name:'国际海事组织 IMO',country:'GLOBAL',level:'S1',url:'https://www.imo.org/en/MediaCentre/PressBriefings/Pages/Default.aspx',pattern:/\/pressbriefings\/pages\/(?!default)[^/]+\.aspx$/i,scope:'官方新闻稿中能源航道与海运低碳相关内容；作为背景资料，不等同项目事件'},
 {id:'exxon-ir',name:'ExxonMobil 投资者公告',country:'US',level:'S2',url:'https://investor.exxonmobil.com/company-information/press-releases/rss',method:'rss',scope:'投资者公告RSS中的海洋能源相关正文；不覆盖集团全部项目新闻'},
 {id:'boem',name:'美国海洋能源管理局 BOEM',country:'US',level:'S1',url:'https://www.boem.gov/renewable-energy/lease-and-grant-information',method:'web-table',scope:'可再生能源租约公开表快照；含历史/失效租约，不代表全部当前有效许可'}
].map(s=>({...s,language:'en',method:s.method||'web'}));
export function parsePublication(document,fallback){
 const candidates=[...document.querySelectorAll('meta[property="article:published_time"],meta[name="date"],meta[name="pubdate"],time[datetime]')].map(x=>x.getAttribute('content')||x.getAttribute('datetime'));
 for(const el of document.querySelectorAll('[class*=date]'))candidates.push(clean(el.textContent));
 candidates.push(fallback);
 for(let value of candidates){if(!value)continue;const short=String(value).match(/^(\d{2})-(\d{2})-(\d{2})\s/);if(short)value='20'+short[1]+'-'+short[2]+'-'+short[3];const raw=String(value),iso=raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);const ms=Date.parse(iso?iso[1]:raw.replace(/\bSept\b/,'Sep') + (/([+-]\d{2}:?\d{2}|GMT|UTC|Z)$/i.test(raw.trim())?'':' UTC'));if(Number.isFinite(ms))return {date:new Date(ms).toISOString().slice(0,10),raw};}
 return {date:null,raw:null};
}
export function parseLeases(document,base){
 const table=[...document.querySelectorAll('table')].find(t=>/Lease or Grant Number/.test(t.textContent));
 if(!table)throw Error('Lease table schema changed');
 const rows=[];for(const tr of table.querySelectorAll('tr')){const cells=[...tr.querySelectorAll('td')].map(x=>clean(x.textContent));if(!cells.length)continue;if(cells.length!==7||!/^OCS-/.test(cells[0]))throw Error('Unexpected lease row');const link=tr.querySelector('a[href]');rows.push({lease:cells[0],project:cells[1],authorization:cells[2],resource:cells[3],effectiveYear:cells[4],lessee:cells[5],status:cells[6],sourceUrl:link?new URL(link.getAttribute('href'),base).href:base,raw:cells});}
 if(!rows.length)throw Error('No lease rows');return rows;
}
export function nonResearchTitle(title){return /board of directors|cash dividend|ex\. dividend|share buy.back|prior to financial reporting|recruitment drive/i.test(title)||(/energy storage|power market/i.test(title)&&!marine(title));}
export function marine(text){return /offshore|subsea|North Sea|\bLNG\b|liquefied natural gas|Gullfaks|Troll|ocean (?:thermal|energy)|marine energy|wave energy|tidal|\bHormuz\b|\bSuez\b|\bCCS\b|carbon capture|decommission/i.test(text);}
export async function collectExpanded(dir,{sourceIds=null}={}){
 const file=path.join(dir,'snapshot.json');const data=await readSnapshot(file);data.errors||=[];data.sourceCandidates||={};const now=new Date().toISOString(),cutoff=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
 const save=async()=>{await saveTaskWorkspace(file,data);};
 for(const p of profiles.filter(p=>!sourceIds||sourceIds.includes(p.id))){const report={...p,pattern:undefined,checkedAt:now,status:'ready',newDocuments:0,discovered:0,duplicate:0,notRelevant:0,outsideWindow:0,failed:0};data.errors=data.errors.filter(e=>e.sourceId!==p.id);try{
  const html=await getResource(p.url);let candidates=[];
  if(p.id==='boem'){
   const {document}=parseHTML(html);const rows=parseLeases(document,p.url);report.records=rows.length;
   const content=rows.map(x=>x.raw.join(' | ')).join('\n');
   const doc=makeDoc(p,p.url,'BOEM renewable energy leases and grants — table snapshot',content,null,null);
   doc.titleZh='BOEM 海上可再生能源租约登记表';doc.summaryZh=`公开表共${rows.length}条记录，含历史和失效租约；租约生效年份不是文章发布日期，状态以本次快照为准。`;doc.topic='海上风电';doc.extraction={events:[],entities:[],relations:[],observations:[],evidence:[]};
   for(const row of rows){const quote=row.raw.join(' | '),eid=id('ev',doc.versionId+quote);doc.extraction.evidence.push({id:eid,documentId:doc.id,versionId:doc.versionId,quote,start:content.indexOf(quote)});for(const [name,type] of [[row.project,'项目'],[row.lessee,'公司']])if(name)doc.extraction.entities.push({id:id('en',type+name.toLowerCase()),name,nameZh:name,type,evidenceIds:[eid]});}
   data.assetRegistries={...(data.assetRegistries||{}),boem:{checkedAt:now,sourceUrl:p.url,rows}};
   if(await upsert(doc,html))report.newDocuments=1;else report.duplicate++;
  }else if(p.id==='boem-policy'){
   const {document}=parseHTML(html),parsed=new Readability(document.cloneNode(true)).parse(),content=clean(parsed?.textContent);if(content.length<150)throw Error('Policy index body missing');
   const doc=makeDoc(p,p.url,clean(parsed?.title||'BOEM Rules Development and Interim Policy'),content,null,null);doc.topic='宏观政策';doc.extraction=ruleExtract(doc);doc.historicalIndex=true;doc.references=[...document.querySelectorAll('main a[href]')].flatMap(a=>{try{const url=new URL(a.getAttribute('href'),p.url);return /^https?:$/.test(url.protocol)?[{url:url.href,label:clean(a.textContent)}]:[];}catch{return[];}});
   if(await upsert(doc,html))report.newDocuments++;else report.duplicate++;
  }else{
   if(p.method==='rss'){const raw=new XMLParser().parse(html).rss?.channel?.item;if(!raw)throw Error('Invalid RSS');candidates=(Array.isArray(raw)?raw:[raw]).map(x=>({url:p.id.startsWith('iaea-')?String(x.link).replace(/^http:/,'https:'):x.link,date:x.pubDate,title:x.title}));}
   else{const {document}=parseHTML(html);candidates=[...document.querySelectorAll('a[href]')].flatMap(a=>{try{const u=new URL(a.getAttribute('href'),p.url);return u.hostname===new URL(p.url).hostname&&p.pattern.test(u.pathname)?[{url:u.href}]:[];}catch{return[];}});}
   candidates=[...new Map(candidates.map(c=>[canonical(c.url),{...c,url:canonical(c.url)}])).values()];report.discovered=candidates.length;
   if(p.id.startsWith('iaea-'))for(const c of candidates){const date=parsePublication(parseHTML('<html></html>').document,c.date).date;if(!data.documents.some(d=>d.url===c.url))data.sourceCandidates[c.url]={sourceId:p.id,url:c.url,title:c.title||'',publishedAt:date,publishedOriginal:c.date,checkedAt:now,status:'pending-body',reason:'仅 RSS 元数据；正文尚未核验，不进入业务图表'};}
   if(!candidates.length)throw Error('No article links discovered');
   for(const c of candidates){if(p.id.startsWith('iaea-')){const date=data.sourceCandidates[c.url]?.publishedAt;if(date&&(date<cutoff||date>now.slice(0,10))){report.outsideWindow++;data.sourceCandidates[c.url].status='outside-window';data.sourceCandidates[c.url].reason='超出近90天采集范围，保留 RSS 线索';continue;}}const udate=c.url.match(/\/news\/(20\d{2})(\d{2})(\d{2})-/);if(udate&&`${udate[1]}-${udate[2]}-${udate[3]}`<cutoff){report.outsideWindow++;continue;}if(data.documents.some(d=>d.url===c.url)){report.duplicate++;continue;}try{
    const raw=await getResource(c.url);const {document}=parseHTML(raw);const dates=parsePublication(document,c.date);if(dates.date&&(dates.date<cutoff||dates.date>now.slice(0,10))){report.outsideWindow++;continue;}
    const parsed=new Readability(document.cloneNode(true)).parse();const article=p.id==='equinor'?[...document.querySelectorAll('article')].find(x=>x.textContent.length>500):null;
    const content=clean(article?.textContent||parsed?.textContent);if(content.length<150)throw Error('No article body');if(!(p.id.startsWith('iaea-')?/offshore|subsea|marine|maritime|ocean|floating nuclear|desalination/i.test(content):marine(content))){report.notRelevant++;if(p.id.startsWith('iaea-'))data.sourceCandidates[c.url]={sourceId:p.id,url:c.url,title:c.title||'',publishedAt:dates.date,checkedAt:now,status:'unmatched',reason:'未发现海洋能源语境；不进入业务图表'};continue;}
    const title=clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content')||parsed?.title||document.querySelector('h1')?.textContent);
    if(nonResearchTitle(title)){report.notRelevant++;continue;}const doc=makeDoc(p,c.url,title,content,dates.date,dates.raw);doc.extraction=ruleExtract(doc);doc.topic=doc.extraction.topic;doc.summaryZh=doc.extraction.summaryZh;
    await upsert(doc,raw);if(p.id.startsWith('iaea-'))delete data.sourceCandidates[c.url];report.newDocuments++;
   }catch{if(p.id.startsWith('iaea-')&&data.sourceCandidates[c.url])Object.assign(data.sourceCandidates[c.url],{status:'body-unavailable',reason:'正文访问受限或解析失败；仅 RSS 线索，不进入业务图表'});report.failed++;data.errors.push({sourceId:p.id,url:c.url,error:'正文或日期解析失败，保留旧资料',at:now});}}
  }
 }catch(e){report.status='failed';report.error=e.message==='Source fetch failed'?'访问失败或超时':e.message;data.errors.push({sourceId:p.id,url:p.url,error:report.error,at:now});}
 if(report.failed&&report.status!=='failed')report.status='partial';
 data.sources=[...data.sources.filter(s=>s.id!==p.id),report];data.generatedAt=new Date().toISOString();await save();console.log(JSON.stringify({source:p.id,status:report.status,newDocuments:report.newDocuments,discovered:report.discovered,records:report.records,notRelevant:report.notRelevant,outsideWindow:report.outsideWindow,failed:report.failed,error:report.error}));
 }
 function makeDoc(p,url,title,content,publishedAt,publishedOriginal){return {id:id('doc',url),versionId:id('ver',url+content),contentHash:id('sha',content),sourceId:p.id,url,title,titleZh:title,content,language:'en',publishedAt,publishedOriginal,publishedPrecision:publishedAt?'day':'unknown',collectedAt:now,originalPublisher:p.name,chunks:chunks(content),topic:'海洋油气',translationType:'英文原文；中文翻译由独立任务处理',extractionStatus:'candidate',extractionVersion:'rules-v1'};}
 async function upsert(doc,raw){const old=data.documents.find(d=>d.id===doc.id);if(old?.versionId===doc.versionId)return false;data.documents=data.documents.filter(d=>d.id!==doc.id);data.documents.push(doc);for(const k of ['events','relations','observations','evidence'])data[k]=[...data[k].filter(x=>x.documentId!==doc.id),...(doc.extraction[k]||[])];data.entities=mergeRecords([...data.entities,...doc.extraction.entities]);await fs.writeFile(path.join(dir,doc.versionId+'.html'),raw);return true;}
 return data;
}
if(process.argv[1]?.endsWith('expanded-sources.mjs'))await collectExpanded(process.env.INTEL_DATA_DIR||'.data/intelligence');
