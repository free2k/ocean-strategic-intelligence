// Decode UTF-8 after all bounded byte chunks arrive. Network packets can end
// inside a Chinese character or emoji; decoding each packet loses source text.
export async function readJsonBody(request,max=12000){
 const parts=[];let bytes=0;
 for await(const chunk of request){
  const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=part.length;
  if(bytes>max)throw Error('request too large');
  parts.push(part);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
}
