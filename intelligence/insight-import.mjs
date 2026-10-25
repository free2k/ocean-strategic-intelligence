import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {id,chunks,countries,topics} from './core.mjs';
import {standardTopics,canonicalTopic} from './industry-topics.mjs';
import {compileRules,classifyRecord} from './industry-classification.mjs';
import {snapshotRules} from './published-rules.mjs';
import {exactValue} from './quant-preview/metric-normalize.mjs';
import {textSlice} from './unicode-text.mjs';

const exec=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
const maxBytes=8*1024*1024,maxRows=1000;
const types={'.csv':'text/csv','.tsv':'text/tab-separated-values','.json':'application/json','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.txt':'text/plain','.md':'text/plain','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pdf':'application/pdf'};
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(value,max=300)=>textSlice(String(value??'').trim(),0,max);
const aliases={metric:['指标','指标名称','名称','metric','name'],subject:['对象','主体','项目','项目名称','subject','object','project'],period:['统计期','期间','日期','年份','月份','period','date','year','month'],value:['数值','值','数据','value','amount'],unit:['单位','计量单位','unit'],topic:['领域','研究领域','行业','行业分类','topic','industry'],country:['国家','国家代码','区域','country','countrycode'],nature:['数据性质','性质','nature'],sourceUrl:['来源地址','来源链接','原始链接','sourceurl','url']};
export const importFields=Object.entries(aliases).map(([key,names])=>({key,name:names[0]}));
const normalizeHeader=s=>String(s).replace(/[\s_\-（）()]/g,'').toLowerCase();

export function parseDelimited(content){
 const first=content.split(/\r?\n/).find(s=>s.trim())||'',separator=first.includes('\t')?'\t':',',rows=[];
 let row=[],cell='',quoted=false;
 for(let i=0;i<content.length;i++){
  const c=content[i];
  if(c==='"'){if(quoted&&content[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=c;}
  else if(!quoted&&(c===separator||c==='\n'||c==='\r')){
   row.push(cell);cell='';
   if(c!==separator){if(row.some(v=>v.trim()))rows.push(row);row=[];if(c==='\r'&&content[i+1]==='\n')i++;}
  }else cell+=c;
  if(rows.length>maxRows+1)fail(`每次最多导入 ${maxRows} 行，请拆分文件`);
 }
 if(quoted)fail('表格的引号未闭合，请检查 CSV 格式');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}

function table(rows,name){
 if(!Array.isArray(rows)||rows.length<2)fail('表格需要表头和至少一行数据');
 if(rows.length>maxRows+1)fail(`每次最多导入 ${maxRows} 行，请拆分文件`);
 const columns=rows[0].map(v=>text(v,160));
 if(columns.length>80||columns.some(v=>!v)||new Set(columns).size!==columns.length)fail('表头需完整且不重复，最多支持 80 列');
 return {name,columns,rows:rows.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map((r,i)=>({line:i+2,values:columns.map((_,n)=>r[n]??'')}))};
}
function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\ufeff/,'');}catch{return new TextDecoder('gb18030',{fatal:true}).decode(bytes).replace(/^\ufeff/,'');}}

