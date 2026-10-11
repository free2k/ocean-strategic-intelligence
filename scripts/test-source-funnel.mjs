import assert from 'node:assert/strict';
import {sourceFunnels} from '../intelligence/source-funnel.mjs';
const rows=[{id:'mp2rss_mp:empty',collected:0,included:0,candidate:0,excluded:0,pending:0,analysisPending:0},{id:'mp2rss_mp:sample',collected:56,included:20,candidate:25,excluded:11,pending:0,analysisPending:2}];
assert.deepEqual(await sourceFunnels(null),{});
let calls=0;const pool={query:async sql=>{calls++;assert.ok(sql.includes('LEFT JOIN mp2rss.items'));return {rows};}};
assert.deepEqual(await sourceFunnels(pool),Object.fromEntries(rows.map(x=>[x.id,x])));
assert.deepEqual(await sourceFunnels(pool),Object.fromEntries(rows.map(x=>[x.id,x])));assert.equal(calls,1);
console.log('Source funnel fallback, empty channel and cache checks passed');
