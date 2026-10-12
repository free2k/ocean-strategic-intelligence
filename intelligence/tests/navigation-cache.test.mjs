import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const start=code.indexOf('const readCache='),end=code.indexOf('\n}',start)+2;
function harness(){
 let calls=0,now=0,fail=false;
 const context=vm.createContext({Map,Date:{now:()=>now},$:()=>({}),fetch:async()=>{calls++;await Promise.resolve();return {status:fail?500:200,ok:!fail,json:async()=>fail?{error:'failed'}:{version:calls}};}});
 const api=vm.runInContext(code.slice(start,end)+'\napi',context);
 return {api,calls:()=>calls,tick:()=>now+=61000,fail:value=>fail=value};
}
test('navigation coalesces reads, isolates filters and expires cached snapshots',async()=>{
 const h=harness();await Promise.all([h.api('data?country=US'),h.api('data?country=US')]);assert.equal(h.calls(),1);
 await h.api('data?country=US');assert.equal(h.calls(),1);
 await h.api('data?country=CN');assert.equal(h.calls(),2);
 h.tick();await h.api('data?country=US');assert.equal(h.calls(),3);
});
test('writes invalidate snapshots and failed reads never poison the cache',async()=>{
 const h=harness();await h.api('data?');await h.api('events',{});await h.api('data?');assert.equal(h.calls(),3);
 h.tick();h.fail(true);await assert.rejects(h.api('data?'));h.fail(false);await h.api('data?');assert.equal(h.calls(),5);
});

test('menu changes reset filters and pagination before the next data request',()=>{
 const controls=Object.fromEntries(['topic','country','source','from','to'].map(id=>['#'+id,{value:'selected'}]));
 const context=vm.createContext({window:{},activeTab:()=> 'events',tab:'library',data:{},pages:{events:4,library:3},libraryQuery:'old search',$:id=>controls[id],load(){assert.ok(Object.values(controls).every(c=>c.value===''));}});
 const handler=code.slice(code.indexOf('window.onhashchange='),code.indexOf("document.addEventListener('keydown'"));
 vm.runInContext(handler,context);context.window.onhashchange();
 assert.equal(context.pages.library,1);assert.equal(context.pages.events,1);assert.equal(context.libraryQuery,'');
 controls['#country'].value='JP';context.tab='events';context.load=()=>{};context.window.onhashchange();assert.equal(controls['#country'].value,'JP');
});
