import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ObjectSupplements} from '../research/object-supplements.mjs';
import {FileRuntimeState} from '../research/runtime-state.mjs';
import {startUpload,readUpload} from '../file-intake.mjs';
test('object fields retain exact object-bound quotes, reject unsupported fields and preserve history/idempotency',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'object-fields-'));
 try{let calls=0;const text='Galloper Wind Farm is an offshore wind farm located in the UK. Its design capacity is 353 MW. Another facility is operating.';
 const service=new ObjectSupplements(new FileRuntimeState(dir),{generate:async()=>{calls++;return {content:JSON.stringify({fields:[{field:'设施类别',value:'海上风电场',quote:text.slice(0,text.indexOf(' Its'))},{field:'所在地',value:'英国',quote:text.slice(0,text.indexOf(' Its'))},{field:'运行状态',value:'运营中',quote:'Another facility is operating.'},{field:'设计能力',value:'999 MW',quote:'Galloper has 999 MW'},{field:'控制股东',value:'未知',quote:text}]})};}},'test-model');
 const object={id:'facility-1',name:'加洛珀海上风电场',aliases:['Galloper Wind Farm'],type:'设施'},input={requestId:'request-0001',text,releaseId:'release-1'};
 const job=await service.create(object,input);await service.active.get(job.id);const saved=(await service.list(object.id))[0];assert.equal(saved.status,'completed');assert.deepEqual(saved.fields.map(f=>f.field),['设施类别','所在地']);assert.equal(saved.text,text);assert.equal(saved.object.id,object.id);
 await service.create(object,input);assert.equal(calls,1);await assert.rejects(service.create({...object,id:'other'},input),e=>e.code==='REQUEST_CONFLICT');assert.equal((await service.list('other')).length,0);
 const second=await service.create(object,{...input,requestId:'request-0002'});await service.active.get(second.id);assert.equal((await service.list(object.id)).length,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('object upload parses text without a redundant event extraction model call',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'object-upload-'));
 try{const text='Example facility is an offshore wind farm with 100 MW design capacity.';const job=await startUpload(dir,{name:'facility.txt',base64:Buffer.from(text).toString('base64'),purpose:'object-fields'},null);let upload;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,10));upload=await readUpload(dir,job.id);if(upload.status!=='processing')break;}assert.equal(upload.status,'completed');assert.equal(upload.text,text);assert.equal(upload.draft,undefined);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
