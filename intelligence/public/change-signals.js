const DAY=86400000,ZONE=8*3600000;
const themes=[
 ['海上风电','海上风电|offshore wind'],['海底电缆','海缆|海底电缆|subsea cable|submarine cable'],
 ['碳捕集与封存','碳捕集|碳封存|碳储存|CCS\\b|CCUS\\b|carbon capture|carbon storage|Northern Lights'],
 ['钻井与油服','钻井|钻机|油服|drilling|oilfield service'],['船舶与海工装备','船舶|海工装备|造船|浮式生产|FPSO\\b|vessel|shipbuilding'],
 ['项目签约与订单','签约|签署|订单|中标|获合同|合同授予|contract award|awarded.*contract'],
 ['投产与交付','投产|交付|首油|首气|first oil|first gas|commissioning|delivery'],
 ['审批与政策','审批|许可|管理办法|行动方案|征求意见|guidance|permit|regulation'],
 ['海洋新能源','波浪能|潮汐能|潮流能|海洋热能|wave energy|tidal energy|ocean thermal']
].map(([name,pattern])=>({name,re:new RegExp(pattern,'i')}));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=t=>new Date(t+ZONE).toISOString().slice(0,10);
function unique(rows){const titles=new Set(),urls=new Set();return rows.filter(d=>{const title=String(d.titleZh||d.title||'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');let url=d.url;try{const parsed=new URL(url);['utm_source','utm_medium','utm_campaign'].forEach(k=>parsed.searchParams.delete(k));url=parsed.href;}catch{}if(title&&titles.has(title)||url&&urls.has(url))return false;if(title)titles.add(title);if(url)urls.add(url);return true;});}
export function deriveSignals(data,days=7){
 days=days===30?30:7;
 const timestamp=Date.parse(data.generatedAt);if(!Number.isFinite(timestamp))return {error:'快照时间缺失，暂不能计算可比窗口。',signals:[]};
 const end=Math.floor((timestamp+ZONE)/DAY)*DAY-ZONE,start=end-days*DAY,previous=start-days*DAY;
 const raw=data.documents||[],dated=raw.filter(d=>Number.isFinite(Date.parse(d.publishedAt))),recentRaw=dated.filter(d=>{const t=Date.parse(d.publishedAt);return t>=previous&&t<end;}),rows=unique(recentRaw);
 const current=rows.filter(d=>Date.parse(d.publishedAt)>=start),before=rows.filter(d=>Date.parse(d.publishedAt)<start);
 const currentSources=new Set(current.map(d=>d.sourceId)),beforeSources=new Set(before.map(d=>d.sourceId));
 const common=new Set([...currentSources].filter(id=>beforeSources.has(id))),baseCurrent=current.filter(d=>common.has(d.sourceId)),basePrevious=before.filter(d=>common.has(d.sourceId));
 const signals=themes.map(({name,re})=>{
  const matches=d=>re.test([d.titleZh,d.title,d.summaryZh].filter(Boolean).join(' '));
  const now=current.filter(matches),was=before.filter(matches),stableNow=baseCurrent.filter(matches),stableBefore=basePrevious.filter(matches);
  const share=current.length?now.length/current.length:0,oldShare=before.length?was.length/before.length:0;
  const delta=now.length-was.length,sources=new Set(now.map(d=>d.sourceId));
  const supported=before.length>=10&&current.length>=10&&was.length>=3&&now.length>=5&&sources.size>=2&&stableBefore.length>=2;
  const rise=supported&&delta>=3&&share-oldShare>=.03&&stableNow.length>stableBefore.length;
  const label=rise?'报道增加':was.length===0&&now.length>=2?'本窗口新见':'持续观察';
  const sentence=now.length===0?'当前窗口未检索到相关报道；无法据此判断行业降温。':rise?`相关报道增加，占比上升 ${((share-oldShare)*100).toFixed(1)} 个百分点；两期均有报道的渠道内也有增加。`:was.length===0?`本期收录 ${now.length} 篇相关资料，上期未检索到；这不等于该主题首次出现。`:delta<0?`本期比上期少 ${-delta} 篇；渠道覆盖与采集完整性尚未核实，暂不判断为骤减。`:delta>0&&share<oldShare?`篇数增加，但在全部报道中的占比下降 ${((oldShare-share)*100).toFixed(1)} 个百分点，暂不能判断为主题独立升温。`:was.length<3?`上期仅 ${was.length} 篇，比较基数偏小；本期出现更多线索，仍需连续观察。`:`本期比上期${delta?'多 '+delta+' 篇':'数量持平'}，目前只支持报道层面的观察。`;
  const series=Array.from({length:days*2},(_,i)=>rows.filter(d=>matches(d)&&Math.floor((Date.parse(d.publishedAt)-previous)/DAY)===i).length);
  return {name,label,now,was,share,oldShare,delta,sources:sources.size,stableNow:stableNow.length,stableBefore:stableBefore.length,sentence,series,score:(rise?100:0)+now.length+Math.abs(delta)*.5};
 }).filter(s=>s.now.length||s.was.length).sort((a,b)=>b.score-a.score);
 return {signals,days,start,end,previous,current:current.length,before:before.length,commonSources:common.size,currentSources:currentSources.size,beforeSources:beforeSources.size,duplicateCount:recentRaw.length-rows.length,missingDates:raw.length-dated.length,excludedToday:dated.filter(d=>Date.parse(d.publishedAt)>=end&&Date.parse(d.publishedAt)<=timestamp).length};
}
const pct=v=>(v*100).toFixed(1)+'%';
export function renderSignalEvidence(data,days,name){
 const r=deriveSignals(data,days),s=r.signals.find(s=>s.name===name);if(!s)return '<p>当前范围暂无该主题资料。</p>';
 const list=(rows,label)=>`<h3>${label} · ${rows.length} 篇</h3>${rows.map(d=>`<div class="signal-evidence"><button data-document="${escape(d.id)}">${escape(d.titleZh||d.title)}</button><small>${escape((data.sources||[]).find(x=>x.id===d.sourceId)?.name||d.sourceId)} · ${date(Date.parse(d.publishedAt))}</small></div>`).join('')||'<p>没有命中资料</p>'}`;
 return `<h2>${escape(s.name)} · 原文依据</h2><p class="meta">按标题与摘要匹配，同标题或同链接去重；主题可能重叠，渠道数不代表独立信源数。</p>${list(s.now,'本期')}${list(s.was,'上期')}`;
}
export function renderChangeSignals(data,days=7,selected=''){
 const r=deriveSignals(data,days);if(r.error)return `<p class="meta">${escape(r.error)}</p>`;
 const s=r.signals.find(s=>s.name===selected)||r.signals[0];
 const chart=s?(()=>{const max=Math.max(1,...s.series),w=880,h=220,step=w/s.series.length;
 return `<svg class="signal-chart" viewBox="0 0 960 300" role="img" aria-label="${escape(s.name)}，前后两个窗口逐日发布篇数"><defs><linearGradient id="signal-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${[0,.5,1].map(f=>`<path d="M48 ${240-f*h}H928" class="signal-gridline"/><text x="32" y="${245-f*h}" text-anchor="end">${+(max*f).toFixed(1)}</text>`).join('')}<rect x="488" y="20" width="440" height="220" fill="var(--accent)" opacity=".035"/><path d="M488 20V240" class="signal-divider"/>${s.series.map((v,i)=>`<rect class="signal-chart-bar ${i>=r.days?'is-current':''}" x="${48+i*step+step*.18}" y="${240-v/max*h}" width="${step*.64}" height="${v/max*h}" rx="3"><title>${date(r.previous+i*DAY)}：${v} 篇</title></rect>`).join('')}<polyline class="signal-chart-line" points="${s.series.map((v,i)=>`${48+(i+.5)*step},${240-v/max*h}`).join(' ')}"/><text x="48" y="278">${date(r.previous)}</text><text x="488" y="278" text-anchor="middle">${date(r.start)} · 本期开始</text><text x="928" y="278" text-anchor="end">${date(r.end-1)}</text></svg>`;})():'';
 return `<div class="signal-toolbar"><div class="signal-controls" role="group" aria-label="变化观察窗口">${[7,30].map(n=>`<button data-signal-days="${n}" aria-pressed="${r.days===n}" class="${r.days===n?'primary':''}">近 ${n} 天</button>`).join('')}</div><p class="signal-period">${date(r.start)} — ${date(r.end-1)}<span> / 对比前 ${r.days} 天 · 北京时间完整日</span></p><div class="signal-base"><span>本期 <b>${r.current}</b> 篇</span><span>上期 <b>${r.before}</b> 篇</span><span>共同渠道 <b>${r.commonSources}</b></span></div></div><p class="signal-overview">${r.currentSources>r.beforeSources*1.5?'渠道覆盖扩大，篇数增长需结合报道占比判断。':'结合报道占比与共同渠道观察主题变化。'} 渠道 ${r.beforeSources} → ${r.currentSources} 个；以下为资料库观察，不代表全行业统计。</p><div class="signal-topics" role="group" aria-label="选择观察主题">${r.signals.map(t=>`<button class="signal-topic" data-signal-theme="${escape(t.name)}" aria-pressed="${t===s}"><span>${escape(t.name)}</span><strong>${t.was.length}<i>→</i>${t.now.length}<small>篇</small></strong></button>`).join('')}</div>${s?`<article class="signal-workbench"><div class="signal-assessment"><small class="signal-kicker">SIGNAL / ${String(r.signals.indexOf(s)+1).padStart(2,'0')}</small><div class="signal-heading"><h3>${escape(s.name)}</h3><span class="signal-label">${s.label}</span></div><p class="signal-verdict">${escape(s.sentence)}</p><div class="signal-comparisons"><div><span>报道占比</span><b>${pct(s.oldShare)} → ${pct(s.share)}</b><div class="signal-meter"><i style="width:${s.oldShare*100}%"></i><i style="width:${s.share*100}%"></i></div></div><div><span>共同渠道内报道</span><b>${s.stableBefore} → ${s.stableNow} 篇</b></div><div><span>本期覆盖渠道</span><b>${s.sources} 个</b></div></div><button class="signal-proof" data-signal-proof="${escape(s.name)}">核对 ${s.now.length+s.was.length} 篇原文依据 ↗</button></div><div class="signal-plot"><div class="signal-plot-head"><div><small class="signal-kicker">PUBLICATION PULSE</small><h3>报道发布节奏</h3></div><span><i></i> 上期 <i></i> 本期 · 篇 / 日</span></div>${chart}<p class="meta">按报道发布日期统计；柱形表示每天篇数，折线连接每日观测值。</p></div></article>`:'<p class="empty">当前筛选范围暂无主题线索。</p>'}<details class="signal-method"><summary>数据边界与统计方法</summary><p>以快照日期之前的完整北京时间日比较；今日 ${r.excludedToday} 篇不计入。当前范围排除 ${r.duplicateCount} 条同标题或同链接重复资料，${r.missingDates} 条缺少有效发布日期。</p><p>关键词匹配标题与摘要，主题可重叠；尚未做语义级转载聚类。共同渠道表示两期均有报道，不保证采集完整。发布日期不等于事件发生日期，报道增长不等于订单、投资或产能增长。</p></details>`;
}
