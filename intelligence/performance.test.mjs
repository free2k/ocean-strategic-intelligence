import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFunnels} from './source-funnel.mjs';

test('source statistics coalesce concurrent reads and reuse the result',async()=>{
 let queries=0,resolve;
 const pool={query:()=>{queries++;return new Promise(r=>resolve=r);}};
 const first=sourceFunnels(pool),second=sourceFunnels(pool);
 assert.equal(queries,1);
 resolve({rows:[{id:'mp2rss_test',included:7}]});
 assert.deepEqual(await first,{mp2rss_test:{id:'mp2rss_test',included:7}});
 assert.strictEqual(await second,await first);
 assert.strictEqual(await sourceFunnels(pool),await first);
 assert.equal(queries,1);
});
test('statistics cache stays isolated between databases and retries failed reads',async()=>{
 let queries=0;
 const pool={query:async()=>{if(++queries===1)throw Error('unavailable');return {rows:[{id:'other',included:3}]};}};
 assert.deepEqual(await sourceFunnels(pool),{});
 assert.deepEqual(await sourceFunnels(pool),{other:{id:'other',included:3}});
 assert.equal(queries,2);
 assert.deepEqual(await sourceFunnels(null),{});
});
