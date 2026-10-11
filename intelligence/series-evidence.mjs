import {countries} from './core.mjs';
import {inPeriodWindow} from './periods.mjs';
import {constrainDocuments} from './query.mjs';

export function selectSeries(data,filters={}) {
 return (data.series||[]).filter(s=>(!filters.country||s.country===filters.country)&&(!filters.topic||s.topic===filters.topic)&&(!filters.sourceId||s.sourceId===filters.sourceId))
  .map(s=>({...s,rows:s.rows.filter(r=>Number.isFinite(r.value)&&inPeriodWindow(r.period,filters)).sort((a,b)=>a.period.localeCompare(b.period))})).filter(s=>s.rows.length);
}
function comparison(rows,frequency) {
 const latest=rows.at(-1), values=new Map(rows.map(r=>[r.period,r.value]));
 if(latest.partial)return '当前统计月未结束，不计算与完整月份的同比环比';
 const match=latest.period.match(/^(\d{4})-(?:Q)?(\d+)$/);if(!match)return '';
 const y=+match[1],n=+match[2],quarter=frequency==='季度',last=quarter?4:12;
 const period=(year,num)=>`${year}-${quarter?'Q':''}${quarter?num:String(num).padStart(2,'0')}`;
 const prev=period(n===1?y-1:y,n===1?last:n-1),year=period(y-1,n);
 return [[prev,'环比'],[year,'同比']].map(([p,label])=>values.has(p)&&values.get(p)!==0?`${label} ${((latest.value/values.get(p)-1)*100).toFixed(2)}%（${latest.period} 对 ${p}；基期值 ${values.get(p)}；公式=(本期/基期-1)×100%）`:`${label}：当前筛选范围缺少有效基期 ${p}`).join('；');
}
export function seriesEvidence(data,query,filters={}) {
 const eligible=selectSeries(data,filters).filter(s=>s.sourceId==='eia'
  ? /\bEIA\b|能源信息署|(?:美国|墨西哥湾|联邦海域|海上原油|海洋油气).*(?:产量|产出)|(?:产量|产出).*(?:美国|墨西哥湾|联邦海域)/i.test(query)||(filters.sourceId==='eia'&&/产量|趋势|变化|统计|数据/.test(query))
  : s.sourceId==='transocean'?/Transocean|越洋钻探|全船队|平台利用率|日收入|收入效率/i.test(query)
  : s.sourceId==='sodir-production'?/SODIR|挪威|Troll|Gullfaks|Johan Sverdrup|特罗尔|古尔法克斯/i.test(query)
  : s.sourceId==='fr-boem'&&/BOEM|联邦公报|海洋.*政策|海上.*规则/i.test(query));
 return eligible.map(s=>{
  const title=`${data.sources?.find(x=>x.id===s.sourceId)?.name||s.sourceId} · ${s.name}`;
  const periodRange=`${s.rows[0].period} 至 ${s.rows.at(-1).period}`;
  const summary=`${s.name}；统计期 ${periodRange}；最新 ${s.rows.at(-1).period}：${s.rows.at(-1).value} ${s.unit}。${comparison(s.rows,s.frequency)}。${s.note||''}`;
  const content=`${title}\n国家/范围：${countries.find(c=>c.code===s.country)?.name||s.country||'公司口径'}\n${summary}\n单位：${s.unit}；性质：${s.nature||'实际'}；频率：${s.frequency}\n${s.rows.map(r=>`${r.period}: ${r.value} ${s.unit}${r.sourceUrl?'；来源 '+r.sourceUrl:''}${r.documentIds?'；法定文件编号 '+r.documentIds.join(','):''}`).join('\n')}\n读取日期：${s.checkedAt}；读取日期不是发布日期。${s.release||''}`;
  return {id:`series:${s.id}`,kind:'series',seriesId:s.id,sourceId:s.sourceId,title,titleZh:title,summaryZh:summary,content,passage:content,url:s.sourceUrl,publishedAt:null,periodRange,checkedAt:s.checkedAt,unit:s.unit,note:s.note,rows:s.rows,evidence:[]};
 }).filter(d=>constrainDocuments([d],query,{strictTerms:false}).length);
}
