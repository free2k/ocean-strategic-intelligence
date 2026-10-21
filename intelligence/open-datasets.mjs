import {readTaskWorkspace as readSnapshot,saveTaskWorkspace} from './task-workspace.mjs';
// Official structured datasets are independent of article keyword filtering.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getResource} from './net.mjs';
export const REPD='https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract';
export const SODIR='https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer/7300';
export const FR='https://www.federalregister.gov/api/v1/documents.json';
export const openProfiles=[
 {id:'fr-boem',name:'Federal Register · BOEM 法定公告',country:'US',topic:'宏观政策',url:'https://www.federalregister.gov/agencies/ocean-energy-management-bureau',method:'api',scope:'2020年以来 BOEM 机构正式发布记录；按文件编号去重；不等于政策成效或全部美国海洋政策'},
 {id:'sodir-production',name:'挪威海洋管理局 SODIR · 油气田月产量',country:'NO',topic:'海洋油气',url:SODIR,method:'api',scope:'2020年以来 Troll、Gullfaks、Johan Sverdrup 三个油气田；各田净原油/净天然气产量，不代表挪威全国'},
 {id:'uk-repd',name:'英国 DESNZ · 可再生能源项目登记',country:'GB',topic:'海上风电',url:REPD,method:'csv',scope:'当前官方CSV中的海上风电、潮汐及波浪能项目申请记录；包括撤回、拒绝及历史记录，不等同在运项目清单'}
];
export function parseCSV(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('Unclosed CSV field');if(field||row.length){row.push(field);rows.push(row);}const headers=rows.shift()?.map(s=>s.replace(/^\uFEFF/,'').trim());if(!headers)throw Error('Empty CSV');return rows.map(r=>{if(r.length!==headers.length)throw Error('CSV schema mismatch');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export function repdRows(text,url){
 const all=parseCSV(text);if(!all.length||!('Technology Type'in all[0])||!('Ref ID'in all[0]))throw Error('REPD schema changed');
 const rows=all.filter(r=>/^(Wind Offshore|Tidal.*|Wave.*|Shoreline Wave)$/i.test(r['Technology Type'])).map(r=>({id:r['Ref ID'],project:r['Site Name'],technology:r['Technology Type'],status:r['Development Status'],capacityMW:r['Installed Capacity (MWelec)'].trim()!==''&&Number.isFinite(Number(r['Installed Capacity (MWelec)']))?Number(r['Installed Capacity (MWelec)']):null,operator:r['Operator (or Applicant)'],region:r.Region,updatedOriginal:r['Record Last Updated (dd/mm/yyyy)'],operationalOriginal:r.Operational,sourceUrl:url,raw:r}));
 if(!rows.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('REPD empty or duplicate identifiers');return rows;
}
export function decodeCSV(bytes){try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'utf-8'};}catch{return {text:new TextDecoder('windows-1252',{fatal:true}).decode(bytes),encoding:'windows-1252'};}}
export function regulatoryRows(records,today){
 const valid=records.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.publication_date||'')&&r.publication_date>='2020-01-01'&&r.publication_date<=today);
 if(valid.some(r=>!r.document_number||!r.html_url||!['Notice','Rule','Proposed Rule','Presidential Document'].includes(r.type)))throw Error('Federal Register schema changed');
 return [...new Map(valid.map(r=>[r.document_number,{id:r.document_number,title:r.title,type:r.type,publicationDate:r.publication_date,abstract:r.abstract,sourceUrl:r.html_url,pdfUrl:r.pdf_url}])).values()];
}
export function policySeries(rows,now){
 // Missing months are zero only within the completely fetched API query range.
 const latestMonth=now.slice(0,7),types=['Notice','Rule','Proposed Rule'],names={'Notice':'公告','Rule':'最终规则','Proposed Rule':'拟议规则'};
 return types.map(type=>({id:'fr-boem-'+type.toLowerCase().replaceAll(' ','-'),sourceId:'fr-boem',country:'US',topic:'宏观政策',name:'BOEM：'+names[type]+'月度发布数量',unit:'份',frequency:'月度',nature:'正式发布记录',classificationContext:'offshore energy regulation 海洋能源政策',sourceUrl:openProfiles[0].url,checkedAt:now,note:'按正式发布日期和文件编号计数；含撤回/更正等文件，不能衡量政策支持力度或效果。当前月未结束，不与完整月份直接比较。',rows:Array.from({length:(Number(latestMonth.slice(0,4))-2020)*12+Number(latestMonth.slice(5))},(_,i)=>{const period=`${2020+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,matches=rows.filter(r=>r.type===type&&r.publicationDate.startsWith(period));return{period,value:matches.length,partial:period===latestMonth,documentIds:matches.map(r=>r.id),sourceUrls:matches.map(r=>r.sourceUrl)};})}));
}
export function productionSeries(features,now){
 const rows=features.map(f=>f.attributes),fields=['TROLL','GULLFAKS','JOHAN SVERDRUP'];
 if(!rows.length||rows.some(r=>!fields.includes(r.prfInformationCarrier)||!Number.isInteger(r.prfYear)||!Number.isInteger(r.prfMonth)||r.prfMonth<1||r.prfMonth>12))throw Error('SODIR schema changed');
 const unique=new Set(rows.map(r=>`${r.prfInformationCarrier}-${r.prfYear}-${r.prfMonth}`));if(unique.size!==rows.length)throw Error('Duplicate field months');
 return fields.flatMap(field=>[['oil','净原油产量','prfPrdOilNetMillSm3','百万标准立方米'],['gas','净天然气产量','prfPrdGasNetBillSm3','十亿标准立方米']].map(([suffix,label,key,unit])=>({id:'sodir-'+field.toLowerCase().replaceAll(' ','-')+'-'+suffix,name:field+'：'+label,sourceId:'sodir-production',country:'NO',topic:'海洋油气',classificationContext:'offshore oil and gas 海上油气产量',unit,frequency:'月度',nature:'实际',sourceUrl:SODIR,checkedAt:now,note:'SODIR Historical 净产量月总量；不是日均产量。天然气与原油单位不同，不相加；缺失月份不补零。',rows:rows.filter(r=>r.prfInformationCarrier===field&&typeof r[key]==='number'&&Number.isFinite(r[key])).map(r=>({period:`${r.prfYear}-${String(r.prfMonth).padStart(2,'0')}`,value:r[key],fieldId:r.prfNpdidInformationCarrier,objectId:r.OBJECTID,sourceUrl:SODIR+'/query?'+new URLSearchParams({f:'pjson',objectIds:String(r.OBJECTID),outFields:'*',returnGeometry:'false'})})).filter(r=>r.period<now.slice(0,7)).sort((a,b)=>a.period.localeCompare(b.period))})));
}
export async function collectOpenDatasets(dir){
 const file=path.join(dir,'snapshot.json'),data=await readSnapshot(file),now=new Date().toISOString();data.series||=[];data.assetRegistries||={};data.errors||=[];
 for(const p of openProfiles){const report={...p,level:'S1',language:'en',checkedAt:now,status:'ready',records:0};try{
  let raw,ext='json',newSeries=[],registry;
  if(p.id==='fr-boem'){
   const u=new URL(FR);u.search=new URLSearchParams({'conditions[agencies][]':'ocean-energy-management-bureau','conditions[publication_date][gte]':'2020-01-01','conditions[publication_date][lte]':now.slice(0,10),per_page:'1000',order:'oldest'});
   const records=[];let next=u.href,expected=null;const seen=new Set();
   while(next){if(seen.has(next)||new URL(next).hostname!=='www.federalregister.gov')throw Error('Invalid API pagination');seen.add(next);const j=JSON.parse(await getResource(next));if(!Array.isArray(j.results)||!Number.isInteger(j.count))throw Error('Invalid regulatory response');expected??=j.count;if(j.count!==expected)throw Error('Dataset changed during pagination; retry later');records.push(...j.results);next=j.next_page_url||null;}
   const rows=regulatoryRows(records,now.slice(0,10));if(rows.length!==expected)throw Error('Incomplete regulatory result');raw=JSON.stringify(records);newSeries=policySeries(rows,now);registry={name:'BOEM 法定发布记录',sourceId:p.id,country:p.country,topic:p.topic,classificationContext:'offshore energy regulation 海洋能源政策',sourceUrl:u.href,checkedAt:now,note:p.scope,rows};report.records=rows.length;
  }else if(p.id==='sodir-production'){
   const features=[];let offset=0;while(true){const u=new URL(SODIR+'/query');u.search=new URLSearchParams({f:'json',where:"prfYear>=2020 AND prfMonth>0 AND prfInformationCarrier IN ('TROLL','GULLFAKS','JOHAN SVERDRUP')",outFields:'*',returnGeometry:'false',resultRecordCount:'2000',resultOffset:String(offset),orderByFields:'OBJECTID'});const j=JSON.parse(await getResource(u));if(j.error||!Array.isArray(j.features))throw Error('Invalid SODIR response');features.push(...j.features);if(!j.exceededTransferLimit)break;if(!j.features.length)throw Error('Incomplete SODIR pagination');offset+=j.features.length;}
   newSeries=productionSeries(features,now);if(newSeries.some(s=>!s.rows.length))throw Error('Missing production series');report.records=newSeries.reduce((n,s)=>n+s.rows.length,0);raw=JSON.stringify(features);
  }else{
   const html=await getResource(REPD),url=html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"\s<>]+\.csv/i)?.[0];if(!url)throw Error('Official CSV link missing');const bytes=await getResource(url,true);raw=bytes;ext='csv';const decoded=decodeCSV(bytes);report.encoding=decoded.encoding;const rows=repdRows(decoded.text,url);registry={name:'英国海洋可再生能源项目申请登记',sourceId:p.id,country:p.country,topic:p.topic,classificationContext:'offshore wind wave energy tidal energy 海上风电',sourceUrl:url,checkedAt:now,note:p.scope,rows};report.records=rows.length;report.downloadUrl=url;
  }
  const hash=createHash('sha256').update(raw).digest('hex'),archive=`official-${p.id}-${hash.slice(0,16)}.${ext}`;await fs.writeFile(path.join(dir,archive),raw);report.archive=archive;report.contentHash=hash;
  if(newSeries.length)data.series=[...data.series.filter(s=>s.sourceId!==p.id),...newSeries.map(s=>({...s,archive,contentHash:hash}))];if(registry)data.assetRegistries[p.id]={...registry,archive,contentHash:hash};data.errors=data.errors.filter(e=>e.sourceId!==p.id);
 }catch(e){report.status='failed';report.error=e.message;data.errors.push({sourceId:p.id,at:now,error:e.message});}
 data.sources=[...data.sources.filter(s=>s.id!==p.id),report];console.log(JSON.stringify({source:p.id,status:report.status,records:report.records,error:report.error}));
 }
 data.generatedAt=new Date().toISOString();await saveTaskWorkspace(file,data);return data;
}
if(process.argv[1]?.endsWith('open-datasets.mjs'))await collectOpenDatasets(process.env.INTEL_DATA_DIR||'.data/intelligence');
