const fs=require('fs'),path=require('path'),root=process.argv[2]||process.cwd(),file=path.join(root,'intelligence/quant-preview/app.js');let s=fs.readFileSync(file,'utf8');
if(!s.includes('IEA_COHORTS_V1')){
 function rep(a,b){if(!s.includes(a))throw Error('Missing '+a);s=s.replace(a,b);}
 rep('<div class="chart-layout"><div class="chart"', '${card.cohorts?`<div class="control-row"><label>比较口径 <select data-cohort="${esc(card.id)}">${card.cohorts.map((c,i)=>`<option value="${i}" ${i===(card.selectedCohort||0)?"selected":""}>${esc(c.label)}</option>`).join(\'\')}</select></label><span class="muted">当前口径展示前15条，完整依据见下方</span></div>`:""}<div class="chart-layout"><div class="chart"');
 rep("root.addEventListener('change',e=>{", "root.addEventListener('change',e=>{if(e.target.dataset.cohort){const card=data.cards.find(c=>c.id===e.target.dataset.cohort);card.selectedCohort=Number(e.target.value);const el=e.target.closest('.chart-card').querySelector('.chart');window.echarts.getInstanceByDom(el)?.setOption(optionFor(card,views.get(card.id)||card.types[0],data.sources,themeTarget.dataset.theme==='dark'),true);}");
 rep('href="quant/api/iea-file?hash=', 'href="'+"'+new URL('api/iea-file',import.meta.url).href+'"+'?hash=');
 fs.writeFileSync(file,'// IEA_COHORTS_V1\n'+s);
}
