import fs from 'node:fs/promises';
import OpenAI from 'openai';
import {extractArticle} from './auto-extract.mjs';
const d=JSON.parse(await fs.readFile('/opt/ocean-intelligence/data/snapshot.json','utf8'));
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BASE_URL,timeout:90000,maxRetries:0});
await Promise.all(['doc_1c5006f215d65a2f1eec','doc_96d7a8ce580de84e3185'].map(async id=>{const doc=d.documents.find(x=>x.id===id),start=Date.now();try{const r=await extractArticle(client,doc);console.log(JSON.stringify({id,elapsed:Date.now()-start,success:true,evidence:r.evidence.length}));}catch(e){console.log(JSON.stringify({id,elapsed:Date.now()-start,error:e.name,reason:e.message,status:e.status}));}}));
