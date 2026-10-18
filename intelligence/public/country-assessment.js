import {renderDossier} from './dossier-view.js';
import {formatDisplayDate} from './preview.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countries=product=>product.scope?.countryCodes||product.content.countries||[];
const shortVersion=value=>String(value||'').replace(/^release_/,'').slice(0,12);

export function countryPageLink({selected=[],mode='external',releaseId=null,query='',clearFilters=false}={}){
 const params=new URLSearchParams(query);params.delete('country');params.delete('snapshotId');
 params.set('countryCodes',selected.join(','));params.set('relationMode',selected.length<2?'external':mode);
 for(const key of ['topic','sourceId','from','to'])if(clearFilters||!params.has(key))params.set(key,'');
 if(releaseId)params.set('releaseId',releaseId);else params.delete('releaseId');
 return '#dashboard?'+params;
}

export function renderCountryAssessments(payload,{activeCountry='',selected=[],mode='external',query='',meta={},name=code=>code,refButton=()=>'',caseItems=()=>''}={}){
 const assessments=payload.assessments||[...(payload.dossiers||[]).map(d=>d.assessment),payload.assessment].filter((p,i,all)=>p&&all.findIndex(v=>v?.productId===p.productId)===i);
 const matches=p=>!activeCountry||countries(p).includes(activeCountry);
 const current=[...assessments,...(payload.caseStudies||[])].filter(matches),historical=(payload.historicalProducts||[]).filter(matches);
 const version=product=>{
  const p=product.publication;if(!p)return '';
  const href=countryPageLink({selected,mode,query,releaseId:p.releaseId});
  return `<details class="country-product-version"><summary>${p.historical?'历史成果':'本资料版本成果'} · 发布于 ${esc(formatDisplayDate(p.publishedAt))}（北京时间） · 版本 ${esc(shortVersion(p.releaseId))}</summary><p>资料版本：<code>${esc(p.snapshotId)}</code></p><p>发布版本：<code>${esc(p.releaseId)}</code></p><a href="${esc(href)}">在此发布版本中查看 →</a></details>`;
 };
 const render=product=>{
  const pinnedRef=ref=>refButton({...ref,releaseId:product.publication?.releaseId||ref.releaseId||meta.releaseId});
  if(product.productType!=='country_case'&&product.scope?.kind==='country')return `<div class="country-assessment-product" data-country-product="${esc(product.productId)}">${version(product)}${renderDossier({...product,subject:countries(product).map(name).join('、')},pinnedRef)}</div>`;
  const count=product.inputCoverage?.documents??new Set(product.content.items.flatMap(i=>i.references.map(r=>r.documentId))).size;
  return `<section class="country-case" data-country-product="${esc(product.productId)}">${version(product)}<p class="eyebrow">跨国项目案例 · ${countries(product).map(name).map(esc).join(' / ')}</p><h3>${esc(product.content.project)}</h3><p>${esc(product.content.overview)}</p><p class="meta">根据 ${count} 篇选定资料整理的证据草稿 · 通过独立模型复核，未经人工专家审核 · 不代表全库研判</p><div class="country-relation-grid">${caseItems(product.content.items,pinnedRef)}</div><p>观察重点：${esc(product.content.watch)}</p></section>`;
 };
 const excluded=payload.assessmentCoverage?.excludedByFilters||0;
 const filtered=excluded?`<p class="country-filter-explanation">所选范围另有 ${excluded} 项已保存成果，其完整引用证据不符合当前领域、来源或日期条件。<a href="${esc(countryPageLink({selected,mode,query,releaseId:meta.releaseId,clearFilters:true}))}">清除资料筛选查看 →</a></p>`:'';
 let empty='';
 if(!current.length){
  const message=historical.length?'本资料版本暂无匹配的已发布研判或案例，下方保留可查阅的历史成果。':activeCountry&&(assessments.length||(payload.caseStudies||[]).length||(payload.historicalProducts||[]).length)?'该国暂无匹配成果，所选范围的其他国家已有保存成果。':excluded?'已有保存成果，但其完整引用证据不符合当前筛选条件。':'当前所选范围尚未发布研判或案例；原始事件线索可在下方主题中查阅。';
  empty=`<div class="country-empty" role="status"><strong>${esc(message)}</strong>${activeCountry?'<p><button data-assessment-overview>返回所选国别汇总</button></p>':''}<p class="meta">事件线索数量不代表研判已生成；新资料版本不会自动更新历史结论。</p></div>`;
 }
 const history=historical.length?`<details class="country-product-history" ${current.length?'':'open'}><summary>历史已发布成果 · ${historical.length} 项 · 保留原资料与发布版本</summary><p class="meta">历史研判和案例仅代表原资料版本，未合并到本期角色、关系或事件统计。筛选按各成果原版本的完整引用证据匹配。</p>${historical.map(product=>`<details class="country-historical-product"><summary>${esc(countries(product).map(name).join('、'))} · ${esc(product.content.project||product.content.overview)} · ${esc(formatDisplayDate(product.generatedAt))} · 版本 ${esc(shortVersion(product.publication?.releaseId))}</summary>${render(product)}</details>`).join('')}</details>`:'';
 return `<p class="country-product-summary">${activeCountry?esc(name(activeCountry))+' · ':selected.length?'所选国别汇总 · ':'全球成果汇总 · '}本资料版本 ${current.filter(p=>p.productType!=='country_case').length} 份研判、${current.filter(p=>p.productType==='country_case').length} 个案例；历史成果 ${historical.length} 项</p>${current.map(render).join('')}${empty}${history}${filtered}`;
}
