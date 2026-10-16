import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {FileResearchRepository} from '../research/repositories.mjs';import {ResearchLedger} from '../research/ledger.mjs';import {publishWorkspace} from '../research/publish-workspace.mjs';import {attachPublishedRules} from '../published-rules.mjs';
test('workspace publication advances once with both registries and is idempotent',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'publish-workspace-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const repo=new FileResearchRepository(dir),ledger=new ResearchLedger(repo);
 const data={documents:[],entities:[],events:[],relations:[],observations:[],evidence:[],sources:[]};attachPublishedRules(data,{id:1,config:{rules:[]}});await ledger.publish(data,{expectedReleaseId:null,baseline:true});
 let commits=0;const commit=repo.commit.bind(repo);repo.commit=async change=>{commits++;assert(change.records[change.head.releaseId].objectRegistryId);assert(change.records[change.head.releaseId].countryRegistryId);return commit(change);};
 const first=await publishWorkspace(repo,data);assert(first.objectRegistryId);assert(first.countryRegistryId);assert.equal(commits,1);const second=await publishWorkspace(repo,data);assert.equal(second.releaseId,first.releaseId);assert.equal(commits,1);
 const head=await repo.head();await assert.rejects(publishWorkspace(repo,{...data,industryRuleVersion:null}));assert.deepEqual(await repo.head(),head);
});
