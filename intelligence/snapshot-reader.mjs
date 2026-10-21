import {createReadStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import Parser from 'stream-json/Parser.js';
import Assembler from 'stream-json/Assembler.js';

// A single article (including its extraction) is the largest assembled unit.
// Never concatenate the source file or a whole documents array into a string.
export async function* snapshotEntries(source){
 const input=typeof source==='string'?createReadStream(source,{highWaterMark:64*1024}):Readable.from(source);
 const parser=new Parser({streamKeys:false,streamStrings:false,streamNumbers:false});
 let depth=0,field=null,array=false,index=0,assembler=null,root=false;
 const entries=new Transform({objectMode:true,readableHighWaterMark:1,transform(token,_encoding,callback){
  try{
   const {name,value}=token;
   if(!root){if(name!=='startObject')throw Error('Snapshot must be an object');root=true;depth=1;return callback();}
   if(!assembler&&depth===1&&name==='keyValue'){field=value;return callback();}
   if(!assembler&&depth===1&&name==='endObject'){depth=0;return callback();}
   if(!assembler&&depth===1&&name==='startArray'){array=true;index=0;depth=2;this.push({field,array:true,start:true});return callback();}
   if(!assembler&&array&&depth===2&&name==='endArray'){array=false;depth=1;return callback();}
   assembler||=new Assembler();assembler.consume(token);
   if(name==='startObject'||name==='startArray')depth++;
   if(name==='endObject'||name==='endArray')depth--;
   if(assembler.done){
    // Packed strings can retain the parser's backing buffers/rope fragments.
    // Compact one article at a time, never the complete workspace.
    const compact=assembler.current&&typeof assembler.current==='object'?JSON.parse(JSON.stringify(assembler.current)):assembler.current;
    this.push({field,array,index:array?index++:null,value:compact});assembler=null;
   }
   callback();
  }catch(error){callback(error);}
 },flush(callback){callback(depth!==0||assembler?Error('Incomplete snapshot'):null);}});
 input.on('error',error=>parser.destroy(error));parser.on('error',error=>entries.destroy(error));input.pipe(parser).pipe(entries);
 try{yield* entries;}finally{input.destroy();parser.destroy();entries.destroy();}
}

export async function readSnapshot(file,{previous=null}={}){
 const data={},indexes=new Map();
 for await(const entry of snapshotEntries(file)){
  const {field,array,start,value}=entry;
  if(start){data[field]=[];if(previous?.[field])indexes.set(field,new Map(previous[field].filter(r=>r?.id).map(r=>[r.id,r])));continue;}
  const old=value?.id?indexes.get(field)?.get(value.id):null;
  const row=old&&JSON.stringify(old)===JSON.stringify(value)?old:value;
  if(array)data[field].push(row);else data[field]=row;
 }
 return data;
}
