import {writeJsonFile} from './json-stream.mjs';
import {readSnapshot} from './snapshot-reader.mjs';
import {reconcileDocument} from './reconcile-classification.mjs';
// MP_CLEAN_V1
import fs from 'node:fs/promises';import path from 'node:path';import pg from 'pg';
import {id,chunks,mergeRecords} from './core.mjs';import {ruleExtract} from './rules.mjs';
import {importXEvidence} from './import-x-evidence.mjs';
const dir=process.env.INTEL_DATA_DIR||'.data/intelligence',file=path.join(dir,'snapshot.json');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
 if(!(await pool.query("SELECT to_regclass('mp2rss.items') AS t")).rows[0].t){console.log('Mp2RSS not initialized; skipped');}
 else{const data=await readSnapshot(file);const ss=(await pool.query('SELECT * FROM mp2rss.subscriptions')).rows;
 for(const s of ss){const source={id:'mp2rss_'+s.id,name:s.payload.name,country:s.payload.platform==='mp'?'CN':'GLOBAL',level:'S4',language:s.payload.platform==='mp'?'zh':'en',method:'api',url:s.payload.platform==='x'&&s.payload.handle?'https://x.com/'+encodeURIComponent(s.payload.handle):'https://mp.weixin.qq.com/',scope:'Mp2RSS 获取；原平台出处逐文保留；不是机构官网认证',status:s.present&&s.enabled?'ready':'paused',checkedAt:s.checked_at?.toISOString()};data.sources=[...data.sources.filter(x=>x.id!==source.id),source];}
 const allItems=(await pool.query('SELECT payload,classification FROM mp2rss.items')).rows;
 for(const row of allItems){const d=data.documents.find(d=>d.url===row.payload.url&&d.providerHash);if(d){reconcileDocument(d,row.classification);if(row.classification.primary)d.topic=row.classification.primary;}}
 const hasEvidence=(await pool.query("SELECT to_regclass('mp2rss.evidence_links') t")).rows[0].t;
 const linkRows=hasEvidence?(await pool.query('SELECT url,status,payload,origins FROM mp2rss.evidence_links')).rows:[];
 for(const row of allItems){const p=row.payload,d=data.documents.find(d=>d.url===p.url&&d.providerHash);if(d){d.discovery=p.discovery;d.evidenceAssets=linkRows.filter(a=>a.origins.some(o=>o.postUrl===p.url)).map(a=>({url:a.url,status:a.status,...a.payload}));}}
 const rows=(await pool.query("SELECT * FROM mp2rss.items WHERE classification->>'status'='accepted' AND payload->>'contentStatus'='complete'")).rows;let added=0;
 for(const row of rows){const p=row.payload,docId=id('doc',p.url),versionId=id('ver',p.url+p.hash);const existing=data.documents.find(d=>d.id===docId||d.url===p.url);if(existing?.providerHash===p.hash){reconcileDocument(existing,row.classification);if(row.classification.primary)existing.topic=row.classification.primary;existing.discovery=p.discovery;if(p.contentZh){existing.contentZh=p.contentZh;existing.titleZh=p.titleZh||existing.titleZh;existing.translationVersion=existing.versionId;}continue;}
  // Keep manually entered records and separately collected originals; no overwrite by an aggregator.
  if(existing&&!existing.providerHash)continue;
  const d={id:docId,versionId,contentHash:p.hash,providerHash:p.hash,sourceId:'mp2rss_'+row.subscription_id,url:p.url,title:p.title,titleZh:p.title,content:p.content,originalContent:p.originalContent,cleaning:p.cleaning,language:p.language,publishedAt:p.publishedAt,publishedPrecision:'second',collectedAt:row.updated_at.toISOString(),originalPublisher:p.author,platform:p.source.platform==='mp'?'微信公众号':'X',provider:'Mp2RSS',contentKind:p.kind,articleId:row.article_id,context:p.context,discovery:p.discovery,industry:row.classification,chunks:chunks(p.content),extractionStatus:'candidate',extractionVersion:'rules-v1'};
  if(p.contentZh){d.contentZh=p.contentZh;d.titleZh=p.titleZh||d.title;d.translationVersion=versionId;d.translationModel=p.translationModel;d.translatedAt=p.translatedAt;}
  d.extraction=ruleExtract(d);d.topic=row.classification.primary||d.extraction.topic;d.summaryZh=d.extraction.summaryZh;
  d.evidenceAssets=linkRows.filter(a=>a.origins.some(o=>o.postUrl===p.url)).map(a=>({url:a.url,status:a.status,...a.payload}));
  data.documents=[...data.documents.filter(x=>x.id!==d.id),d];for(const k of ['events','relations','observations','evidence']){const protectedRows=data[k].filter(x=>x.documentId===d.id&&(x.reviewedAt||x.manual));data[k]=[...data[k].filter(x=>x.documentId!==d.id),...protectedRows,...d.extraction[k].filter(x=>!protectedRows.some(old=>old.id===x.id))];}
  data.entities=mergeRecords([...data.entities,...d.extraction.entities]);
  const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');await fs.writeFile(path.join(dir,versionId+'.html'),`<!doctype html><meta charset="utf-8"><h1>${esc(p.title)}</h1><p>${esc(p.author)} · ${esc(p.publishedAt)}</p><a href="${esc(p.url)}">原文</a><pre>${esc(p.content)}</pre>`);added++;
 }
 await importXEvidence(data,pool,dir);
 data.generatedAt=new Date().toISOString();await writeJsonFile(file+'.mp2.tmp',data);await fs.rename(file+'.mp2.tmp',file);console.log(JSON.stringify({provider:'Mp2RSS',added,eligible:rows.length}));}
}finally{await pool.end();}