async function parseFile(folder,input){
 const mode=input.mode==='news'?'news':'data';
 const name=text(input.name||(mode==='news'?'粘贴资讯.txt':'粘贴数据.csv'),160).replace(/[\\/\x00-\x1f]/g,'_');
 const ext=path.extname(name).toLowerCase();
 if(!types[ext])fail('支持 CSV、TSV、XLSX、JSON、TXT、MD、DOCX、PDF');
 let bytes;
 if(input.base64!==undefined){
  if(typeof input.base64!=='string'||!input.base64||input.base64.length>Math.ceil(maxBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))fail('文件无效或超过 8MB');
  bytes=Buffer.from(input.base64,'base64');
 }else bytes=Buffer.from(String(input.text||''));
 if(!bytes.length||bytes.length>maxBytes)fail('请上传 8MB 以内的文件或填写正文');
 if(['.xlsx','.docx'].includes(ext)&&bytes.subarray(0,2).toString()!=='PK'||ext==='.pdf'&&!bytes.subarray(0,5).toString().startsWith('%PDF-'))fail('文件内容与扩展名不一致');
 await fs.mkdir(folder,{recursive:true,mode:0o700});
 const file=path.join(folder,'original'+ext);await fs.writeFile(file,bytes,{mode:0o600});
 const result={name,ext,mode,size:bytes.length,fileHash:digest(bytes),sheets:[],content:''};
 if(['.xlsx','.docx'].includes(ext))await exec('python3',[path.join(root,'read-office.py'),file],{timeout:30000,maxBuffer:2*1024*1024}).then(r=>{if(ext==='.docx')result.content=r.stdout;}).catch(()=>fail('文档无法解析或解压后过大，请转换为 CSV / TXT 后重试'));
 if(ext==='.xlsx'){
  const module=await import('xlsx'),XLSX=module.default||module,book=XLSX.read(bytes,{type:'buffer',cellDates:false,cellNF:true,sheetRows:maxRows+2});
  if(book.SheetNames.length>20)fail('工作簿最多支持 20 张工作表，请拆分文件');
  for(const name of book.SheetNames){
   const sheet=book.Sheets[name],range=sheet['!ref']&&XLSX.utils.decode_range(sheet['!ref']);
   if(range&&XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']).e.r-range.s.r>maxRows)fail(`工作表“${name}”超过 ${maxRows} 行，请拆分文件`);
   const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
   for(let r=1;range&&r<rows.length;r++)for(let c=0;c<rows[r].length;c++){
    const cell=sheet[XLSX.utils.encode_cell({r:range.s.r+r,c:range.s.c+c})];
    if(cell?.t==='n'&&XLSX.SSF.is_date(cell.z||'')){const date=XLSX.SSF.parse_date_code(cell.v);if(date){const format=cell.z.replace(/"[^"]*"/g,'').toLowerCase();rows[r][c]=`${date.y}${/m|d/.test(format)?'-'+String(date.m).padStart(2,'0'):''}${/d/.test(format)?'-'+String(date.d).padStart(2,'0'):''}`;}}
   }
   if(rows.length>1)result.sheets.push(table(rows,name));
  }
 }else if(ext==='.json'){
  let rows;try{rows=JSON.parse(decode(bytes));}catch{fail('JSON 格式无效');}
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||Array.isArray(r)||typeof r!=='object'))fail('JSON 需为由记录对象组成的数组');
  const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  if(rows.some(r=>Object.values(r).some(v=>v!==null&&typeof v==='object')))fail('JSON 记录字段需为文本或数值');
  result.sheets=[table([columns,...rows.map(r=>columns.map(k=>r[k]??''))],'数据')];
 }else if(['.csv','.tsv'].includes(ext)||mode==='data'&&['.txt','.md'].includes(ext))result.sheets=[table(parseDelimited(decode(bytes)),'数据')];
 else if(ext==='.pdf'){
  const info=await exec('pdfinfo',[file],{timeout:15000,maxBuffer:1024*1024}).catch(()=>fail('PDF 无法解析，请转换为 TXT 或粘贴正文'));
  const pages=Number(info.stdout.match(/Pages:\s+(\d+)/)?.[1]);if(!pages||pages>20)fail('PDF 最多支持 20 页，请拆分文件');
  result.content=(await exec('pdftotext',['-layout',file,'-'],{timeout:30000,maxBuffer:2*1024*1024}).catch(()=>fail('PDF 正文提取失败，请粘贴正文'))).stdout;
 }else if(ext!=='.docx')result.content=decode(bytes);
 if(mode==='news'&&!result.content&&result.sheets.length)fail('请将表格作为“数据表格”导入');
 if(mode==='data'&&!result.sheets.length)fail('数据表格请使用 CSV、TSV、XLSX、JSON，或粘贴带表头的表格');
 if(mode==='news'&&(result.content.trim().length<15||result.content.length>60000))fail('资讯正文需为 15–60,000 字；扫描件请先识别或粘贴文字');
 return result;
}

export function importPeriod(value){
 const s=text(value,40).replace(/年/g,'-').replace(/月/g,'').replace(/\//g,'-').replace(/\.$/,'');
 let m=s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2})日?)?$/);
 if(m){const period=`${m[1]}-${m[2].padStart(2,'0')}${m[3]?'-'+m[3].padStart(2,'0'):''}`,date=new Date(period+(m[3]?'':'-01')+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,m[3]?10:7)===period?period:null;}
 if(/^\d{4}-?Q[1-4]$/i.test(s))return s.toUpperCase().replace(/^(\d{4})Q/,'$1-Q');
 return /^\d{4}-?$/.test(s)?s.slice(0,4):null;
}
const frequency=p=>p.includes('Q')?'季度':p.length===4?'年度':p.length===10?'日度':'月度';
function metadata(input={}){
 const value=Object.fromEntries(['title','sourceName','sourceUrl','publishedAt','topic','country','unit','nature','note'].map(k=>[k,text(input[k],k==='note'?2000:300)]));
 value.topic=canonicalTopic(value.topic);if(value.topic&&!topics.includes(value.topic))fail('请选择当前系统的研究领域');
 if(value.country&&!countries.some(c=>c.code===value.country))fail('请选择有效国家');
 if(value.sourceUrl){try{const url=new URL(value.sourceUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();value.sourceUrl=url.href;}catch{fail('原始链接需为有效的 http / https 地址');}}
 if(value.publishedAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.publishedAt)||importPeriod(value.publishedAt)!==value.publishedAt))fail('发布日期无效');
 if(value.nature&&!['实际','计划','预测','设计能力','未分类'].includes(value.nature))fail('数据性质无效');
 return value;
}
function classification(record,topic,compiled){return topic?{status:'accepted',primary:topic,topics:[topic],manual:true,positive:[],negative:[],reason:'导入时指定领域',version:compiled.version}:classifyRecord(record,compiled);}
function mapped(sheet,input){const mapping={};for(const [key,names]of Object.entries(aliases)){const guessed=sheet.columns.find(c=>names.includes(normalizeHeader(c)));const chosen=input?.[key];if(chosen!==undefined&&chosen!==''&&!sheet.columns.includes(chosen))fail('字段映射已变化，请重新选择列');mapping[key]=chosen===undefined?guessed||'':chosen;}return mapping;}
function existingFingerprints(data){const values=new Set();for(const kind of ['documents','observations'])for(const row of data[kind]||[])for(const k of ['fingerprint','importFingerprint'])if(row.ingestion?.[k])values.add(row.ingestion[k]);for(const edit of Object.values(data.insightEdits||{}))if(edit.original?.ingestion?.fingerprint)values.add(edit.original.ingestion.fingerprint);return values;}

