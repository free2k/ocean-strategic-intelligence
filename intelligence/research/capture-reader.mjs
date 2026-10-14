import fs from 'node:fs';import {createGunzip} from 'node:zlib';
// NDJSON records end at LF. Unicode line/paragraph separators inside JSON strings
// are legitimate source text and must not be treated as record boundaries.
export async function* readCaptureRows(file){
 const source=fs.createReadStream(file),stream=createGunzip();source.on('error',e=>stream.destroy(e));source.pipe(stream);stream.setEncoding('utf8');let pending='',number=0;
 const parse=line=>{number++;try{return JSON.parse(line);}catch{throw Error('INVALID_CAPTURE_JSON_RECORD_'+number);}};
 try{for await(const chunk of stream){pending+=chunk;let start=0,end;while((end=pending.indexOf('\n',start))>=0){const line=pending.slice(start,end);if(line.trim())yield parse(line);start=end+1;}pending=pending.slice(start);}if(pending.trim())yield parse(pending);}finally{source.destroy();stream.destroy();}
}
