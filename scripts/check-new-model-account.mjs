import fs from 'node:fs/promises';
import OpenAI from 'openai';
const base=process.env.OPENAI_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1';
const key=process.env.OPENAI_API_KEY;
if(!key)throw Error('Missing test credential');
const client=new OpenAI({apiKey:key,baseURL:base,timeout:120000,maxRetries:0});
const safe=e=>({status:e.status||null,code:/^[\w.-]{1,100}$/.test(e.code||'')?e.code:null,type:e.name||'Error'});
async function check(kind,model,fn){const start=Date.now();try{console.log(JSON.stringify({kind,model,ok:true,...await fn(),ms:Date.now()-start}));}catch(e){console.log(JSON.stringify({kind,model,ok:false,...safe(e),ms:Date.now()-start}));process.exitCode=1;}}
await check('text','qwen-plus',async()=>{const r=await client.chat.completions.create({model:'qwen-plus',messages:[{role:'user',content:'只回复 OK'}],max_tokens:32});if(!r.choices?.[0]?.message?.content)throw Error('Empty result');return {usage:r.usage};});
await check('embedding','text-embedding-v4',async()=>{const r=await client.embeddings.create({model:'text-embedding-v4',input:'海洋能源',dimensions:1024});if(r.data?.[0]?.embedding?.length!==1024)throw Error('Dimension mismatch');return {dimensions:1024,usage:r.usage};});
await check('vision','qwen3-vl-plus',async()=>{const fixture=JSON.parse(await fs.readFile('/opt/knowledge-base/.data/model-vision-test.json','utf8'));const r=await client.chat.completions.create({model:'qwen3-vl-plus',messages:[{role:'user',content:[{type:'text',text:'只回复图片中的数字。'},{type:'image_url',image_url:{url:fixture.image}}]}],max_tokens:32});return {recognized:r.choices?.[0]?.message?.content?.trim()==='7',usage:r.usage};});
await check('web-search','qwen-plus',async()=>{const r=await fetch(new URL('/api/v1/services/aigc/text-generation/generation',base),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'qwen-plus',input:{messages:[{role:'user',content:'联网查找阿里云百炼获取API Key的官方帮助文档，只返回文档名称。'}]},parameters:{enable_search:true,search_options:{enable_source:true,forced_search:true},result_format:'message',max_tokens:128}}),signal:AbortSignal.timeout(120000)});const data=await r.json();if(!r.ok||data.code)throw Object.assign(Error('Search failed'),{status:r.status,code:data.code});return {sources:data.output?.search_info?.search_results?.length||0,usage:data.usage};});
