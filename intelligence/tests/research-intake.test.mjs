import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {FileRuntimeState} from '../research/runtime-state.mjs';import {IntakeDrafts} from '../research/intake-drafts.mjs';
test('source-first draft editing, stale revisions, unknown dates and idempotent confirmation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'intake-draft-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let writes=0;
 const store={data:{documents:[]},async addManual(entry){writes++;this.data.documents.push(entry.document);this.entry=entry;}};
 const service=new IntakeDrafts(new FileRuntimeState(dir),store),input={requestKey:'test-request-key',text:'原始资料记载，海洋设备项目已经完成联合测试，具体日期和国家未说明。'};
 let draft=await service.create(input,'test');assert.equal(writes,0);assert.equal((await service.create(input,'test')).id,draft.id);await assert.rejects(()=>service.create({...input,text:input.text+'不同资料'},'test'),{code:'IDEMPOTENCY_CONFLICT'});
 draft=await service.edit(draft.id,{revision:1,fields:{title:'设备测试',summary:'联合测试完成',quote:'海洋设备项目已经完成联合测试',topic:'海洋装备'}},'test');
 await assert.rejects(()=>service.edit(draft.id,{revision:1,fields:{title:'覆盖'}},'test'),{code:'DRAFT_CONFLICT'});
 const confirmed=await service.confirm(draft.id,{revision:draft.revision},'test');assert.equal(confirmed.status,'confirmed');assert.equal(store.entry.event.eventDate,null);assert.deepEqual(store.entry.event.countries,[]);assert.equal(store.entry.document.content,input.text);
 const restart=new IntakeDrafts(new FileRuntimeState(dir),store);assert.equal((await restart.confirm(draft.id,{revision:1},'test')).result.eventId,confirmed.result.eventId);assert.equal(writes,1);assert.equal((await restart.get(draft.id)).source.text,input.text);
});
test('draft confirmation cannot fabricate quote, date or source scheme',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'intake-invalid-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const service=new IntakeDrafts(new FileRuntimeState(dir),{data:{documents:[]},addManual(){throw Error('must not write');}});
 let d=await service.create({requestKey:'test-invalid-key',text:'保留的原始资料正文，需要逐字引用，不能伪造原文证据。'},'test');d=await service.edit(d.id,{revision:d.revision,fields:{title:'资料',summary:'摘要',topic:'海洋装备',quote:'不存在的内容'}},'test');await assert.rejects(()=>service.confirm(d.id,{revision:d.revision},'test'),{code:'INVALID_EVIDENCE'});
 d=await service.edit(d.id,{revision:d.revision,fields:{quote:'保留的原始资料正文',eventDate:'2026-02-30'}},'test');await assert.rejects(()=>service.confirm(d.id,{revision:d.revision},'test'),{code:'INVALID_DATE'});
});
