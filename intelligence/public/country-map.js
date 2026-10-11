const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const english=new Intl.DisplayNames(['en'],{type:'region'});
export const normalizeWorld=world=>world.map((c,i)=>({...c,code:!c.code||c.code==='-99'?'map-region-'+i:c.code}));
let animationFrame;
export function setupMapFlow(){
 cancelAnimationFrame(animationFrame);const svg=document.querySelector('svg.map');if(!svg)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),started=performance.now();
 const particles=[...svg.querySelectorAll('.map-flow-particle')].map((node,i)=>{const path=node.closest('.map-link').querySelector('.map-edge');return {node,path,length:path.getTotalLength(),reverse:node.hasAttribute('data-reverse'),duration:path.classList.contains('directed')?5000:8000,offset:Math.floor(i/2)*.13};});
 function tick(now){if(!svg.isConnected)return;if(!reduced.matches&&!document.hidden)for(const p of particles){const phase=((now-started)/p.duration+p.offset)%1,point=p.path.getPointAtLength(p.length*(p.reverse?1-phase:phase));p.node.setAttribute('transform',`translate(${point.x} ${point.y})`);}animationFrame=requestAnimationFrame(tick);}
 animationFrame=requestAnimationFrame(tick);
}
function aliases(c){return [...new Set([c.name,english.of(c.code),...(c.code==='US'?['United States','USA']:c.code==='GB'?['UK','Britain']:[])])].filter(Boolean).map(regex).join('|');}
// Only explicit transport/export wording in a linked evidence quote can set direction.
// Country array order, company domicile and mere co-occurrence never set direction.
export function connectionDirection(connection,data){
 const lookup=new Map(data.countryOptions.map(c=>[c.code,c])),a=lookup.get(connection.from),b=lookup.get(connection.to);if(!a||!b)return null;
 const proofs=new Map(data.evidence.map(e=>[e.id,e])),matches=[];
 for(const event of data.events.filter(e=>connection.eventIds.includes(e.id)))for(const id of event.evidenceIds||[]){const proof=proofs.get(id);if(!proof||proof.documentId!==event.documentId)continue;
  for(const sentence of String(proof.quote).split(/[。！？;\n]/)){
   if(/\b(?:not|no|never|deny|denied|cancelled)\b|并非|未能|不再|取消|否认|未向|没有/i.test(sentence)||!/transport|ship(?:ped|ping)?|export|deliver|运输|运送|出口|输送|运往|运至/i.test(sentence))continue;
   for(const [from,to] of [[a,b],[b,a]]){const re=new RegExp('(?:\\bfrom\\s+(?:'+aliases(from)+')\\b.{0,100}?\\bto\\s+(?:'+aliases(to)+')\\b|从(?:'+aliases(from)+').{0,60}?(?:运往|运至|输送至|出口至|到|至)(?:'+aliases(to)+'))','i');if(re.test(sentence))matches.push({from:from.code,to:to.code,evidenceId:id,eventId:event.id,quote:proof.quote});}
  }
 }
 if(!matches.length||new Set(matches.map(m=>m.from+'>'+m.to)).size!==1)return null;
 return {...matches[0],evidence:[...new Map(matches.map(m=>[m.evidenceId,m])).values()]};
}
export function countryMap(data,world,selected=''){
 const max=Math.max(1,...data.countries.map(c=>c.count)),lookup=new Map(data.countries.map(c=>[c.code,c])),point=c=>({x:(c.lon+180)*2.5,y:(85-c.lat)*2.5});
 const selectedCountry=world.find(c=>c.code===selected)||lookup.get(selected),selectedCount=lookup.get(selected)?.count||0;
 return `<div class="map-selection" role="status">${selectedCountry?`当前国家：<strong>${esc(selectedCountry.name)}</strong> · ${selectedCount?selectedCount+' 条报道线索':'当前筛选范围暂无数据'}`:'点击任意国家查看资料；有数据的国家默认高亮'}</div><svg class="map" viewBox="0 0 900 430" aria-label="可点击所有国家的海洋能源地图"><defs><marker id="map-direction-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="var(--accent)"/></marker></defs>${world.map(c=>`<path d="${esc(c.path)}" class="land${selected===c.code?' selected-country':''}" data-country="${esc(c.code)}" tabindex="0" role="button" aria-label="查看${esc(c.name)}，${lookup.get(c.code)?.count||0}条线索" aria-pressed="${selected===c.code}" ${lookup.has(c.code)?`style="fill:var(--accent);opacity:${.25+.45*lookup.get(c.code).count/max}"`:''}><title>${esc(c.name)} · ${lookup.get(c.code)?.count||0} 条线索</title></path>`).join('')}${data.connections.map((r,i)=>{
  const direction=connectionDirection(r,data),from=lookup.get(direction?.from||r.from),to=lookup.get(direction?.to||r.to);if(!from||!to)return '';
  const a=point(from),b=point(to),path=`M${a.x},${a.y} Q${(a.x+b.x)/2},${Math.min(a.y,b.y)-Math.min(70,Math.abs(a.x-b.x)*.2+15)} ${b.x},${b.y}`;
  const title=direction?`${from.name} → ${to.name}：${direction.evidence.length} 条原文明确运输方向；不代表实时航迹`:`${from.name} ↔ ${to.name}：${r.count} 条事件地域共现，方向未确定；脉冲仅表示关联`;
  return `<g class="map-link" data-connection="${i}" tabindex="0" role="button" aria-label="${esc(title)}"><path class="map-edge${direction?' directed':''}" d="${path}" ${direction?'marker-end="url(#map-direction-arrow)"':''}/><path class="map-edge-hit" d="${path}"/><title>${esc(title)}；点击查看证据</title><circle class="map-flow-particle" r="${direction?3:2}" fill="var(--accent)" pointer-events="none"></circle>${direction?'':`<circle data-reverse class="map-flow-particle" r="2" fill="var(--accent)" pointer-events="none"></circle>`}</g>`;
 }).join('')}${data.countries.map(c=>{const p=point(c);return `<g class="map-node" data-country="${esc(c.code)}" tabindex="0" role="button" aria-label="查看${esc(c.name)}"><circle cx="${p.x}" cy="${p.y}" r="${8+7*c.count/max}" opacity=".22"/><circle cx="${p.x}" cy="${p.y}" r="3.5"/><text x="${p.x}" y="${p.y-17}" text-anchor="middle" class="${selected===c.code||['CN','US','BR','NO','SG','JP','AU'].includes(c.code)?'':'map-hover-label'}">${esc(c.name)}</text><title>${esc(c.name)} · ${c.count} 条报道线索</title></g>`;}).join('')}</svg><div class="map-note">● 国家代表点　┄ 往返脉冲：地域共现，未确定方向　→ 单向流动：原文明确运输方向<span>非实时航迹 · 点击连线查看证据</span></div>`;
}
