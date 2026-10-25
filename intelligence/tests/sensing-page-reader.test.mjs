import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHmac} from 'node:crypto';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {once} from 'node:events';
import {createSensingPageReader} from '../sensing-page-reader.mjs';
const password='test-only-password',expires=String(Date.now()+60000),token=expires+'.'+createHmac('sha256',password).update(expires).digest('hex'),headers={cookie:'site_auth='+token};
const snapshot=(n,at=Date.now())=>({schema:1,scope:'ocean-test',version:'version-'+n,at,payload:{subscriptions:[{id:'one',count:n}],rss:{list:[]},collection:{running:false},observedAt:'2026-10-26'}});
async function save(dir,value){const file=path.join(dir,'sensing-page.json');await fs.writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(file+'.tmp',file);}
async function fixture(run,options={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-reader-'));await save(dir,snapshot(3));const server=createSensingPageReader({dir,scope:'ocean-test',auth:{secret:password},...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port,dir,server);}finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}}

test('the source reader authenticates every cached and conditional read and accepts no writes',()=>fixture(async base=>{
 assert.equal((await fetch(base+'/api/sensing-page')).status,401);const response=await fetch(base+'/api/sensing-page',{headers});assert.equal(response.status,200);assert.equal((await response.json()).subscriptions[0].count,3);
 const tag=response.headers.get('etag');assert.equal((await fetch(base+'/api/sensing-page',{headers:{...headers,'If-None-Match':tag}})).status,304);assert.equal((await fetch(base+'/api/sensing-page',{headers:{'If-None-Match':tag}})).status,401);assert.equal((await fetch(base+'/api/sensing-page',{method:'POST',headers,body:'{}'})).status,405);
}));

test('expired views remain readable while the calculation process refreshes and atomic files invalidate the reader',()=>fixture(async(base,dir)=>{
 await save(dir,snapshot(3,0));const response=await fetch(base+'/api/sensing-page',{headers});const value=await response.json();assert.equal(value.subscriptions[0].count,3);assert.equal(value.sourceView.refreshing,true);
 await save(dir,snapshot(4));const next=await(await fetch(base+'/api/sensing-page',{headers})).json();assert.equal(next.subscriptions[0].count,4);assert.notEqual(next.sourceView.version,value.sourceView.version);
},{refresh:()=>new Promise(()=>{})}));

test('explicit reload waits for a new publication and a file from another system is rejected',async()=>{
 let dirForRefresh;
 await fixture(async(base,dir)=>{dirForRefresh=dir;assert.equal((await(await fetch(base+'/api/sensing-page?refresh=1',{headers})).json()).subscriptions[0].count,5);await save(dir,{...snapshot(8),scope:'another-system'});assert.equal((await fetch(base+'/api/sensing-page',{headers})).status,503);},{refresh:async()=>{await save(dirForRefresh,snapshot(5));}});
});

test('source data stays available while the research process is blocked in a synchronous calculation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-worker-'));await save(dir,snapshot(6));await fs.writeFile(path.join(dir,'sensing.css'),'.sensing-shell{color:red}');const entry=new URL('../sensing-page-reader.mjs',import.meta.url).href;
 const code=`const {startSensingPageReader}=await import(${JSON.stringify(entry)});const reader=await startSensingPageReader({dir:${JSON.stringify(dir)},scope:'ocean-test',publicDir:${JSON.stringify(dir)},port:0,auth:{secret:${JSON.stringify(password)}},onRefresh:async()=>{}});console.log(JSON.stringify({port:reader.port}));setTimeout(()=>{console.log('busy');const end=Date.now()+1800;while(Date.now()<end){};console.log('idle');},100);process.stdin.resume();`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['pipe','pipe','pipe']}),lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 try{const first=JSON.parse((await lines.next()).value);assert.equal((await lines.next()).value,'busy');const start=Date.now(),response=await fetch('http://127.0.0.1:'+first.port+'/api/sensing-page',{headers});assert.equal((await response.json()).subscriptions[0].count,6);const css=await fetch('http://127.0.0.1:'+first.port+'/assets/sensing.css');assert.equal(css.status,200);assert.match(await css.text(),/color:red/);assert.equal((await fetch('http://127.0.0.1:'+first.port+'/assets/sensing-page.json')).status,404);assert.ok(Date.now()-start<700,'Source reader waited for the research calculation');}
 finally{child.kill();await once(child,'close');await fs.rm(dir,{recursive:true,force:true});}
});
