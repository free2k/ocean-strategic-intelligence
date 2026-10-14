import {readBriefs} from './brief-products.mjs';
import {readDossier} from './dossier-products.mjs';
export async function readProductCatalog(ledger,query={}){
 const release=await ledger.resolveRelease(query),briefs=await readBriefs(ledger,{releaseId:release.releaseId}),dossiers=[];
 for(const ref of release.dossierProducts||[]){const p=await readDossier(ledger,release,ref.scope);if(p)dossiers.push({productId:p.productId,scope:p.scope,generatedAt:p.generatedAt,overview:p.content.overview,completeness:p.completeness||'partial'});}
 const cases=(await Promise.all((release.countryCases||[]).map(r=>ledger.repository.read(r.productId)))).filter(p=>p&&p.snapshotId===release.snapshotId).map(p=>({project:p.content.project,countries:p.content.countries,generatedAt:p.generatedAt}));
 return {data:{cases,briefs:briefs.data.map(p=>({topic:p.topic,status:p.status,generatedAt:p.generatedAt,scope:p.scope})),dossiers},meta:{releaseId:release.releaseId,snapshotId:release.snapshotId,generatedAt:release.publishedAt}};
}
