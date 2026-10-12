import {snapshotRules} from './published-rules.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {products,parseWorkbook,commitVersion} from './iea-datasets.mjs';
// Local/maintenance command. Accepts an original workbook, never account credentials.
const args=Object.fromEntries(process.argv.slice(2).map((s,i,a)=>s.startsWith('--')?[s.slice(2),a[i+1]]:[]).filter(x=>x.length));
if(!args.file||!args.product)throw Error('Usage: node intelligence/iea-import.mjs --file workbook.xlsx --product product-slug [--release original-release-label]');
const product=products.find(p=>p.id===args.product);if(!product)throw Error('Unknown IEA product');
const dir=process.env.INTEL_DATA_DIR||'.data/intelligence',home=process.env.IEA_DATA_HOME||path.join(dir,'iea'),file=path.join(dir,'snapshot.json');
const data=JSON.parse(await fs.readFile(file,'utf8')),config=snapshotRules(data);
const bytes=await fs.readFile(args.file);if(bytes.length>40*1024*1024)throw Error('Workbook exceeds 40 MB');
const parsed=parseWorkbook(bytes,{product,filename:path.basename(args.file),release:args.release||null,config});parsed.archive=parsed.contentHash+'.xlsx';
await fs.mkdir(path.join(home,'archive'),{recursive:true});await fs.writeFile(path.join(home,'archive',parsed.archive),bytes);await fs.writeFile(path.join(home,'archive',parsed.contentHash+'.json'),JSON.stringify(parsed));
data.ieaDatasets||={datasets:{},history:[],products:{}};const changed=commitVersion(data.ieaDatasets,parsed);data.sources=[...(data.sources||[]).filter(s=>s.id!=='iea-'+product.id),{id:'iea-'+product.id,name:product.name,url:product.url,level:'S1',language:'en',method:'authenticated-xlsx',status:'ready',checkedAt:parsed.checkedAt,records:parsed.records.length}];data.generatedAt=parsed.checkedAt;
await fs.writeFile(file+'.iea-import.tmp',JSON.stringify(data));await fs.rename(file+'.iea-import.tmp',file);console.log(JSON.stringify({file:parsed.filename,changed,records:parsed.records.length,counts:parsed.counts}));