export function analyzeImport(parsed,options,data){
 const meta=metadata(options.metadata),compiled=compileRules(snapshotRules(data)),sheet=parsed.sheets.find(s=>s.name===options.sheet)||parsed.sheets[0];
 const mapping=parsed.mode==='data'?mapped(sheet,options.mapping):{},issues=[],candidates=[],seen=existingFingerprints(data);
 const title=meta.title||parsed.name,sourceName=meta.sourceName||parsed.name;
 const add=(row)=>{
  const reason=!row.metric?'缺少指标名称':!row.unit?'缺少单位':row.value===null?'数值不是精确单值，请保留原文或修正后导入':row.invalidPeriod?'统计期无效':row.invalidTopic?'研究领域不属于当前系统':'';
  if(reason){issues.push({line:row.line,reason});return;}
  const fingerprint=digest([sourceName,row.sourceUrl||meta.sourceUrl,row.metric,row.subject,row.period,row.rawValue,row.unit,row.nature,row.topic,row.country]);
  const duplicate=seen.has(fingerprint);seen.add(fingerprint);
  candidates.push({...row,fingerprint,duplicate});
 };
 if(parsed.mode==='data'){
  if(!mapping.value)fail('请选择“数值”对应的列');
  for(const row of sheet.rows){const get=k=>text(row.values[sheet.columns.indexOf(mapping[k])]);
   const rawValue=get('value'),unit=get('unit')||meta.unit,periodRaw=get('period'),period=periodRaw?importPeriod(periodRaw):null;
   const requestedTopic=canonicalTopic(get('topic')||meta.topic),topic=topics.includes(requestedTopic)?requestedTopic:'';
   const decision=classification({title:[title,get('metric'),get('subject')].join(' '),content:meta.note},topic,compiled);
   const countryRaw=get('country')||meta.country,country=countries.find(c=>c.code===countryRaw.toUpperCase()||c.name===countryRaw)?.code||'';
   const nature=get('nature')||meta.nature||'未分类';
   const quote=sheet.columns.map((c,i)=>`${c}：${text(row.values[i])}`).join('；');
   const sourceUrl=get('sourceUrl')||meta.sourceUrl;
   if(sourceUrl&&!/^https?:\/\/[^\s]+$/i.test(sourceUrl)){issues.push({line:row.line,reason:'来源链接无效'});continue;}
   if(countryRaw&&!country){issues.push({line:row.line,reason:'国家未识别，请使用国家名称或两位代码'});continue;}
   if(!['实际','计划','预测','设计能力','未分类'].includes(nature)){issues.push({line:row.line,reason:'数据性质需为实际、计划、预测、设计能力或未分类'});continue;}
   add({line:row.line,metric:get('metric')||title,subject:get('subject')||title,rawValue,value:exactValue(rawValue,unit),unit,period,nature,topic:decision.primary||'',industry:decision,country,sourceUrl,quote,invalidPeriod:!!periodRaw&&!period,invalidTopic:!!requestedTopic&&!topic});
  }
 }else{
  // Numeric evidence is extracted locally. Uploaded text is never executed or
  // passed to a model, and uncertain values stay out of numeric charts.
  const decision=classification({title,content:parsed.content},meta.topic,compiled);
  const sentences=parsed.content.split(/(?<=[。！？!?\n；;])/u),units='万吨/年|吨/年|亿元/年|万千瓦|亿千瓦时|万千瓦时|千瓦时|千瓦|兆瓦|吉瓦|万吨|亿元|万元|亿美元|万美元|吨|%|％|Mt/yr|t/yr|GWh|MWh|kWh|GW|MW|kW';
  for(const [i,sentence]of sentences.entries()){
   const re=new RegExp(`([+-]?\\d[\\d,]*(?:\\.\\d+)?)\\s*(${units})(?![A-Za-z])`,'g');let match;
   while((match=re.exec(sentence))){
    const prefix=sentence.slice(0,match.index),label=[...prefix.matchAll(/装机容量|年发电量|发电量|投资额|投资|减排量|封存能力|封存量|产量|能耗|能效|容量|利用率|效率|碳排放量/g)].at(-1)?.[0]||'原文数值';
    const periodMatch=[...prefix.matchAll(/\d{4}年(?:\d{1,2}月)?|\d{4}-\d{2}(?:-\d{2})?|\d{4}-Q[1-4]/g)].at(-1)?.[0];
    const unit=match[2]==='％'?'%':match[2],rawValue=match[1],approx=/约|超过|超|近|至少|不低于|不超过|余|[<>≤≥~～]\s*$/.test(prefix.slice(-6));
    add({line:i+1,metric:label,subject:title,rawValue:approx?'约'+rawValue:rawValue,value:approx?null:exactValue(rawValue,unit),unit,period:periodMatch?importPeriod(periodMatch):null,nature:meta.nature||(/计划|拟|将|预计/.test(sentence)?'计划':/设计/.test(sentence)?'设计能力':'未分类'),topic:decision.primary||'',industry:decision,country:meta.country,sourceUrl:meta.sourceUrl,quote:sentence.trim()});
    if(candidates.length+issues.length>maxRows)fail(`提取结果超过 ${maxRows} 条，请拆分资讯`);
   }
  }
 }
 const docIndustry=classification({title,content:parsed.mode==='news'?parsed.content:[meta.note,...candidates.slice(0,20).map(r=>r.metric+' '+r.subject)].join('\n')},meta.topic,compiled);
 const documentFingerprint=digest([parsed.fileHash,parsed.mode,meta,sheet?.name||'',mapping]);
 const fresh=candidates.filter(c=>!c.duplicate),groups=new Map();
 for(const row of fresh.filter(c=>c.period&&c.industry.status==='accepted')){const key=JSON.stringify([sourceName,row.sourceUrl,row.metric,row.subject,row.unit,row.nature,row.topic,row.country,frequency(row.period)]);const group=groups.get(key)||new Map();const prior=group.get(row.period);if(prior&&prior.value!==row.value)issues.push({line:row.line,reason:'同一指标与统计期出现不同数值，将保留为指标记录，不合并趋势'});group.set(row.period,row);groups.set(key,group);}
 return {metadata:meta,mapping,sheet:sheet?.name||'',title,sourceName,ruleVersion:compiled.version,documentFingerprint,documentDuplicate:seen.has(documentFingerprint),docIndustry,candidates,issues,summary:{rows:parsed.mode==='data'?sheet.rows.length:candidates.length+issues.length,valid:candidates.length,duplicates:candidates.filter(c=>c.duplicate).length,ready:fresh.length,issues:issues.length,accepted:fresh.filter(c=>c.industry.status==='accepted').length,series:[...groups.values()].filter(g=>g.size>=2).length}};
}

