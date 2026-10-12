import assert from 'node:assert/strict';
import {normalize} from '../server/integrations/mp2rss-client.mjs';
const source={platform:'x',remoteId:'1',name:'Test'};
const item=normalize(source,'posts',{postId:'123',postedAt:Date.now(),content:'a'.repeat(89)+'🇳🇴 continuation'});
assert.equal(Array.from(item.title).length,90);
assert.equal(item.title.isWellFormed(),true);
assert.equal(item.content,'a'.repeat(89)+'🇳🇴 continuation');
assert.ok(!JSON.stringify(item).includes('\\ud83c'));
console.log('PASS emoji title boundary preserves valid Unicode and full body');
