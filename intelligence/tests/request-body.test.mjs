import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readJsonBody} from '../request-body.mjs';

test('Chinese source text and emoji survive a request split inside UTF-8 characters',async()=>{
 const value={title:'海上风电研究🙂',text:'逐字保留原文：装机容量0 MW，变化量-2 MW。🌊'.repeat(1000)},bytes=Buffer.from(JSON.stringify(value));
 const pieces=Array.from({length:Math.ceil(bytes.length/7)},(_,i)=>bytes.subarray(i*7,(i+1)*7));
 assert.deepEqual(await readJsonBody(Readable.from(pieces),bytes.length),value);
});
test('request limits count bytes, reject oversized bodies and preserve empty-body behavior',async()=>{
 const bytes=Buffer.from(JSON.stringify({text:'中文'}));
 await assert.rejects(readJsonBody(Readable.from([bytes.subarray(0,3),bytes.subarray(3)]),bytes.length-1),/request too large/);
 assert.deepEqual(await readJsonBody(Readable.from([])),{});
 await assert.rejects(readJsonBody(Readable.from([Buffer.from('{bad')])) ,SyntaxError);
});
