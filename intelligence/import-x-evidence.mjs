import {textSlice} from './unicode-text.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {id,chunks,mergeRecords} from './core.mjs';
import {ruleExtract} from './rules.mjs';

export async function importXEvidence(data,pool,dir){
 if(!(await pool.query("SELECT to_regclass('mp2rss.evidence_documents') AS t")).rows[0].t)return;
 const rows=(await pool.query('SELECT * FROM mp2rss.evidence_documents')).rows;
 const assets=(await pool.query("SELECT * FROM mp2rss.evidence_links WHERE kind IN ('image','attachment')")).rows;
 for(const row of rows){const p=row.payload,existing=data.documents.find(d=>d.url===p.url);
  const evidenceAssets=assets.filter(a=>a.origins.some(o=>o.articleUrl===p.url||p.origins.some(origin=>origin.postUrl&&origin.postUrl===o.postUrl||origin.rootPostUrl&&origin.rootPostUrl===o.rootPostUrl))).map(a=>({url:a.url,status:a.status,...a.payload,origins:a.origins}));
  if(existing){existing.provenance=p.origins;existing.evidenceAssets=evidenceAssets;existing.sourceTables=p.tables;existing.references=p.references||[];existing.industry=row.classification;if(row.classification.primary)existing.topic=row.classification.primary;if(!existing.linkedEvidenceHash)continue;}
  if(p.access!=='public'||p.status!=='cleaned'||row.classification.status!=='accepted')continue;
  if(existing?.linkedEvidenceHash===p.hash)continue;
  const sourceId=id('websource',new URL(p.url).hostname);if(!data.sources.some(s=>s.id===sourceId))data.sources.push({id:sourceId,name:new URL(p.url).hostname,country:'GLOBAL',level:'S4',language:p.language,method:'web',url:new URL(p.url).origin,scope:'通过 RSS 或 X 推文发现的原始站点；正文、图表与发现链保留',status:'ready'});
  const versionId=id('ver',p.url+p.hash),d={id:id('doc',p.url),versionId,contentHash:p.hash,linkedEvidenceHash:p.hash,sourceId,url:p.url,title:p.title,titleZh:p.titleZh||p.title,content:p.content,contentZh:p.contentZh,language:p.language,publishedAt:p.publishedAt,publishedPrecision:p.publishedPrecision||null,collectedAt:p.collectedAt,originalPublisher:p.author,platform:'原始网站',provider:'X 外链采集',contentKind:p.contentKind,provenance:p.origins,evidenceAssets,sourceTables:p.tables,references:p.references||[],industry:row.classification,topic:row.classification.primary,chunks:chunks(p.content),extractionStatus:'candidate',extractionVersion:'rules-v1'};
  if(p.origins?.some(o=>o.provider==='OilPrice RSS'))d.provider='OilPrice RSS';
  if(p.contentZh){d.translationVersion=versionId;d.translationModel=p.translationModel;d.translatedAt=p.translatedAt;d.translationType='千问中文译文；原文保留，译文待核对';}
  d.extraction=ruleExtract(d);d.summaryZh=textSlice(p.contentZh||'',0,400)||d.extraction.summaryZh;
  data.documents=[...data.documents.filter(x=>x.id!==d.id),d];for(const k of ['events','relations','observations','evidence']){const protectedRows=data[k].filter(x=>x.documentId===d.id&&(x.reviewedAt||x.manual));data[k]=[...data[k].filter(x=>x.documentId!==d.id),...protectedRows,...d.extraction[k].filter(x=>!protectedRows.some(old=>old.id===x.id))];}data.entities=mergeRecords([...data.entities,...d.extraction.entities]);
  const esc=x=>String(x||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');await fs.writeFile(path.join(dir,versionId+'.html'),`<!doctype html><meta charset="utf-8"><h1>${esc(p.title)}</h1><a href="${esc(p.url)}">原文</a><pre>${esc(p.content)}</pre>`);
 }
}