const draftPath=(dir,key)=>{if(!/^[a-f0-9-]{36}$/.test(key))fail('导入草稿编号无效');return path.join(dir,'data-imports',key);};
async function saveDraft(dir,draft){const file=path.join(draftPath(dir,draft.id),'draft.json'),tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(draft),{mode:0o600});await fs.rename(tmp,file);}
async function readDraft(dir,key,actor){let draft;try{draft=JSON.parse(await fs.readFile(path.join(draftPath(dir,key),'draft.json'),'utf8'));}catch(error){if(error.status)throw error;fail('导入草稿不存在，请重新分析',404);}if(actor&&draft.actor!==actor)fail('导入草稿不属于当前登录会话',404);return draft;}
function preview(draft){const a=draft.analysis;return {id:draft.id,revision:draft.revision,name:draft.parsed.name,mode:draft.parsed.mode,sheets:draft.parsed.sheets.map(s=>({name:s.name,rows:s.rows.length})),columns:draft.parsed.sheets.find(s=>s.name===a.sheet)?.columns||[],fields:importFields,topics:standardTopics,countries,metadata:a.metadata,mapping:a.mapping,sheet:a.sheet,summary:a.summary,document:{title:a.title,classification:a.docIndustry,duplicate:a.documentDuplicate,excerpt:textSlice(draft.parsed.content||a.candidates.map(r=>r.quote).join('\n'),0,1000)},items:a.candidates.slice(0,100).map(({industry,...r})=>({...r,status:industry.status})),issues:a.issues.slice(0,50),method:'本地文件解析、领域规则与逐字数值提取'};}
export async function previewImport(store,input,actor){
 let draft;
 if(input.draftId){draft=await readDraft(store.dir,input.draftId,actor);if(draft.committed)fail('这份资料已汇入，请重新上传需要新增的资料',409);}
 else{const key=randomUUID();draft={id:key,actor,createdAt:new Date().toISOString(),parsed:await parseFile(draftPath(store.dir,key),input)};}
 draft.analysis=analyzeImport(draft.parsed,{metadata:input.metadata||draft.analysis?.metadata,mapping:input.mapping,sheet:input.sheet},store.data);draft.revision=randomUUID();await saveDraft(store.dir,draft);return preview(draft);
}

