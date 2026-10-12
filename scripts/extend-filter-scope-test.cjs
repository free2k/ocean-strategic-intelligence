const fs=require('fs'),f='scripts/test-classification-flow.mjs';let s=fs.readFileSync(f,'utf8');
s=s.replace('source_id integer,published_at',"source_id integer,source_type text DEFAULT 'wechat',published_at").replace('name text,type text);', 'name text,type text,is_overseas boolean DEFAULT false);').replace("INSERT INTO public.sources VALUES(1", "INSERT INTO public.sources(id,name,type) VALUES(1");
s=s.replace(" console.log('PASS:", `
 await db.query("UPDATE public.filter_rules SET enabled=true WHERE type='exclude'");
 await db.query("INSERT INTO public.sources(id,name,type,is_overseas) VALUES(2,'外网渠道','mp2rss_mp',true)");
 for(const [n,kind,state,source,manual] of [[90,'mp2rss_mp','rejected',1,false],[91,'wechat','rejected',1,false],[92,'mp2rss_mp','accepted',1,false],[93,'mp2rss_mp','rejected',1,true],[94,'mp2rss_mp','rejected',2,false]])await db.query('INSERT INTO public.articles(id,title,content,link,source_id,source_type,published_at,filter_status,manual_classify) VALUES($1,$2,$3,$4,$5,$6,now(),$7,$8)',[n,'海上风电筛选测试','海上风电正文用于限定范围的重新分类。','https://example.invalid/'+n,source,kind,state,manual]);
 const scope={targeted:true,sourceType:'mp2rss_mp',filterStatus:'rejected',overseas:'false',search:'筛选测试'};
 const scoped=await previewClassification(db,scope);assert.equal(scoped.total,2);assert.equal(scoped.manual,1);assert.equal(scoped.intelligence,null);
 const oldOutside=JSON.stringify(data.documents.find(d=>d.id==='old2'));
 await assert.rejects(()=>enqueueClassification(db,{...scope,filterStatus:'accepted',version:scoped.version,previewToken:scoped.previewToken}),/预览/);
 const scopedJob=await enqueueClassification(db,{...scope,version:scoped.version,previewToken:scoped.previewToken});await reconcileClassification(db,data);
 assert.deepEqual((await db.query('SELECT article_id FROM classification.audit WHERE job_id=$1 ORDER BY article_id',[scopedJob.id])).rows.map(x=>x.article_id),[90,93]);
 assert.equal((await db.query('SELECT filter_status FROM public.articles WHERE id=91')).rows[0].filter_status,'rejected');
 assert.equal((await db.query('SELECT filter_status FROM public.articles WHERE id=93')).rows[0].filter_status,'rejected');
 assert.equal(JSON.stringify(data.documents.find(d=>d.id==='old2')),oldOutside);
 assert.ok(data.documents.find(d=>d.url.endsWith('/90')).classificationManaged);
 console.log('PASS:`);
fs.writeFileSync(f,s);
