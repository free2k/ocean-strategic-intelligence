import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ArticleCheckpoints,acknowledgeCheckpoints} from '../article-checkpoints.mjs';
import {autoExtract,pipelineVersion} from '../auto-extract.mjs';

test('completed article survives interruption before whole-file save; manual facts stay protected',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'article-recovery-'));
 try{
  const doc={id:'a',versionId:'v1',content:'original'},human={id:'human',documentId:'a',reviewedAt:'today'};
  const data={documents:[doc],sources:[],events:[human],entities:[],evidence:[],relations:[],observations:[]};
  await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(data));
  const saved={autoExtraction:{status:'completed',versionId:'v1',pipelineVersion,completedAt:'2026-10-21'},extraction:{events:[],entities:[],evidence:[],relations:[],observations:[]},extractionStatus:'extracted',extractionVersion:pipelineVersion};
  await new ArticleCheckpoints(dir,'extraction').save(doc,saved);
  await autoExtract(dir,{client:{},extract:()=>assert.fail('completed article must not be billed again')});
  const result=JSON.parse(await fs.readFile(path.join(dir,'snapshot.json'),'utf8'));
  assert.equal(result.documents[0].autoExtraction.status,'completed');assert.deepEqual(result.documents[0].extraction.events,[human]);
  let restored=false;await new ArticleCheckpoints(dir,'extraction').restore([{...doc,versionId:'changed'}],()=>{restored=true;});assert.equal(restored,false);
  await acknowledgeCheckpoints(dir,{...result,documents:[{...result.documents[0],versionId:'changed'}]});
  assert.deepEqual(await fs.readdir(path.join(dir,'article-checkpoints','extraction')),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('shared pipeline checkpoints individual articles without rewriting a workspace file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'article-batch-'));
 try{
  const workspace={documents:[{id:'a',versionId:'v',content:'body'}],sources:[],events:[],entities:[],evidence:[],relations:[],observations:[]};
  await autoExtract(dir,{workspace,client:{},extract:async()=>({events:[],entities:[],evidence:[],relations:[],observations:[]})});
  assert.equal(workspace.documents[0].autoExtraction.status,'completed');
  await assert.rejects(fs.access(path.join(dir,'snapshot.json')),{code:'ENOENT'});
  assert.equal((await fs.readdir(path.join(dir,'article-checkpoints','extraction'))).length,1);
  await acknowledgeCheckpoints(dir,workspace);assert.deepEqual(await fs.readdir(path.join(dir,'article-checkpoints','extraction')),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