export function buildImportedData(data,draft,analysis=draft.analysis){
 const a=analysis,at=new Date().toISOString(),base={method:'import',batchId:draft.id,filename:draft.parsed.name,importedAt:at,fileHash:draft.parsed.fileHash},sourceId=id('importsource',[a.sourceName,a.metadata.sourceUrl].join('|'));
 const next={...data,generatedAt:at};for(const kind of ['sources','documents','observations','evidence','events','series'])next[kind]=[...(data[kind]||[])];
 if(!next.sources.some(s=>s.id===sourceId))next.sources.push({id:sourceId,name:a.sourceName,url:a.metadata.sourceUrl,method:'import',status:'ready',scope:'用户导入资料',manual:true,checkedAt:at,ingestion:base});
 const fresh=a.candidates.filter(c=>!c.duplicate),documentGroups=new Map(),documentForRow=new Map();let documents=0;
 if(draft.parsed.mode==='news')documentGroups.set('news',{rows:fresh,industry:a.docIndustry});
 else for(const row of fresh){const key=JSON.stringify([row.industry.status,row.topic,row.country]),group=documentGroups.get(key)||{rows:[],industry:row.industry};group.rows.push(row);documentGroups.set(key,group);}
 for(const [key,group]of documentGroups){
  const fingerprint=key==='news'?a.documentFingerprint:digest([a.documentFingerprint,key]),documentId=id('importdoc',fingerprint),prior=next.documents.find(d=>d.id===documentId);
  let document=prior;
  if(!document){
   const content=draft.parsed.mode==='news'?draft.parsed.content:group.rows.map(r=>r.quote).join('\n');
   document={id:documentId,versionId:id('ver',fingerprint),title:a.title,titleZh:a.title,sourceId,url:a.metadata.sourceUrl||`api/insight-data/import/${draft.id}/file`,content,summaryZh:textSlice(content,0,300),language:/[\u4e00-\u9fff]/.test(content)?'zh':'unknown',publishedAt:a.metadata.publishedAt||null,collectedAt:at,manual:true,industry:group.industry,topic:group.industry.primary,countries:[...new Set([...(key==='news'?[a.metadata.country]:[]),...group.rows.map(r=>r.country)].filter(Boolean))],chunks:chunks(content),ingestion:{...base,fingerprint,importFingerprint:a.documentFingerprint},autoExtraction:{status:'completed',method:'本地导入提取'}};
   next.documents.push(document);documents++;
   if(content.trim().length>=10){const quote=textSlice(content,0,350),proof={id:id('ev',document.versionId+quote),documentId,versionId:document.versionId,quote,start:0,manual:true,ingestion:base};next.evidence.push(proof);next.events.push({id:id('event',documentId),documentId,title:a.title,summary:document.summaryZh,type:'导入资料',topic:document.topic,countries:document.countries,publishedAt:document.publishedAt,eventDate:null,dateBasis:'资料导入，事件日期未指定',status:'candidate',entityIds:[],evidenceIds:[proof.id],manual:true,ingestion:base});}
  }
  for(const row of group.rows)documentForRow.set(row.fingerprint,document);
 }
 // All data rows are retained as traceable observations. A trend additionally
 // requires one scope, unit, nature and frequency, with no conflicting periods.
 const seriesGroups=new Map();let observations=0,points=0,conflicts=0;
 for(const row of fresh){
  const document=documentForRow.get(row.fingerprint);
  if(!document)continue;
  const ingestion={...base,fingerprint:row.fingerprint,line:row.line,sheet:a.sheet},proofId=id('ev',document.versionId+row.quote);
  if(!next.evidence.some(e=>e.id===proofId))next.evidence.push({id:proofId,documentId:document.id,versionId:document.versionId,quote:row.quote,start:document.content.indexOf(row.quote),manual:true,ingestion});
  next.observations.push({id:id('importobs',row.fingerprint),documentId:document.id,name:row.metric,subject:row.subject,rawValue:row.rawValue,unit:row.unit,period:row.period,nature:row.nature,sourceUrl:row.sourceUrl,status:'candidate',countries:row.country?[row.country]:[],evidenceIds:[proofId],manual:true,ingestion});observations++;
  if(!row.period||row.industry.status!=='accepted')continue;
  const key=JSON.stringify([a.sourceName,row.sourceUrl,row.metric,row.subject,row.unit,row.nature,row.topic,row.country,frequency(row.period)]),group=seriesGroups.get(key)||[];group.push(row);seriesGroups.set(key,group);
 }
 for(const [key,rows]of seriesGroups){
  const sid=id('importseries',key),prior=next.series.find(s=>s.id===sid),values=new Map(),conflicting=new Set();
  for(const row of rows){if(values.has(row.period)&&values.get(row.period).value!==row.value)conflicting.add(row.period);values.set(row.period,row);}
  for(const row of rows)if(prior?.rows.some(p=>p.period===row.period&&p.value!==row.value))conflicting.add(row.period);
  conflicts+=conflicting.size;
  const accepted=[...values.values()].filter(r=>!conflicting.has(r.period)),first=accepted[0];if(!first)continue;
  const pointRows=accepted.map(r=>({period:r.period,value:r.value,sourceUrl:r.sourceUrl||a.metadata.sourceUrl,documentId:documentForRow.get(r.fingerprint).id,manual:true,ingestion:{...base,line:r.line,sheet:a.sheet,fingerprint:r.fingerprint}}));
  const merged=[...new Map([...(prior?.rows||[]),...pointRows].map(r=>[r.period,r])).values()].sort((a,b)=>a.period.localeCompare(b.period));
  const series={...(prior||{}),id:sid,name:first.metric+' · '+first.subject,sourceId:prior?.sourceId||sourceId,sourceUrl:first.sourceUrl||a.metadata.sourceUrl,topic:first.topic,industry:first.industry,unit:first.unit,nature:first.nature,country:first.country||null,frequency:frequency(first.period),note:a.metadata.note||'用户导入，按同一对象、指标、单位、性质与统计频率分组；请对照导入原件核验。',checkedAt:at,rows:merged,manual:true,ingestion:prior?.ingestion||base};
  next.series=next.series.filter(s=>s.id!==sid);next.series.push(series);points+=pointRows.filter(r=>!prior?.rows.some(p=>p.period===r.period)).length;
 }
 return {data:next,result:{ok:true,id:draft.id,documents,observations,points,duplicates:a.summary.duplicates,skipped:a.summary.issues,conflicts,sourceId,at}};
}

