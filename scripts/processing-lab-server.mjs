import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import OpenAI from 'openai';
import {ProcessingRuns,serveProcessingRuns} from '../intelligence/processing-runs.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.PROCESSING_LAB_PORT||3118);
const dir=path.join(root,'.data/processing-lab'),sample=path.join(dir,'sample.json');
const client=process.env.OPENAI_API_KEY&&process.env.OPENAI_BASE_URL?new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BASE_URL,maxRetries:0,timeout:180000}):null;
const manager=new ProcessingRuns({dir,readInput:async()=>JSON.parse(await fs.readFile(sample,'utf8')),client,model:process.env.CHAT_MODEL||'qwen-plus'});await manager.recover();
const files={'/':'intelligence/public/processing-lab.html','/processing-lab.js':'intelligence/public/processing-lab.js','/processing-runs.js':'intelligence/public/processing-runs.js','/processing-runs.css':'intelligence/public/processing-runs.css'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
  if(await serveProcessingRuns(req,res,url,manager))return;
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const file=files[url.pathname];if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await fs.readFile(path.join(root,file)));
 }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local processing preview: http://127.0.0.1:${port} (isolated files; no production writes)`));
