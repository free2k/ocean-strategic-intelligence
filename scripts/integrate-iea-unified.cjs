const fs=require('fs'),path=require('path');const root=process.argv[2]||process.cwd();
function edit(file,fn){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(s.includes('IEA_UNIFIED_V1'))return;const out=fn(s);fs.writeFileSync(p,'// IEA_UNIFIED_V1\n'+out);}
function rep(s,a,b){if(!s.includes(a))throw Error('Missing anchor: '+a.slice(0,90));return s.replace(a,b);}
edit('intelligence/quant-routes.mjs',s=>{
 s="import {unifiedIEA,integrateIEACatalog} from './iea-quant.mjs';\n"+s;
 s=rep(s,"const filters=Object.fromEntries(url.searchParams),key=", "raw=unifiedIEA(raw);const filters=Object.fromEntries(url.searchParams),key=");
 s=rep(s,'auditDocuments,production:true};','auditDocuments,production:true};catalog=integrateIEACatalog(catalog,raw,filters);');
 s=rep(s,"res.end(JSON.stringify(catalog));return true;", "const payload=JSON.stringify(catalog);res.setHeader('Vary','Accept-Encoding');if(/\\bgzip\\b/.test(req.headers['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');res.end(gzipSync(payload));}else res.end(payload);return true;");
 return rep(s,"'iea-view.js'","'iea-view.js','official-charts.js'");
});
edit('intelligence/quant-preview/charts.js',s=>{
 s="import {officialOption} from './official-charts.js';\n"+s;
 s=rep(s,'export const typeNames={',"export const typeNames={countryBar:'按国家',statusBar:'按开发状态',");
 return rep(s," if(card.renderer==='registry-count'){"," const official=officialOption(card,type,base);if(official)return official;\n if(card.renderer==='registry-count'){");
});
edit('intelligence/quant-preview/app.js',s=>{
 s=rep(s,"import {mountIEA} from './iea-view.js';",'');
 s=s.replace(/let disposeIEA;\r?\n/, '').replace(/^if\(!root.querySelector\('\[data-tab=iea\]'\)\).*\r?\n/m,'');
 s=rep(s,'disposeIEA?.();disposeIEA=null;','');
 s=rep(s,"tab==='iea'?'<div id=\"iea-datasets\"></div>':",'');
 s=rep(s,"else if(tab==='iea')disposeIEA=mountIEA($('#iea-datasets'),data.iea,{...Object.fromEntries(new URLSearchParams(queryString)),...(topic?{topic}:{})},themeTarget.dataset.theme==='dark');",'');
 s=rep(s,"const labels={id:","const labels={object:'原表项目 / 阶段名称',countryName:'国家',statusName:'开发状态',metric:'原表指标',filename:'原始文件',release:'版本',sheet:'工作表',cell:'单元格',contentHash:'原文件指纹',id:");
 s=rep(s,"['reports','已发现报告索引']","['official','官方数据集记录（含候选）'],['reports','已发现报告索引']");
 s=rep(s,"function getRecords(){let rows=[];","function getRecords(){let rows=[];if(kind==='official')rows=data.officialRecords||[];");
 s=rep(s,'<h2>全部源数据清单</h2>','<h2>全部源数据清单</h2>${datasetFiles()}');
 s=rep(s,"function inventory(){",`function datasetFiles(){return '<details><summary>官方工作簿与版本 · '+(data.datasetVersions||[]).length+' 份</summary><p class="muted">项目快照不按采集日冒充统计期；设置日期区间时，无统计期记录不参与筛选结果。登记条数按原表行去重，容量不加总。</p>'+ (data.datasetVersions||[]).map(d=>'<p>'+esc(d.filename)+' · '+esc(d.release)+' · 最近检查 '+esc(d.checkedAt)+' <a href="quant/api/iea-file?hash='+esc(d.hash)+'">下载原表</a></p>').join('')+'</details>';}
function inventory(){`);
 s=rep(s,"function gallery(){const cards=", "function gallery(){const cards=");
 s=rep(s,'<div class="note">已匹配 ${cards.length}', '<div class="note">${data.ieaSummary?.records?`官方数据集：${data.ieaSummary.accepted} 条指标 / 登记数据纳入，${data.ieaSummary.projects} 条项目／阶段登记（按原表行去重）；${data.ieaSummary.candidates} 条候选留在数据明细。单条登记不强行出图。 `:""}已匹配 ${cards.length}');
 return s;
});
edit('intelligence/server.mjs',s=>{
 s="import {unifiedIEA,ieaSummary} from './iea-quant.mjs';\n"+s;
 s=s.replaceAll('translatedData(store.data)','translatedData(unifiedIEA(store.data))');
 return rep(s,'sources:store.data.sources,countryOptions:', 'officialSummary:ieaSummary(store.data,filters),sources:unifiedIEA(store.data).sources,countryOptions:');
});
edit('intelligence/public/app.js',s=>{
 s=rep(s,"countHelp('已登记渠道 '+data.sources.length", "countHelp('官方数据集 '+(data.officialSummary?.accepted||0)+' 条', '通过行业规则的官方工作簿记录；按原表行去重的项目／阶段登记 '+(data.officialSummary?.projects||0)+' 条，另有候选 '+(data.officialSummary?.candidates||0)+' 条；不表示统计时序或已建容量。'),countHelp('已登记渠道 '+data.sources.length");
 s=rep(s,'<p>${esc(s.scope)}</p>', '<p>${esc(s.scope)}</p>${s.id===\'iea\'?\'<p>官方工作簿：\'+(data.officialSummary?.accepted||0)+\' 条纳入 · \'+(data.officialSummary?.projects||0)+\' 条项目／阶段登记 · \'+(data.officialSummary?.candidates||0)+\' 条候选。数据复用于量化分析，逐条保留工作表、单元格与版本。</p>\':\'\'}');
 s=rep(s,"s.method==='manual'?'人工录入链接与原文片段'", "s.method==='dataset-and-news'?'登录授权工作簿下载 + Mp2RSS 资讯':s.method==='manual'?'人工录入链接与原文片段'");
 return rep(s,"s.id.startsWith('mp2rss_')?'每30分钟采集；主题通过后自动投递分析'", "s.id==='iea'?'数据集每7天检查版本；资讯每30分钟采集':s.id.startsWith('mp2rss_')?'每30分钟采集；主题通过后自动投递分析'");
});
console.log('Unified IEA integration patched');
