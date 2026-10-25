import {readTaskWorkspace as readSnapshot,saveTaskWorkspace} from './task-workspace.mjs';
import {collectPublicReplacements,updateOilpriceMetrics} from './public-source-replacements.mjs';
import {snapshotRules} from './published-rules.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import {chromium} from 'playwright-core';
import {classifyRecord,compileRules} from './industry-classification.mjs';
import {countries} from './core.mjs';
export const products=[
 {id:'critical-minerals-dataset',name:'IEA 关键矿产',kind:'minerals'},
 {id:'ccus-projects-database',name:'IEA CCUS 项目',kind:'ccus'},
 {id:'hydrogen-production-and-infrastructure-projects-database',name:'IEA 氢能项目与基础设施',kind:'hydrogen'}
].map(p=>({...p,url:'https://www.iea.org/data-and-statistics/data-product/'+p.id}));
const digest=b=>createHash('sha256').update(b).digest('hex');
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const translations={'Current Policies scenario':'现行政策情景','Stated Policies scenario':'既定政策情景','High Demand Scenario':'高需求情景','Base case':'基准技术路径','Wind':'风电（未拆分海上）','Hydrogen':'氢能','Copper':'铜','Nickel':'镍','Cobalt':'钴','Lithium':'锂','Boron':'硼','Chromium':'铬','Neodymium':'钕','Dysprosium':'镝','Praseodymium':'镨','Terbium':'铽','Zinc':'锌','Manganese':'锰','Molybdenum':'钼','Lead':'铅','Operational':'运行中','Planned':'规划中','Cancelled':'已取消','FID/Construction':'已决策／建设中','Offshore wind':'海上风电'};
export const zh=v=>translations[v]||v;
const iso3='CHN NOR GBR NLD DEU FRA DNK USA BRA SGP JPN AUS CAN IND KOR ARE QAT SAU IDN MYS VNM ITA ESP PRT SWE POL ZAF EGY RUS GUY MEX'.split(' ');
const english=new Intl.DisplayNames(['en'],{type:'region'});
const countryCodes=new Map(countries.flatMap((c,i)=>[[iso3[i],c.code],[english.of(c.code),c.code],[c.code,c.code]]));
const metrics=[
 [/^Announced capacity \(Mt CO2\/yr\)$/,'公布的二氧化碳年能力','百万吨 CO₂/年'],
 [/^Estimated capacity by IEA/,'IEA 估计年能力','百万吨 CO₂/年'],
 [/^Capacity \(MWel\)$|^Capacity_MWel$/,'电解装置容量','MWel'],
 [/^Capacity.*kt H2\/y/,'氢能年能力','千吨 H₂/年'],
 [/^Storage Capacity \(tonnes\)$/,'储存能力','吨'],
 [/^Length_km$/,'管道长度','km']
];
export function parseWorkbook(bytes,{product,filename,release,checkedAt=new Date().toISOString(),config}){
 const hash=digest(bytes),w=XLSX.read(bytes,{cellFormula:true}),rules=compileRules(config),records=[],sheets=[];
 const add=(r,sheet,cell)=>records.push({...r,id:digest([hash,sheet,cell].join('|')).slice(0,24),sheet,cell,sourceUrl:product.url,sourceId:'iea-'+product.id,filename,contentHash:hash,release,checkedAt});
 for(const name of w.SheetNames){const s=w.Sheets[name],rows=XLSX.utils.sheet_to_json(s,{header:1,defval:null,blankrows:true,range:0});sheets.push({name,range:s['!ref'],rows:rows.length});
  if(product.kind==='minerals'){
   if(/Total supply/i.test(name)){
    const yr=rows.findIndex(r=>r[1]>=2000&&r[1]<=2100&&r[4]>=2000&&r[4]<=2100);
    if(yr<0||!rows.slice(0,yr).some(r=>r.some(v=>/supply.*\(kt\)/i.test(text(v)))))throw Error('supply_schema_changed');
    for(const offset of [0,6]){let section='';for(let i=yr+1;i<rows.length;i++){const r=rows[i],object=text(r[offset]);if(!object)continue;if(![1,2,3,4].some(c=>typeof r[offset+c]==='number')){section=object;continue;}for(let c=1;c<=4;c++){const value=r[offset+c],period=String(rows[yr][offset+c]),cell=XLSX.utils.encode_cell({r:i,c:offset+c});if(typeof value!=='number'||!Number.isFinite(value)||!/^20\d{2}$/.test(period)||s[cell]?.f)continue;add({object,objectZh:object,metric:'矿产供应',unit:'kt',value,period,scenario:'Base case',scenarioZh:'基准情景',section,technology:'Mining / Refining',nature:c===1?'参考年（不推定为实测）':'情景预测',country:object,countryCode:countryCodes.get(object)||null,classification:{status:'unmatched',primary:null,reason:'国家矿产供应总量，未证明海洋能源专属范围'},rawValue:s[cell].w??String(value)},name,cell);}}}continue;
   }
   const yr=rows.findIndex(r=>Number.isInteger(r[1])&&r[1]>=2000&&r[1]<=2100&&r.filter(v=>Number.isInteger(v)&&v>=2000&&v<=2100).length>=3);if(yr<0)continue;
   if(!rows.slice(0,yr).some(r=>r.some(v=>/demand.*\(kt\)/i.test(text(v)))))throw Error('mineral_unit_or_schema_changed');
   let section='';const header=rows[yr-1];let scenario='';const columns=new Map();rows[yr].forEach((v,c)=>{if(text(header[c]))scenario=text(header[c]);if(Number.isInteger(v)&&v>=1900&&v<=2100)columns.set(c,{year:String(v),scenario:c===1?'参考年（原表）':scenario});});
   for(let i=yr+1;i<rows.length;i++){const r=rows[i],label=text(r[0]);if(!label)continue;if(![...columns.keys()].some(c=>typeof r[c]==='number')){section=label;continue;}
    for(const [c,dim] of columns){const value=r[c],cell=XLSX.utils.encode_cell({r:i,c});if(typeof value!=='number'||!Number.isFinite(value)||s[cell]?.f)continue;add({object:label,objectZh:zh(label),metric:'矿产需求',unit:'kt',value,period:dim.year,scenario:dim.scenario,scenarioZh:zh(dim.scenario),section,technology:name,nature:c===1?'参考年（不推定为实测）':'情景预测',country:'GLOBAL',classification:{status:'unmatched',primary:null,reason:'矿产／技术总量，未证明海洋能源专属范围'},rawValue:s[cell].w??String(value)},name,cell);}
   }continue;
  }
  const hi=rows.findIndex(r=>r.some(v=>text(v)==='Project name'));if(hi<0)continue;
  const heads=rows[hi].map(text),idx=n=>heads.indexOf(n);if(idx('Project name')<0)throw Error('project_schema_changed');sheets.at(-1).headerSignature=digest(JSON.stringify(heads));
  for(let i=hi+1;i<rows.length;i++){const r=rows[i],object=text(r[idx('Project name')]);if(!object)continue;
   const raw=Object.fromEntries(heads.map((h,c)=>[h,r[c]]).filter(([h])=>h));
   // References are evidence links, not classification text: URL words cannot prove scope.
   const context=Object.entries(raw).filter(([h])=>!/^Ref|^Link|^Country|^Partners|^Participants/i.test(h)).map(([,v])=>text(v)).join(' ');
   const explicit=/\boffshore\b|\bsubsea\b|\bseabed\b|Northern Lights/i.test(context);
   const classification=explicit?classifyRecord({title:object,content:context},rules):{status:'unmatched',primary:null,reason:'原表未明确海洋能源范围，保留候选'};
   const country=text(raw['Country or economy']||raw['Country (ISO-3)']||raw['Country (ISO)']||raw['Country_1 (ISO)'])||'未提供';
   const status=text(raw['Project status']||raw.Status||raw.Availability)||'未提供';
   const refs=Object.entries(raw).filter(([h,v])=>/^Ref/i.test(h)&&/^https?:\/\//.test(String(v))).map(([,v])=>v);
   const common={object,objectZh:object,country,countryCode:countryCodes.get(country)||null,status,statusZh:zh(status),classification,projectId:text(raw.ID||raw.Reference||raw.Ref),projectType:text(raw['Project type']||raw.Technology||name),period:null,onlineOriginal:raw.Operation??raw['Date online']??null,nature:'项目披露能力／登记快照（非实际产量）',scenario:'项目快照',scenarioZh:'项目快照',section:name,refs,scopeEvidence:context};
   let count=0;
   for(let c=0;c<heads.length;c++){const def=metrics.find(([re])=>re.test(heads[c])),v=r[c],cell=XLSX.utils.encode_cell({r:i,c});if(!def||typeof v!=='number'||!Number.isFinite(v)||s[cell]?.f)continue;add({...common,metric:def[1],unit:def[2],value:v,rawValue:s[cell].w??String(v)},name,cell);count++;}
   if(!count)add({...common,metric:'项目登记',unit:'条',value:1,nature:'登记记录数量，非容量',rawValue:'1'},name,XLSX.utils.encode_cell({r:i,c:idx('Project name')}));
  }
 }
 if(!records.length)throw Error('no_supported_tables');
 return {productId:product.id,kind:product.kind,name:product.name,sourceUrl:product.url,filename,release,checkedAt,contentHash:hash,licence:'CC BY 4.0',parserVersion:'iea-v1',sheets,records,counts:Object.fromEntries(['accepted','unmatched','excluded'].map(s=>[s,records.filter(r=>r.classification.status===s).length]))};
}
export function commitVersion(state,dataset){
 state.datasets||={};state.history||=[];const key=dataset.productId+'|'+dataset.filename.replace(/20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December/g,'').trim(),old=state.datasets[key];
 if(old?.contentHash===dataset.contentHash){old.checkedAt=dataset.checkedAt;old.sheets=dataset.sheets;return false;}
 if(old?.sheets.some(s=>s.headerSignature&&!dataset.sheets.some(n=>n.name===s.name&&n.headerSignature===s.headerSignature)))throw Error('schema_changed_review_required');
 const recordKey=r=>[r.sheet,r.projectId||r.object,r.metric,r.period,r.scenario,r.section].join('|');const before=new Map((old?.records||[]).map(r=>[recordKey(r),r.value]));let added=0,changed=0;for(const r of dataset.records){const k=recordKey(r);if(!before.has(k))added++;else if(before.get(k)!==r.value)changed++;before.delete(k);}
 state.history.push({key,at:dataset.checkedAt,hash:dataset.contentHash,previousHash:old?.contentHash||null,added,changed,removed:before.size,filename:dataset.filename,release:dataset.release});state.datasets[key]=dataset;return true;
}
export async function collectIEA(dir,{force=false}={}){
 // Public replacements are the normal unattended path. The authenticated
 // legacy importer remains available only when explicitly requested.
 if(process.env.INTEL_IEA_AUTHENTICATED_DATASETS!=='true'){
  const result=await collectPublicReplacements(dir);
  await updateOilpriceMetrics(dir);
  return result;
 }
 const file=path.join(dir,'snapshot.json'),data=await readSnapshot(file);const state=data.ieaDatasets||={datasets:{},history:[],products:{}};state.products||={};
 const home=process.env.IEA_DATA_HOME||path.join(dir,'iea'),session=process.env.IEA_SESSION_FILE||path.join(home,'session.json');await fs.mkdir(path.join(home,'archive'),{recursive:true});const config=snapshotRules(data);
 let browser;
 try{
  const due=products.filter(p=>force||!state.products[p.id]?.nextCheck||Date.parse(state.products[p.id].nextCheck)<=Date.now());if(!due.length)return;
  browser=await chromium.launch({headless:true,...(process.env.IEA_BROWSER?{executablePath:process.env.IEA_BROWSER}:{}),...(process.env.DOWNLOAD_PROXY?{proxy:{server:process.env.DOWNLOAD_PROXY}}:{})});
  const context=await browser.newContext({storageState:session,acceptDownloads:true});delete state.lastError;
  for(const p of due){const now=new Date().toISOString(),report={id:'iea-'+p.id,name:p.name,url:p.url,language:'en',level:'S1',method:'authenticated-xlsx',checkedAt:now,status:'ready',scope:'官方工作簿；逐记录执行六领域规则；候选不进入业务指标'};const page=await context.newPage();try{
   await page.goto(p.url,{waitUntil:'networkidle',timeout:60000});await page.waitForTimeout(1500);
   const body=await page.locator('body').innerText();if(/not logged in|session has expired/i.test(body))throw Error('login_required');if(!body.includes('CC BY 4.0'))throw Error('licence_changed');
   const release=body.match(/Last updated\s+([^\n]+\n?[^\n]*)/)?.[1]?.split('\n').filter(Boolean)[0]||null;
   const links=await page.locator('a[href^="/product/download/"]').evaluateAll(xs=>[...new Set(xs.map(x=>x.getAttribute('href')))]);if(!links.length)throw Error('download_links_missing');
   const pending=[];
   for(const link of links){const waiting=page.waitForEvent('download',{timeout:60000});await page.locator(`a[href="${link}"]`).first().click();const download=await waiting;const filename=path.basename(download.suggestedFilename());if(!/\.xlsx$/i.test(filename))throw Error('unsupported_download_format');const temp=path.join(home,'incoming.xlsx');await download.saveAs(temp);const bytes=await fs.readFile(temp);await fs.unlink(temp);if(bytes.length>40*1024*1024||bytes.subarray(0,2).toString()!=='PK')throw Error('invalid_workbook');const parsed=parseWorkbook(bytes,{product:p,filename,release,config,checkedAt:now});parsed.archive=parsed.contentHash+'.xlsx';await fs.writeFile(path.join(home,'archive',parsed.archive),bytes,{flag:'w',mode:0o600});await fs.writeFile(path.join(home,'archive',parsed.contentHash+'.json'),JSON.stringify(parsed));pending.push(parsed);}
   const next=structuredClone(state);for(const parsed of pending)commitVersion(next,parsed);state.datasets=next.datasets;state.history=next.history;report.records=pending.reduce((n,d)=>n+d.records.length,0);state.products[p.id]={lastSuccess:now,nextCheck:new Date(Date.now()+7*86400000).toISOString(),status:'ready'};
  }catch(e){report.status='failed';report.error=['login_required','licence_changed','download_links_missing','unsupported_download_format','invalid_workbook','no_supported_tables'].includes(e.message)?e.message:'download_or_parse_failed';state.products[p.id]={...state.products[p.id],lastAttempt:now,nextCheck:new Date(Date.now()+6*3600000).toISOString(),status:report.error};}finally{await page.close();}
  data.sources=[...(data.sources||[]).filter(s=>s.id!==report.id),report];
  }
  await context.storageState({path:session});await fs.chmod(session,0o600);
 }catch{state.lastError='登录会话或浏览器不可用；保留历史数据，请更新 IEA 登录会话';for(const p of products){state.products[p.id]={...state.products[p.id],status:'session_or_browser_unavailable'};const old=data.sources?.find(s=>s.id==='iea-'+p.id);data.sources=[...(data.sources||[]).filter(s=>s.id!=='iea-'+p.id),{...old,id:'iea-'+p.id,name:p.name,url:p.url,status:'failed',error:state.lastError,checkedAt:new Date().toISOString()}];}}
 finally{await browser?.close();data.ieaDatasets=state;data.generatedAt=new Date().toISOString();await saveTaskWorkspace(file,data);}
}
if(process.argv[1]?.endsWith('iea-datasets.mjs'))await collectIEA(process.env.INTEL_DATA_DIR||'.data/intelligence',{force:process.argv.includes('--force')});
