import test from 'node:test';
import assert from 'node:assert/strict';
import {groupReferences,articleBody} from '../public/preview.js';

test('multiple quotes from one original have one source, without losing distinct evidence or versions',()=>{
 const refs=[{documentId:'a',bodyVersionId:'v1',quote:'first'},
 {documentId:'a',bodyVersionId:'v1',quote:'second'},
 {documentId:'a',bodyVersionId:'v1',quote:'first'},
 {documentId:'a',bodyVersionId:'v2',quote:'revised'},
 {documentId:'b',bodyVersionId:'v1',quote:'other'}];
 const groups=groupReferences(refs);
 assert.equal(groups.length,3);
 assert.deepEqual(groups[0].quotes,['first','second']);
 assert.equal(refs.length,5);
});

test('article formatting renders emphasis while keeping raw text and escaping untrusted markup',()=>{
 const text='**开栏语**\n\n正文 <script>alert(1)</script>';
 const html=articleBody(text);
 assert.match(html,/<strong>开栏语<\/strong>/);
 assert.match(html,/<pre>\*\*开栏语\*\*/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
