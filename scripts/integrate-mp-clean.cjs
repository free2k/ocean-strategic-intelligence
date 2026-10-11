const fs=require('fs'),path=require('path'),root=process.argv[2]||process.cwd();
function edit(file,fn){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(s.includes('MP_CLEAN_V1'))return;fs.writeFileSync(p,'// MP_CLEAN_V1\n'+fn(s));}
function rep(s,a,b){if(!s.includes(a))throw Error('Missing anchor '+a.slice(0,80));return s.replace(a,b);}
if(fs.existsSync(path.join(root,'server/integrations/mp2rss-store.mjs')))edit('server/integrations/mp2rss-store.mjs',s=>{
 s="import {prepareMPItem} from './mp-content-clean.mjs';\n"+s;
 s=rep(s,'export async function persistItem(s,item,compiled){','export async function persistItem(s,item,compiled){item=prepareMPItem(item);');
 s=rep(s,"vectorized=false RETURNING id","vectorized=false,filter_status=CASE WHEN articles.classify_method='manual' THEN articles.filter_status ELSE EXCLUDED.filter_status END,matched_topic=CASE WHEN articles.classify_method='manual' THEN articles.matched_topic ELSE EXCLUDED.matched_topic END RETURNING id");return s;
});
if(fs.existsSync(path.join(root,'intelligence/server.mjs'))){
edit('intelligence/import-mp2rss.mjs',s=>rep(s,'content:p.content,language:p.language,','content:p.content,originalContent:p.originalContent,cleaning:p.cleaning,language:p.language,'));
edit('intelligence/server.mjs',s=>rep("import {sourceFunnels} from './source-funnel.mjs';\n"+s,'processing:processingSummary(store.data),collection:', 'sourceFunnels:await sourceFunnels(store.pool),processing:processingSummary(store.data),collection:'));
edit('intelligence/public/app.js',s=>{
 const fn=`function sourceFunnel(s){const f=data.sourceFunnels?.[s.id]||(s.id==='iea'?data.sourceFunnels?.['mp2rss_x:84679163']:null);if(!f)return s.id.startsWith('mp2rss_')?'<p class="meta">采集分类统计暂未取得，请刷新查看；下方数量为智库文档。</p>':'';return '<div class="source-funnel" style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0">'+[['已采集',f.collected,'订阅文章／推文总数，包含候选和排除'],['已纳入',f.included,'通过规则且当前正文版本已投递智库'],['候选',f.candidate,'尚未命中行业规则，原文保留'],['排除',f.excluded,'命中反向规则，原文保留'],['待处理',f.pending,'通过规则但待补正文、待投递或待更新版本']].map(([n,v,t])=>'<span title="'+esc(t)+'" style="padding:7px 10px;border:1px solid #42647b;border-radius:8px">'+n+' <b>'+v+'</b></span>').join('')+'</div><p class="meta">统计范围：该订阅全量资料。已纳入中仍待分析／重试 '+f.analysisPending+' 条（不重复计入待投递）。</p>';}
`;
 s=rep(s,'function sources(){',fn+'function sources(){');
 return rep(s,'${data.sources.map(s=>panel(s.name,s.level+\' / \'+s.method.toUpperCase(),`<p>','${data.sources.map(s=>panel(s.name,s.level+\' / \'+s.method.toUpperCase(),`${sourceFunnel(s)}<p>');
});
}
