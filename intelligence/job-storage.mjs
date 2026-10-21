import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream,createWriteStream} from 'node:fs';
import {createGzip,createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';

export async function assertJobCapacity(dir,{minBytes=5*1024**3,minInodes=10000}={}){
 const stat=await fs.statfs(dir);
 if(stat.bavail*stat.bsize<minBytes||(stat.files>0&&stat.ffree<minInodes))
  throw Object.assign(Error('Insufficient disk space or free inodes for another collection job'),{code:'DISK_CAPACITY_LOW'});
 if(process.platform==='linux'){
  const memory=await fs.readFile('/proc/meminfo','utf8'),available=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024;
  if(available<1536*1024**2)throw Object.assign(Error('Available memory below processing reserve'),{code:'MEMORY_CAPACITY_LOW'});
 }
}
export function retryDelay(failures,code){
 return ['54000','ENOSPC','DISK_CAPACITY_LOW'].includes(code)?6*3600000:Math.min(6*3600000,15*60000*2**Math.min(5,Math.max(0,failures-1)));
}
async function hashStream(stream){const hash=createHash('sha256');for await(const b of stream)hash.update(b);return hash.digest('hex');}
export async function finishJobStage(dir,stage,{committed=false,copied=[]}={}){
 const base=await fs.realpath(path.join(dir,'jobs')),target=await fs.realpath(stage);
 if(path.dirname(target)!==base|| (await fs.lstat(stage)).isSymbolicLink())throw Error('Invalid job cleanup path');
 if(committed){
  // Only discard files whose durable copies/DB commit have succeeded.
  for(const name of ['snapshot.json',...copied]){
   if(path.basename(name)!==name)throw Error('Invalid artifact name');
   await fs.rm(path.join(target,name),{force:true});
  }
  if(!(await fs.readdir(target)).length)await fs.rmdir(target);
  return;
 }
 // Retain failed evidence losslessly for repair, instead of an enormous raw copy.
 const source=path.join(target,'snapshot.json'),archive=source+'.gz',tmp=archive+'.part';
 try{
  await fs.access(source);
  await pipeline(createReadStream(source),createGzip({level:1}),createWriteStream(tmp,{flags:'wx'}));
  const original=await hashStream(createReadStream(source)),decoded=await hashStream(createReadStream(tmp).pipe(createGunzip()));
  if(original!==decoded)throw Error('Job archive checksum mismatch');
  await fs.rename(tmp,archive);
  await fs.writeFile(archive+'.sha256',original+'\n');
  await fs.unlink(source);
 }catch(e){if(e.code!=='ENOENT')throw e;}finally{await fs.rm(tmp,{force:true});}
}
