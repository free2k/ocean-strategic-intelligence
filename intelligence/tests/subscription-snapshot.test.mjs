import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshot} from '../low-carbon/subscription-snapshot.mjs';
test('subscription snapshots preserve embedded Unicode line separators and split multibyte characters',async()=>{
 const rows=[{table:'meta',row:{readOnly:'on'}},{table:'mp2rss.items',row:{content:'英文\u2028正文\u2029Unicode 汉字 😀\n换行\r回车',name:'示例'}}];
 const bytes=Buffer.from(rows.map(JSON.stringify).join('\n'));
 async function* input(){for(let at=0;at<bytes.length;at+=7)yield bytes.subarray(at,at+7);}
 assert.deepEqual(await Array.fromAsync(parseSnapshot(input())),rows);
});
test('damaged snapshot records fail rather than silently truncating content',async()=>{
 async function* input(){yield Buffer.from('{"table":"mp2rss.items","row":{"content":"broken');}
 await assert.rejects(async()=>Array.fromAsync(parseSnapshot(input())),SyntaxError);
});
