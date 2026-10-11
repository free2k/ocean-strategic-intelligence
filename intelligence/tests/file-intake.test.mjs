import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {validateFile,validateDraft,startUpload,readUpload,evidenceQuote} from '../file-intake.mjs';
test('PDF line wrapping maps quotes back to exact original text without changing numbers',()=>{assert.equal(evidenceQuote('风电项目\n容量为 100 MW。','风电项目容量为100 MW。'),'风电项目\n容量为 100 MW。');assert.equal(evidenceQuote('容量100MW','容量200MW'),'');});
test('upload rejects unsupported formats, invalid signatures and excessive size',()=>{
 assert.throws(()=>validateFile({name:'file.exe',base64:'YWJj'}));assert.throws(()=>validateFile({name:'fake.pdf',base64:'YWJj'}));assert.throws(()=>validateFile({name:'file.txt',base64:'!'}));assert.throws(()=>validateFile({name:'huge.txt',base64:'a'.repeat(17*1024*1024)}));
 assert.equal(validateFile({name:'note.txt',base64:Buffer.from('海洋能源').toString('base64')}).mime,'text/plain');
});
test('unsupported quotes, guessed dates and unknown country codes are cleared',()=>{
 const r=validateDraft({quote:'无依据',eventDate:'2026-02-30',country:'XX',topic:'未知行业',url:'javascript:alert(1)'},'原文');assert.equal(r.quote,'');assert.equal(r.eventDate,'');assert.equal(r.country,'');assert.equal(r.topic,'');assert.equal(r.url,'');
});
test('text upload yields a draft and retains original without creating an event',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'intake-test-')),text='2026年10月11日，中国某海上风电项目完成设备安装。';
 const client={chat:{completions:{create:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'设备安装完成',summary:'完成设备安装',quote:text,country:'CN',topic:'海上风电',eventDate:'2026-10-11'})}}]})}}};
 try{const job=await startUpload(dir,{name:'source.txt',base64:Buffer.from(text).toString('base64')},client);let result;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,10));result=await readUpload(dir,job.id);if(result.status!=='processing')break;}assert.equal(result.status,'completed');assert.equal(result.draft.quote,text);assert.equal(await fs.readFile(path.join(dir,'uploads',job.id,'original.txt'),'utf8'),text);assert.deepEqual(await fs.readdir(dir),['uploads']);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
