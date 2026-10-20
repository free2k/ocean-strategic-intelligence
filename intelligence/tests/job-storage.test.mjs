import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {gunzipSync} from 'node:zlib';
import {finishJobStage,retryDelay,assertJobCapacity} from '../job-storage.mjs';
import {createScheduler} from '../scheduler.mjs';
const seed={documents:[{id:'d',content:'𠀀🌊'}],sources:[],entities:[],events:[],relations:[],observations:[],evidence:[]};
test('cleanup discards only committed copies; failures retain a lossless archive',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'job-retention-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const stage=path.join(dir,'jobs','test');await fs.mkdir(stage,{recursive:true});
 const text=JSON.stringify(seed);await fs.writeFile(path.join(stage,'snapshot.json'),text);
 await finishJobStage(dir,stage);assert.equal(gunzipSync(await fs.readFile(path.join(stage,'snapshot.json.gz'))).toString(),text);
 await assert.rejects(fs.stat(path.join(stage,'snapshot.json')),{code:'ENOENT'});
 const good=path.join(dir,'jobs','good');await fs.mkdir(good);await fs.writeFile(path.join(good,'snapshot.json'),text);await fs.writeFile(path.join(good,'source.html'),'copied');await fs.writeFile(path.join(good,'unique.bin'),'retain');
 await finishJobStage(dir,good,{committed:true,copied:['source.html']});
 assert.deepEqual(await fs.readdir(good),['unique.bin']);
 await assert.rejects(finishJobStage(dir,dir,{committed:true}),/Invalid job cleanup/);
});
test('backoff is bounded and storage exhaustion opens a six hour circuit',async()=>{
 assert.equal(retryDelay(1,'X'),15*60000);assert.equal(retryDelay(2,'X'),30*60000);assert.equal(retryDelay(100,'X'),6*3600000);
 assert.equal(retryDelay(1,'54000'),6*3600000);
 await assert.rejects(assertJobCapacity(os.tmpdir(),{minBytes:Number.MAX_SAFE_INTEGER}),{code:'DISK_CAPACITY_LOW'});
});
test('low disk prevents staging and repeated delivery requests, including after restart',{skip:process.platform==='linux'},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'job-circuit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let checks=0;const options={dir,root:dir,store:{data:seed,pool:null},serial:fn=>fn(),checkCapacity:async()=>{checks++;throw Object.assign(Error('low disk'),{code:'DISK_CAPACITY_LOW'});},executeWorker:()=>assert.fail('must not start worker')};
 const scheduler=await createScheduler(options);t.after(()=>scheduler.close());
 await scheduler.run({processOnly:true});assert.equal(scheduler.status().errorCode,'DISK_CAPACITY_LOW');
 assert.equal(await scheduler.run({processOnly:true}),false);assert.equal(checks,1);
 await assert.rejects(fs.stat(path.join(dir,'jobs')),{code:'ENOENT'});
 const restarted=await createScheduler(options);t.after(()=>restarted.close());
 assert.equal(await restarted.run({processOnly:true}),false);assert.equal(checks,1);
});
test('a process crash cannot immediately create another full snapshot after restart',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'job-crash-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'collection-status.json'),JSON.stringify({running:true,nextRun:'2026-01-01',failureCount:1}));
 const scheduler=await createScheduler({dir,root:dir,store:{data:seed},serial:fn=>fn(),executeWorker:()=>assert.fail()});t.after(()=>scheduler.close());
 assert.equal(scheduler.status().errorCode,'INTERRUPTED_RUN');
 assert.equal(scheduler.status().failureCount,2);
 assert(Date.parse(scheduler.status().retryAt)>Date.now()+29*60000);
 assert.equal(await scheduler.run(),false);
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'collection-status.json'),'utf8')).failureCount,2);
});
