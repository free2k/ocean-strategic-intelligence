import {StringDecoder} from 'node:string_decoder';
// NDJSON is separated by LF bytes. U+2028/U+2029 are legal JSON string content
// and must survive intact; readline may treat them as logical line boundaries.
export async function* parseSnapshot(stream){
 const decoder=new StringDecoder('utf8');let pending='';
 const take=function*(){let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(line.trim())yield JSON.parse(line);}};
 for await(const chunk of stream){pending+=typeof chunk==='string'?chunk:decoder.write(chunk);yield* take();}
 pending+=decoder.end();yield* take();if(pending.trim())yield JSON.parse(pending);
}
