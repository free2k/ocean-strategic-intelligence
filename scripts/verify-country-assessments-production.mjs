// Read-only real-data acceptance. Run on the host with --root RELEASE_DIR;
// add --api after activation to verify served results and version-bound bodies.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
assert(args.includes('--root'),'--root is required');
const root=value('--root'),useApi=args.includes('--api'),apiBase='http://127.0.0.1:3101';
process.loadEnvFile('/opt/knowledge-base/.env');
const {Pool}=createRequire('/opt/knowledge-base/package.json')('pg');
const pool=new Pool({connectionString:process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const {ResearchLedger}=await import(pathToFileURL(root+'/intelligence/research/ledger.mjs'));
const {PostgresResearchRepository}=await import(pathToFileURL(root+'/intelligence/research/repositories.mjs'));
const {readCountries}=await import(pathToFileURL(root+'/intelligence/research/countries.mjs'));
const {canonicalTopic}=await import(pathToFileURL(root+'/intelligence/industry-topics.mjs'));
const {reviewMatches}=await import(pathToFileURL(root+'/intelligence/research/semantic-review.mjs'));
const expiry=String(Date.now()+600000),cookie=expiry+'.'+createHmac('sha256',process.env.SITE_PASSWORD).update(expiry).digest('hex');
const api=async path=>{
 const response=await fetch(apiBase+path,{headers:{Cookie:'ocean_auth='+cookie},signal:AbortSignal.timeout(60000)});
 assert.equal(response.status,200,'HTTP '+response.status+' for '+path);
 return response.json();
};
const client=await pool.connect();
try{
 const served=useApi?await api('/api/research/countries?view=overview'):null;
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const repository=new PostgresResearchRepository({query:(sql,params)=>client.query(sql,params)}),ledger=new ResearchLedger(repository);
 const release=await ledger.resolveRelease(served?{releaseId:served.meta.releaseId}:{}),global=await readCountries(ledger,{releaseId:release.releaseId,view:'overview'});
 const products=[...global.data.assessments,...global.data.caseStudies,...global.data.historicalProducts];
 assert(products.length>0,'No saved country products found in the published ancestry');
 const ids=rows=>rows.map(p=>p.productId).sort(),resultProducts=result=>[...result.data.assessments,...result.data.caseStudies,...result.data.historicalProducts];
 const manifests=await repository.readCountryProductReleases(release.releaseId);
 const publishedIds=[...new Set(manifests.flatMap(r=>[...r.dossierProducts,...r.countryCases].map(p=>p.productId)))].sort();
 assert.deepEqual(ids(products),publishedIds,'A published product is missing from the global view');
 if(served)assert.deepEqual(ids(resultProducts(served)),publishedIds,'The default global API omitted an existing product');
 const metadata=new Map(),citations=new Map();
 for(const p of products){
  assert(reviewMatches(p.content,p.semanticReview),'Original review binding changed');
  const entries=(await repository.readSnapshotIndex(p.snapshotId)).entries;
  const refs=p.content.items.flatMap(i=>i.references),sources=[];
  for(const ref of refs){
   const entry=entries.find(e=>e.documentId===ref.documentId);assert(entry&&entry.bodyVersionId===ref.bodyVersionId,'Original evidence version missing');
   sources.push(entry);
   const key=[p.publication.releaseId,ref.documentId,ref.bodyVersionId].join('|');
   if(!citations.has(key))citations.set(key,{...ref,releaseId:p.publication.releaseId,quotes:[]});citations.get(key).quotes.push(ref.quote);
  }
  metadata.set(p.productId,sources);
 }
 const codes=p=>p.scope?.countryCodes||p.content.countries;
 const queries=[{}, {sourceId:'country-assessment-validation-empty-source'}, {topic:'海洋低碳'}, {from:'2099-01-01',to:'2099-01-01'}];
 for(const code of new Set(products.flatMap(codes)))queries.push({countryCodes:code});
 for(const sourceId of new Set([...metadata.values()].flat().map(e=>e.body.sourceId).filter(Boolean)))queries.push({sourceId});
 for(const topic of new Set([...metadata.values()].flat().map(e=>e.classification?.primary).filter(Boolean)))queries.push({topic});
 const day=timestamp=>new Date(Date.parse(timestamp)+8*3600000).toISOString().slice(0,10);
 for(const p of products){
  const countries=codes(p);if(countries.length>1)queries.push({countryCodes:countries.join(','),relationMode:'within'});
  const dates=metadata.get(p.productId).map(e=>e.body.publishedAt);
  if(dates.every(d=>Number.isFinite(Date.parse(d)))){const days=dates.map(day).sort();queries.push({from:days[0],to:days.at(-1)});const sources=[...new Set(metadata.get(p.productId).map(e=>e.body.sourceId))];if(sources.length===1)queries.push({countryCodes:countries.join(','),relationMode:countries.length>1?'within':'external',sourceId:sources[0],from:days[0],to:days.at(-1)});}
 }
 const unique=[...new Map(queries.map(q=>[JSON.stringify(q),q])).values()];
 for(const query of unique){
  const selected=(query.countryCodes||'').split(',').filter(Boolean),start=query.from?Date.parse(query.from+'T00:00:00+08:00'):null,end=query.to?Date.parse(query.to+'T00:00:00+08:00')+86400000:null;
  const expected=products.filter(p=>{
   if(selected.length&&(p.productType==='country_case'&&query.relationMode==='within'?codes(p).filter(c=>selected.includes(c)).length<2:!codes(p).some(c=>selected.includes(c))))return false;
   return metadata.get(p.productId).every(e=>(!query.sourceId||e.body.sourceId===query.sourceId)&&(!query.topic||canonicalTopic(e.classification?.primary)===canonicalTopic(query.topic))&&(start===null||Date.parse(e.body.publishedAt)>=start)&&(end===null||Date.parse(e.body.publishedAt)<end));
  });
  const result=await readCountries(ledger,{...query,releaseId:release.releaseId,view:'overview'});
  assert.deepEqual(ids(resultProducts(result)),ids(expected),'Evidence filter mismatch: '+JSON.stringify(query));
  if(expected.length)assert(['published','historical_available'].includes(result.data.assessmentStatus),'Existing evidence produced an empty state');
  if(useApi){const response=await api('/api/research/countries?'+new URLSearchParams({...query,releaseId:release.releaseId,view:'overview'}));assert.deepEqual(ids(resultProducts(response)),ids(expected),'Served evidence filter mismatch');}
 }
 for(const ref of citations.values()){
  const body=useApi?await api('/api/document/'+encodeURIComponent(ref.documentId)+'/versions/'+ref.bodyVersionId+'?releaseId='+ref.releaseId):await ledger.document(ref.documentId,ref.bodyVersionId,{releaseId:ref.releaseId});
  assert.equal(body.meta.releaseId,ref.releaseId);for(const quote of ref.quotes)assert([body.data.content,body.data.contentZh,body.data.title,body.data.titleZh].some(text=>text?.includes(quote)),'A historical quote opened the wrong source body');
 }
 if(useApi)for(const p of products){
  const original=await api('/api/research/countries?view=overview&releaseId='+p.publication.releaseId);
  assert([...original.data.assessments,...original.data.caseStudies].some(row=>row.productId===p.productId),'Original publication link omitted its product');
 }
 const report={passed:true,mode:useApi?'live_http_and_read_only_postgres':'staged_read_only_postgres',releaseId:release.releaseId,snapshotId:release.snapshotId,events:global.data.events.length,currentAssessments:global.data.assessments.length,currentCases:global.data.caseStudies.length,historicalProducts:global.data.historicalProducts.length,products:products.map(p=>({productId:p.productId,type:p.productType,countries:codes(p),title:p.content.project||p.content.overview,publication:p.publication,evidence:metadata.get(p.productId).map(e=>({documentId:e.documentId,bodyVersionId:e.bodyVersionId,sourceId:e.body.sourceId,topic:e.classification?.primary,publishedAt:e.body.publishedAt}))})),filterQueries:unique,filterQueriesVerified:unique.length,pinnedOriginalBodiesVerified:citations.size,originalVersionsVerified:useApi?products.length:0,paidModelRequests:0,businessWrites:0};
 if(args.includes('--output'))await fs.writeFile(value('--output'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,mode:report.mode,events:report.events,currentAssessments:report.currentAssessments,currentCases:report.currentCases,historicalProducts:report.historicalProducts,filters:report.filterQueriesVerified,originalBodies:report.pinnedOriginalBodiesVerified,products:report.products.map(p=>({type:p.type,countries:p.countries,title:p.title}))}));
 await client.query('ROLLBACK');
}finally{client.release();await pool.end();}
