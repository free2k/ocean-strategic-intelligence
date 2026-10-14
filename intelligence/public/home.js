import {topicLabel} from './industry-topics.mjs';
import {formatDisplayDate} from './preview.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function homeView(data){
 const entries=[['sources','全球信息感知'],['library','情报证据中心'],['monitor','产业动态监测'],['dashboard','全球态势总览'],['analysis','产业数据洞察'],['research','战略研究工作台']];
 return `<section class="panel home-intro"><small>01 / 平台职责与成果形成逻辑</small><h1>把全球资料转化为有证据、可追踪的战略研究成果</h1><p class="home-chain">感知信息 → 沉淀证据 → 监测产业变化 → 形成国别研判 → 支撑研究</p></section>
 <section class="panel home-updates"><small>02 / 最新已发布成果入口</small><h2>研究成果</h2><div id="home-release" class="notice" aria-live="polite">正在核对已保存的发布状态…</div><div class="home-reports">${[['library','六领域简报','本轮新增与更新 · 全库作背景','brief'],['monitor','产业变化与研判','对象、事件与前后变化','industry'],['dashboard','国别态势成果','国家、主题与跨国关系','country']].map(([route,title,desc,id])=>`<article><h3>${title}</h3><p>${desc}</p><p class="meta" id="home-product-${id}">正在核对成果版本</p><a class="button" href="#${route}">查看成果与依据 ↗</a></article>`).join('')}</div></section>
 <section class="panel"><small>03 / 六个研究领域入口</small><h2>研究领域</h2><div class="home-fields">${(data.topics||[]).map(t=>`<a href="#library?topic=${encodeURIComponent(t)}&country=&sourceId=&from=&to="><span>${esc(topicLabel(t))}</span><span>查看资料 ↗</span></a>`).join('')}</div></section>
 <section class="panel"><small>04 / 业务工作路径与入口</small><h2>研究工作空间</h2><div class="home-fields">${entries.map(([route,title])=>`<a href="#${route}"><strong>${title}</strong><span>${['analysis','research'].includes(route)?'保留现有功能':'进入工作空间'} ↗</span></a>`).join('')}</div></section>`;
}
export async function setupHome(api,host,isCurrent){
 const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
 try{const result=await api('snapshots/latest-version');if(!isCurrent()||!host.isConnected)return;const r=result.data;host.textContent=`资料版本 · ${formatDisplayDate(r.generatedAt)} · ${r.completeness==='partial'?'部分资料可用':'资料版本可读取'}`;
  const catalog=await api('research/products?releaseId='+r.releaseId);if(!isCurrent()||!host.isConnected)return;
  const ready=catalog.data.briefs.filter(p=>p.status==='ready').length;
  if(catalog.data.briefs.some(p=>p.status==='ready'&&p.scope?.collection==='snapshot_domain_backfill'))document.getElementById('home-product-brief').parentElement.querySelector('p').textContent='历史资料回填 · 按各领域实际输入范围阅读';
  set('home-product-brief',ready?`已保存 ${ready} / 6 个领域 · ${formatDisplayDate(catalog.meta.generatedAt)}`:'尚无已保存简报 · 可查看处理状态');
  for(const [kind,id,route] of [['object','industry','monitor'],['country','country','dashboard']]){const products=catalog.data.dossiers.filter(p=>p.scope.kind===kind).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt));set('home-product-'+id,products.length?`已保存 ${products.length} 份局部研判 · ${formatDisplayDate(products[0].generatedAt)}`:'尚无已保存研判 · 可浏览原始资料');const link=document.getElementById('home-product-'+id)?.parentElement.querySelector('a');if(link&&products.length){const p=products[0],q=new URLSearchParams({topic:'',country:'',sourceId:'',from:'',to:''});if(kind==='object'){q.set('view','objects');q.set('objectId',p.scope.objectId);q.set('releaseId',catalog.meta.releaseId);}else q.set('countryCodes',p.scope.countryCodes.join(','));link.href='#'+route+'?'+q;link.textContent='查看最近保存成果 ↗';link.title=p.overview;}}
  if(!catalog.data.dossiers.some(p=>p.scope.kind==='country')&&catalog.data.cases?.length){const c=catalog.data.cases[0];set('home-product-country',`已保存 ${catalog.data.cases.length} 个跨国项目案例 · 局部资料研判`);const link=document.getElementById('home-product-country').parentElement.querySelector('a');link.textContent='查看已验证案例 ↗';link.href='#dashboard?'+new URLSearchParams({countryCodes:c.countries.join(','),relationMode:'within',topic:'',country:'',sourceId:'',from:'',to:''});}


 }catch{if(isCurrent()&&host.isConnected){host.textContent='成果发布状态暂不可用，入口仍可查看已有资料。';for(const id of ['brief','industry','country'])set('home-product-'+id,'发布状态待核对');}}
}
