import fs from 'node:fs/promises';import {products,parseWorkbook} from '../intelligence/iea-datasets.mjs';import {integrateIEACatalog} from '../intelligence/iea-quant.mjs';import {industries} from '../intelligence/industry-classification.mjs';
const dir='.data/iea-samples',config=JSON.parse(await fs.readFile('intelligence/quant-preview/legacy-rules.json','utf8')),datasets={};
for(const filename of (await fs.readdir(dir)).filter(n=>n.endsWith('.xlsx'))){const product=products.find(p=>p.kind===(/Minerals/.test(filename)?'minerals':/CCUS/.test(filename)?'ccus':'hydrogen'));datasets[filename]=parseWorkbook(await fs.readFile(dir+'/'+filename),{filename,product,release:'2026',config});}
const raw={documents:[],sources:[{id:'iea',name:'IEA'}],ieaDatasets:{datasets}},catalog=integrateIEACatalog({industries:industries.map(topic=>({topic,registries:[],sourceIds:[]})),cards:[],sources:[]},raw);
console.log(JSON.stringify({summary:catalog.ieaSummary,cards:catalog.cards.map(c=>({title:c.title,rows:c.rows.length,types:c.types,renderer:c.renderer})),registries:catalog.industries.flatMap(i=>i.registries)},null,2));
await fs.writeFile(dir+'/unified-fixture.json',JSON.stringify(raw));
