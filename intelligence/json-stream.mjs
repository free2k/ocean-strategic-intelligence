import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createWriteStream} from 'node:fs';

// Serialize ordinary JSON snapshots without allocating a second giant string.
// Each chunk is valid UTF-16, so encoding chunks separately preserves Unicode.
export function* jsonTextChunks(value,chunkChars=65536){
 if(!Number.isInteger(chunkChars)||chunkChars<2)throw Error('Invalid JSON chunk size');
 const parents=new Set();
 const prepare=(v,key)=>v&&typeof v==='object'&&typeof v.toJSON==='function'?v.toJSON(key):v;
 const omitted=v=>v===undefined||typeof v==='function'||typeof v==='symbol';
 function* tokens(v){
  if(v===null||typeof v!=='object'){yield JSON.stringify(v);return;}
  if(parents.has(v))throw TypeError('Converting circular structure to JSON');
  parents.add(v);
  if(Array.isArray(v)){
   yield '[';
   for(let i=0;i<v.length;i++){if(i)yield ',';const item=prepare(v[i],String(i));yield* tokens(omitted(item)?null:item);}
   yield ']';
  }else{
   yield '{';let first=true;
   for(const key of Object.keys(v)){const item=prepare(v[key],key);if(omitted(item))continue;if(!first)yield ',';first=false;yield JSON.stringify(key);yield ':';yield* tokens(item);}
   yield '}';
  }
  parents.delete(v);
 }
 const root=prepare(value,'');if(omitted(root))throw TypeError('Snapshot must be JSON serializable');
 let buffer='';
 for(const token of tokens(root)){
  buffer+=token;
  while(buffer.length>=chunkChars){
   let end=chunkChars;const last=buffer.charCodeAt(end-1);
   if(last>=0xD800&&last<=0xDBFF)end--;
   yield buffer.slice(0,end);buffer=buffer.slice(end);
  }
 }
 if(buffer)yield buffer;
}
export async function writeJsonFile(file,data){
 await pipeline(Readable.from(jsonTextChunks(data)),createWriteStream(file));
}
