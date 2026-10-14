// Read-only 90-day source coverage validation, not reconstructed historical ingestion batches.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ResearchLedger,digest} from './ledger.mjs';
import {FileResearchRepository} from './repositories.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--archive')||!args.includes('--end'))throw Error('Requires --archive PATH --end YYYY-MM-DD (inclusive Beijing day)');
const archive=path.resolve(arg('--archive')),ledger=new ResearchLedger(new FileResearchRepository(archive)),{snapshot,release}=await ledger.resolve({});
const end=Date.parse(arg('--end')+'T00:00:00+08:00')+86400000,start=end-90*86400000;if(!Number.isFinite(end))throw Error('Invalid date');
const before=digest(snapshot),headBefore=await ledger.repository.head(),days=[];let missingDates=0,invalidQuotes=0;
for(let n=0;n<90;n++){const a=start+n*86400000,b=a+86400000,entries=snapshot.entries.filter(e=>{const at=Date.parse(e.body.publishedAt);return at>=a&&at<b;});days.push({day:new Date(a+8*3600000).toISOString().slice(0,10),documents:entries.length,withBody:entries.filter(e=>e.body.content||e.body.contentZh).length,accepted:entries.filter(e=>e.classification?.status==='accepted').length,documentVersions:entries.map(e=>({documentId:e.documentId,bodyVersionId:e.bodyVersionId,classificationVersionId:e.classificationVersionId,structureVersionId:e.structureVersionId}))});}
for(const e of snapshot.entries){if(!Number.isFinite(Date.parse(e.body.publishedAt)))missingDates++;for(const q of e.facts.evidence)if(q.quote&&![e.body.content,e.body.contentZh].some(s=>s?.includes(q.quote)))invalidQuotes++;}
assert.equal(digest(await ledger.snapshot(release.snapshotId)),before);assert.deepEqual(await ledger.repository.head(),headBefore);
const report={kind:'read_only_90_day_coverage_validation',scope:'saved intelligence snapshot; not entire raw article database; publication days are not ingestion batch history',sourceReleaseId:release.releaseId,snapshotId:release.snapshotId,ruleVersion:snapshot.ruleVersion,start:days[0].day,end:days.at(-1).day,days:90,coveredDays:days.filter(d=>d.documents).length,documentsInWindow:days.reduce((n,d)=>n+d.documents,0),snapshotDocuments:snapshot.entries.length,missingPublicationDates:missingDates,nonVerbatimLegacyEvidence:invalidQuotes,sourceSnapshotUnchanged:true,sourceHeadUnchanged:true,modelCalls:0,limitations:['No original article-database mapping is inferred from this snapshot.','No historical collection times or completed research products are fabricated.','Evidence mismatch remains a data quality gap, not silently corrected.'],daily:days};
await fs.writeFile('.data/backfill-90-day-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,daily:undefined},null,2));