export async function commitImport(store,input,actor){
 if(store.pool)await store.refresh();
 const draft=await readDraft(store.dir,input.id,actor),receipt=store.data.insightImportResults?.[draft.id];if(receipt)return {...receipt,repeated:true};
 if(input.revision!==draft.revision)fail('分析结果已变化，请重新分析后汇入',409);
 if(draft.analysis.ruleVersion!==compileRules(snapshotRules(store.data)).version)fail('领域规则已更新，请重新分析后汇入',409);
 const analysis=analyzeImport(draft.parsed,draft.analysis,store.data);
 if(!analysis.summary.ready&&draft.parsed.mode==='data')fail(analysis.summary.duplicates?'有效数据已存在，没有需要重复汇入的记录':'没有通过校验的数据，请检查字段映射、单位和数值',409);
 if(draft.parsed.mode==='news'&&analysis.documentDuplicate)fail('这份资讯已存在，无需重复汇入',409);
 const changed=buildImportedData(store.data,draft,analysis);changed.data.insightImportResults={...store.data.insightImportResults,[draft.id]:changed.result};
 const before=store.data;await store.import(changed.data,{mirror:false});
 if(store.pool)await store.persist().catch(error=>console.error('import snapshot mirror:',error.code||error.name));
 else try{await store.persist();}catch(error){store.data=before;throw error;}
 draft.committed=changed.result;await saveDraft(store.dir,draft).catch(()=>{});return changed.result;
}

