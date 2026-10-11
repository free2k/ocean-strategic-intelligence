export const endpoint = 'https://api.eia.gov/v2/seriesid/PET.MCRFP3FM2.M';
export const sourceUrl = 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=M&n=PET&s=MCRFP3FM2';
export function normalizeEia(payload, start = '2024-01') {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) throw new Error('Invalid EIA_START');
  const r = payload?.response;
  if (payload?.error || r?.frequency !== 'monthly' || !Array.isArray(r.data) || !r.data.length) throw new Error('Unexpected EIA response');
  if (Number(r.total) !== r.data.length) throw new Error('Incomplete EIA response; pagination required');
  const rows = new Map();
  for (const item of r.data) {
    if (item.series !== 'MCRFP3FM2' || item.units !== 'MBBL/D' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.period)) throw new Error('Unexpected EIA series, unit or period');
    if (item.value == null || String(item.value).trim() === '') continue;
    const value = Number(item.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid EIA value');
    if (rows.has(item.period)) throw new Error('Duplicate EIA period');
    rows.set(item.period, {period:item.period,value,original:String(item.value)});
  }
  const selected = [...rows.values()].filter(r=>r.period >= start).sort((a,b)=>a.period.localeCompare(b.period));
  if (!selected.length) throw new Error('No EIA observations in requested window');
  return {id:'eia-offshore-crude',name:'美国联邦海域海湾原油月度日均产量',sourceId:'eia',sourceUrl,apiUrl:endpoint,seriesCode:'PET.MCRFP3FM2.M',country:'US',topic:'海洋油气',unit:'千桶/日',frequency:'月度',nature:'实际',checkedAt:new Date().toISOString(),release:'API未提供发布日期；采集时间不等于发布日期',rows:selected,note:'美国对应联邦海域，月度日均量，并非月总产量；允许官方历史修订，缺失值不补零。'};
}
export function mergeEia(data, series) {
  return {...data,series:[...(data.series||[]).filter(s=>s.id!==series.id),series],sources:[...(data.sources||[]).filter(s=>s.id!=='eia'),{id:'eia',name:'美国能源信息署 EIA',country:'US',level:'S1',method:'api',language:'en',url:sourceUrl,scope:'官方海上原油月度日均序列；独立于新闻采集',status:'ready',checkedAt:series.checkedAt,observations:series.rows.length}]};
}
