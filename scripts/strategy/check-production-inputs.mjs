import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';
const release=process.argv[2];if(!release?.startsWith('/opt/ocean-intelligence/releases/'))throw Error('Expected staged release');
const {getQuantCatalog}=await import(pathToFileURL(path.join(release,'intelligence/quant-routes.mjs'))),{buildStudy,methodCatalog}=await import(pathToFileURL(path.join(release,'intelligence/strategy/service.mjs')));
const raw=JSON.parse(await fs.readFile('/opt/ocean-intelligence/data/snapshot.json','utf8')),catalog=getQuantCatalog(raw,{});let tested=0;
for(const s of catalog.series){try{const r=buildStudy(catalog,{title:'只读工程取数核验（不保存为业务研究）',method:'growth',dataset:{kind:'series',id:s.id},scope:{},confirmed:true,input:{rows:[{period:'2000',value:99999999}]}});if(r.input.rows.length!==s.rows.length||r.input.rows.some((r,i)=>r.value!==s.rows[i].value))throw Error('Server-owned snapshot mismatch');tested++;}catch(e){if(e.message==='Server-owned snapshot mismatch')throw e;}}
if(!tested)throw Error('No production statistical series passed the adapter');
console.log(JSON.stringify({readOnly:true,savedVersions:0,methods:methodCatalog.methods.length,implemented:methodCatalog.methods.filter(m=>m.status==='ready').length,productionSeriesChecked:tested,documents:raw.documents.length}));
