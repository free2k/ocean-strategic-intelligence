import test from 'node:test';
import assert from 'node:assert/strict';
import {originalSourceLink} from '../public/preview.js';

test('original source keeps the article query and opens an isolated external tab',()=>{
 const html=originalSourceLink('https://example.org/article?id=12&lang=zh');
 assert.match(html,/article\?id=12&amp;lang=zh/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});

test('missing or unsafe originals never become a misleading clickable source',()=>{
 for(const url of [undefined,'','javascript:alert(1)','data:text/html,hello','file:///etc/passwd','/relative']){
  const html=originalSourceLink(url);
  assert.doesNotMatch(html,/<a /);
  assert.match(html,/未保存/);
 }
});
