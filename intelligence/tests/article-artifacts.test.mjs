import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {saveImportedArticleEvidence} from '../reconcile-classification.mjs';
test('unchanged article evidence is reused; new versions and missing files are generated once',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'article-evidence-')),stage=path.join(root,'stage');await fs.mkdir(stage);t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'old.html'),'immutable original');
 const docs=[{articleId:1,versionId:'old',content:'same',title:'translated'},{articleId:2,versionId:'new',content:'中文 <body>',title:'New'}];
 assert.equal(await saveImportedArticleEvidence(stage,docs,{artifactDir:root}),1);
 assert.deepEqual(await fs.readdir(stage),['new.html']);
 assert.equal(await fs.readFile(path.join(root,'old.html'),'utf8'),'immutable original');
 assert.match(await fs.readFile(path.join(stage,'new.html'),'utf8'),/中文 &lt;body&gt;/);
 assert.equal(await saveImportedArticleEvidence(stage,docs,{artifactDir:root}),0);
 await assert.rejects(saveImportedArticleEvidence(stage,[{articleId:3,versionId:'../escape',content:'x'}]),/Invalid/);
});
