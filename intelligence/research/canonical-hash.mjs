import {createHash} from 'node:crypto';

// Same bytes as JSON.stringify(canonical(value)), without a second object tree
// and a giant serialized string. Stable IDs must not change during migration.
export function canonicalDigest(value){
 const hash=createHash('sha256');let pieces=[],size=0;
 const emit=text=>{pieces.push(text);size+=text.length;if(size>=65536){hash.update(pieces.join(''));pieces=[];size=0;}};
 const index=k=>String(k>>>0)===k&&(k>>>0)!==4294967295;
 function visit(item,arrayItem=false){
  if(item===null||typeof item!=='object'){
   const text=JSON.stringify(item);
   if(text===undefined){if(arrayItem)emit('null');else throw TypeError('Value is not JSON serializable');}
   else emit(text);
   return;
  }
  if(Array.isArray(item)){
   emit('[');for(let i=0;i<item.length;i++){if(i)emit(',');visit(item[i],true);}emit(']');return;
  }
  const sorted=Object.keys(item).filter(k=>item[k]!==undefined&&typeof item[k]!=='function'&&typeof item[k]!=='symbol').sort();
  const keys=[...sorted.filter(index).sort((a,b)=>Number(a)-Number(b)),...sorted.filter(k=>!index(k))];
  emit('{');for(let i=0;i<keys.length;i++){if(i)emit(',');const key=keys[i];emit(JSON.stringify(key));emit(':');visit(item[key]);}emit('}');
 }
 visit(value);if(pieces.length)hash.update(pieces.join(''));return hash.digest('hex');
}
