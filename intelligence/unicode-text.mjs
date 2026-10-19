// Offsets remain UTF16 indices so source quotations can be traced exactly.
export const splitsPair=(text,i)=>i>0&&i<text.length&&text.charCodeAt(i-1)>=0xD800&&text.charCodeAt(i-1)<=0xDBFF&&text.charCodeAt(i)>=0xDC00&&text.charCodeAt(i)<=0xDFFF;
export function textSlice(text,start=0,end=text.length){
 const index=n=>{n=Number(n);n=Number.isNaN(n)?0:Math.trunc(n);return n<0?Math.max(text.length+n,0):Math.min(n,text.length);};
 start=index(start);end=index(end);if(splitsPair(text,start))start++;if(splitsPair(text,end))end--;return text.slice(start,Math.max(start,end));
}
export function textParts(text,size){
 if(!Number.isInteger(size)||size<1)throw Error('invalid_chunk_size');
 const parts=[];for(let start=0;start<text.length;){let end=Math.min(text.length,start+size);if(splitsPair(text,end))end++;parts.push({start,end,text:text.slice(start,end)});start=end;}return parts;
}
