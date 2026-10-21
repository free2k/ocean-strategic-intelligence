import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {changedRowsBackup,saveChangeBackup} from '../change-backup.mjs';
test('EIA change backups exclude unchanged article bodies and rotate only new-format files',async()=>{
 const live={documents:[{id:'old',content:'large existing body'}],entities:[{id:'e',evidenceIds:['before']}],sources:[{id:'source',name:'old source'}]};
 const backup=changedRowsBackup(live,{documents:[{id:'old'},{id:'new'}],entities:[{id:'e'}],sources:[{id:'source'}]},{updatedFields:['sources','entities']});
 assert.deepEqual(backup.before.documents,[]);assert.deepEqual(backup.inserted.documents,['new']);assert.deepEqual(backup.before.entities,live.entities);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'delta-backup-'));
 try{
  await fs.writeFile(path.join(dir,'legacy-full.json'),'original');
  for(let i=0;i<5;i++)await saveChangeBackup(dir,'news',{...backup,sequence:i});
  const files=await fs.readdir(dir);assert.equal(files.filter(name=>name.startsWith('delta-news-')).length,3);
  assert.equal(await fs.readFile(path.join(dir,'legacy-full.json'),'utf8'),'original');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
