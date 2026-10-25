import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceEvidence,workspaceCountries} from '../workspace-data.mjs';
import {ieaSummary,selectIEA} from '../iea-quant.mjs';
import {readWorkspaceClient} from '../workspace-storage.mjs';
import {rawFixture} from './strategy-fixture.mjs';
import {getQuantCatalog} from '../quant-routes.mjs';
import {hasTerm} from '../industry-classification.mjs';

test('compiled keyword reuse retains the original literal and Unicode boundary semantics',()=>{
 const terms=['xK','xk','XK','aſ','as','xΣ','xς','Co₂','co₂','café','CAFÉ','C++','CO2','海上风电'];
 for(const term of terms)for(const text of terms.flatMap(t=>[t,'prefix'+t,' '+t+' ','('+t+')'])){
  const escaped=term.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const expected=/[a-z]/i.test(term)?new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])','i').test(text):text.includes(term);
  assert.equal(hasTerm(text,term),expected);
 }
});

test('chart and research pages share identical scopes while changed filters and snapshots stay isolated',async()=>{
 const raw=await rawFixture(),first=getQuantCatalog(raw,{sourceId:'',topic:'',country:'',from:'',to:''});
 assert.strictEqual(getQuantCatalog(raw,{topic:'',country:'',sourceId:'',to:'',from:''}),first);
 assert.strictEqual(getQuantCatalog(raw,{}),first);
 assert.notStrictEqual(getQuantCatalog(raw,{country:'NO'}),first);
 assert.notStrictEqual(getQuantCatalog(structuredClone(raw),{}),first);
});

test('indexed evidence and country lookups preserve scope, duplicates and source order',()=>{
 const documents=[{id:'b'},{id:'a'},{id:'a'}],evidence=[{id:'one',documentId:'a'},{id:'foreign',documentId:'z'},{id:'two',documentId:'b'},{id:'one',documentId:'a'}];
 const events=[{countries:['GB','NO']},{countries:['GB','XX']}],dictionary=[{code:'NO'},{code:'US'},{code:'GB'}];
 assert.deepEqual(workspaceEvidence(evidence,documents),evidence.filter(e=>documents.some(d=>d.id===e.documentId)));
 assert.deepEqual(workspaceCountries(events,dictionary),dictionary.filter(c=>events.some(e=>e.countries.includes(c.code))));
 assert.deepEqual(workspaceEvidence(evidence,[]),[]);assert.deepEqual(workspaceCountries([],dictionary),[]);
 assert.equal(evidence.length,4);assert.equal(events.length,2);
});

test('IEA aggregate reads retain exact project grain and all existing filter semantics',()=>{
 const statuses=['accepted','unmatched','excluded'],periods=[undefined,'2026','2026-06'];
 const records=Array.from({length:36},(_,i)=>({contentHash:'hash',sheet:'Projects',cell:(i%2?'B':'A')+(Math.floor(i/2)+1),sourceId:i%2?'iea-a':'iea-b',countryCode:i%2?'NO':'GB',period:periods[i%3],classification:{status:statuses[i%3],primary:i%2?'one':'two'}}));
 const raw={ieaDatasets:{datasets:{one:{name:'IEA',records}}}};
 for(const filters of [{},{country:'NO'},{country:'EU'},{sourceId:'iea'},{sourceId:'iea-a'},{sourceId:'other'},{topic:'one'},{from:'2026-06-01'},{to:'2026-01-01'},{from:'2025-01-01',to:'2026-12-31',country:'GB'}]){
  const selected=selectIEA(raw,filters),accepted=selected.filter(r=>r.classification?.status==='accepted');
  assert.deepEqual(ieaSummary(raw,filters),{records:selected.length,accepted:accepted.length,projects:new Set(accepted.filter(r=>!r.period).map(r=>[r.contentHash,r.sheet,String(r.cell).replace(/[A-Z]+/gi,'')].join('|'))).size,candidates:selected.filter(r=>r.classification?.status==='unmatched').length,excluded:selected.filter(r=>r.classification?.status==='excluded').length});
 }
 Object.defineProperty(records[0],'objectZh',{enumerable:true,get(){throw Error('Summary must not materialize full rows');}});
 assert.equal(ieaSummary(raw).records,36);
});

test('unchanged workspaces check only the version, while committed updates reload the payload',async()=>{
 let version='v1',payloadReads=0;const query=async sql=>{
  if(sql.startsWith('SELECT updated_at'))return {rows:[{version}]};
  assert.ok(sql.startsWith('SELECT payload,updated_at'));payloadReads++;return {rows:[{payload:{documents:[{id:version}]},version}]};
 };
 const first=await readWorkspaceClient({query});assert.equal(payloadReads,1);
 assert.strictEqual(await readWorkspaceClient({query},first),first);assert.equal(payloadReads,1);
 version='v2';const next=await readWorkspaceClient({query},first);assert.deepEqual(next.documents,[{id:'v2'}]);assert.equal(payloadReads,2);
 assert.strictEqual(await readWorkspaceClient({query},next),next);assert.equal(payloadReads,2);
});
