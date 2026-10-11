// Apply bounded changes against either the local tree or the current server tree.
const fs=require('fs'),path=require('path');const root=process.argv[2]||process.cwd();
function patch(file,marker,work){const p=path.join(root,file);let s=fs.readFileSync(p,'utf8');if(s.includes(marker))return;const replace=(a,b)=>{if(!s.includes(a))throw Error('Missing anchor in '+file+': '+a.slice(0,70));s=s.replace(a,b);};work(replace);fs.writeFileSync(p,s);}
patch('intelligence/scheduler.mjs',"'iea-datasets.mjs'",r=>r("'open-datasets.mjs','import-mp2rss.mjs'","'open-datasets.mjs','iea-datasets.mjs','import-mp2rss.mjs'"));
patch('intelligence/scheduler.mjs','IEA_DATA_HOME:',r=>r('INTEL_DATA_DIR:stage,','INTEL_DATA_DIR:stage,IEA_DATA_HOME:process.env.IEA_DATA_HOME||path.join(dir,\'iea\'),'));
patch('intelligence/quant-routes.mjs',"route==='api/iea-file'",r=>{
 r("if(route==='api/catalog'){",`if(route==='api/iea-file'){
 const hash=url.searchParams.get('hash')||'';
 if(!/^[a-f0-9]{64}$/.test(hash)||!(raw.ieaDatasets?.history||[]).some(h=>h.hash===hash)){res.writeHead(404);res.end();return true;}
 const home=process.env.IEA_DATA_HOME||path.join(process.env.INTEL_DATA_DIR||'.data/intelligence','iea');
 try{const bytes=await fs.readFile(path.join(home,'archive',hash+'.xlsx'));res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="IEA-'+hash.slice(0,12)+'.xlsx"');res.end(bytes);}catch{res.writeHead(404);res.end();}return true;
 }
 if(route==='api/catalog'){
 `);
 r('auditDocuments,production:true','auditDocuments,iea:raw.ieaDatasets||null,production:true');
 r("'template-demos.js','charts.js'","'template-demos.js','iea-view.js','charts.js'");
});
patch('intelligence/quant-preview/app.js',"from './iea-view.js'",r=>{
 r("import {demoOption}","import {mountIEA} from './iea-view.js';\nimport {demoOption}");
 r("function clearCharts(){", "let disposeIEA;\nif(!root.querySelector('[data-tab=iea]'))root.querySelector('[data-tab=inventory]')?.insertAdjacentHTML('beforebegin','<button data-tab=\"iea\">IEA 数据集</button>');\nfunction clearCharts(){disposeIEA?.();disposeIEA=null;");
 r("tab==='templates'?templateLibrary():audit()","tab==='templates'?templateLibrary():tab==='iea'?'<div id=\"iea-datasets\"></div>':audit()");
 r("else if(tab==='templates')drawDemos();}","else if(tab==='templates')drawDemos();else if(tab==='iea')disposeIEA=mountIEA($('#iea-datasets'),data.iea,{...Object.fromEntries(new URLSearchParams(queryString)),...(topic?{topic}:{})},themeTarget.dataset.theme==='dark');}");
});
patch('intelligence/quant-routes.mjs',"route==='api/iea-data'",r=>{
 r("if(route==='api/iea-file'){", "if(route==='api/iea-data'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(raw.ieaDatasets||{}));return true;}\n if(route==='api/iea-file'){");
 r('iea:raw.ieaDatasets||null,','');
 r('filtered=filterData(raw,filters)','filtered=filterData({...raw,ieaDatasets:undefined},filters)');
 r('classifySnapshot({...raw,documents:[]},config)','classifySnapshot({...raw,ieaDatasets:undefined,documents:[]},config)');
});
patch('intelligence/quant-routes.mjs','feedCandidates:',r=>r('JSON.stringify(raw.ieaDatasets||{})',"JSON.stringify({...raw.ieaDatasets,feedCandidates:Object.values(raw.sourceCandidates||{}).filter(r=>r.sourceId?.startsWith('iaea-')),feedSources:raw.sources.filter(s=>s.id?.startsWith('iaea-'))})"));
patch('intelligence/quant-routes.mjs',"from 'node:zlib'",r=>{
 r("import {selectRegistries}","import {gzipSync} from 'node:zlib';\nimport {selectRegistries}");
 r("res.end(JSON.stringify({...raw.ieaDatasets,feedCandidates:Object.values(raw.sourceCandidates||{}).filter(r=>r.sourceId?.startsWith('iaea-')),feedSources:raw.sources.filter(s=>s.id?.startsWith('iaea-'))}));", "const body=JSON.stringify({...raw.ieaDatasets,feedCandidates:Object.values(raw.sourceCandidates||{}).filter(r=>r.sourceId?.startsWith('iaea-')),feedSources:raw.sources.filter(s=>s.id?.startsWith('iaea-'))});res.setHeader('Vary','Accept-Encoding');if(/\\bgzip\\b/.test(req.headers['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');res.end(gzipSync(body));}else res.end(body);");
});
patch('intelligence/expanded-sources.mjs',"id:'iaea-news'",r=>{
 r('export const profiles=[',`export const profiles=[
 {id:'iaea-news',name:'IAEA 官方新闻',country:'GLOBAL',level:'S1',url:'https://www.iaea.org/feeds/topnews',method:'rss',scope:'发现近期新闻并抓取正文；仅海洋能源相关内容进入后续六领域分类，其余保留候选'},
 {id:'iaea-publications',name:'IAEA 出版物',country:'GLOBAL',level:'S1',url:'https://www.iaea.org/feeds/publications',method:'rss',scope:'出版物介绍页及报告链接；仅发现 PDF 不代表已提取量化数据'},`);
 r('for(const value of candidates){if(!value)continue;const raw=String(value)',"for(let value of candidates){if(!value)continue;const short=String(value).match(/^(\\d{2})-(\\d{2})-(\\d{2})\\s/);if(short)value='20'+short[1]+'-'+short[2]+'-'+short[3];const raw=String(value)");
 r('data.errors||=[];const now=', 'data.errors||=[];data.sourceCandidates||={};const now=');
 r('({url:x.link,date:x.pubDate})','({url:p.id.startsWith(\'iaea-\')?String(x.link).replace(/^http:/,\'https:\'):x.link,date:x.pubDate,title:x.title})');
 r("if(!marine(content)){report.notRelevant++;continue;}",`if(!(p.id.startsWith('iaea-')?/offshore|subsea|marine|maritime|ocean|floating nuclear|desalination/i.test(content):marine(content))){report.notRelevant++;if(p.id.startsWith('iaea-'))data.sourceCandidates[c.url]={sourceId:p.id,url:c.url,title:c.title||'',publishedAt:dates.date,checkedAt:now,status:'unmatched',reason:'未发现海洋能源语境；不进入业务图表'};continue;}`);
});
patch('intelligence/expanded-sources.mjs',"status:'pending-body'",r=>{
 r('report.discovered=candidates.length;',`report.discovered=candidates.length;
   if(p.id.startsWith('iaea-'))for(const c of candidates){const date=parsePublication(parseHTML('<html></html>').document,c.date).date;if(!data.documents.some(d=>d.url===c.url))data.sourceCandidates[c.url]={sourceId:p.id,url:c.url,title:c.title||'',publishedAt:date,publishedOriginal:c.date,checkedAt:now,status:'pending-body',reason:'仅 RSS 元数据；正文尚未核验，不进入业务图表'};}`);
 r('for(const c of candidates){const udate=',`for(const c of candidates){if(p.id.startsWith('iaea-')){const date=data.sourceCandidates[c.url]?.publishedAt;if(date&&(date<cutoff||date>now.slice(0,10))){report.outsideWindow++;data.sourceCandidates[c.url].status='outside-window';data.sourceCandidates[c.url].reason='超出近90天采集范围，保留 RSS 线索';continue;}}const udate=`);
 r('await upsert(doc,raw);report.newDocuments++;',"await upsert(doc,raw);if(p.id.startsWith('iaea-'))delete data.sourceCandidates[c.url];report.newDocuments++;");
 r("}catch{report.failed++;data.errors.push", "}catch{if(p.id.startsWith('iaea-')&&data.sourceCandidates[c.url])Object.assign(data.sourceCandidates[c.url],{status:'body-unavailable',reason:'正文访问受限或解析失败；仅 RSS 线索，不进入业务图表'});report.failed++;data.errors.push");
});
console.log('IEA and IAEA integration anchors applied');