export async function serveInsightImport(req,res,url,{store,serial,body,json,actor}){
 if(!url.pathname.startsWith('/api/insight-data/import/'))return false;
 try{
  if(req.method==='GET'&&url.pathname==='/api/insight-data/import/options'){json(res,200,{topics:standardTopics,countries,fields:importFields});return true;}
  const file=url.pathname.match(/^\/api\/insight-data\/import\/([a-f0-9-]{36})\/file$/);
  if(req.method==='GET'&&file){const draft=await readDraft(store.dir,file[1]);if(!store.data.insightImportResults?.[draft.id])fail('原件尚未汇入数据池',404);const bytes=await fs.readFile(path.join(draftPath(store.dir,draft.id),'original'+draft.parsed.ext));res.writeHead(200,{'Content-Type':types[draft.parsed.ext],'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(draft.parsed.name),'Cache-Control':'private, no-store'});res.end(bytes);return true;}
  if(req.method!=='POST'){json(res,405,{error:'不支持的方法'});return true;}
  if(req.headers['sec-fetch-site']==='cross-site')fail('跨站请求已拒绝',403);
  if(!['/api/insight-data/import/preview','/api/insight-data/import/commit'].includes(url.pathname))fail('导入接口不存在',404);
  const input=await body(req,12*1024*1024);
  const result=url.pathname.endsWith('/preview')?await previewImport(store,input,actor):await serial(()=>commitImport(store,input,actor));json(res,200,result);
 }catch(error){json(res,error.status||400,{error:error.status?error.message:error.message==='request too large'?'文件过大，请控制在 8MB 以内':'导入未完成，请检查文件或稍后重试'});}
 return true;
}
