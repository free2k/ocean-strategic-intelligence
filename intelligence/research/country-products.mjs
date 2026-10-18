import {fail} from './ledger.mjs';
import {canonicalTopic} from '../industry-topics.mjs';

export const productCountries=product=>product.scope?.countryCodes||product.content.countries;
export const productReferences=product=>(product.content?.items||[]).flatMap(item=>item.references||[]);

// Read only ancestors of the requested published release. A historical page must
// never see products published later, or records outside the public release chain.
export async function countryProductReleases(repository,release){
 if(repository.readCountryProductReleases)return repository.readCountryProductReleases(release.releaseId);
 const rows=[],seen=new Set();let current=release;
 while(current){
  if(seen.has(current.releaseId))fail('INVALID_RELEASE_HISTORY','发布历史存在循环',503);
  seen.add(current.releaseId);
  rows.push({releaseId:current.releaseId,snapshotId:current.snapshotId,publishedAt:current.publishedAt,dossierProducts:(current.dossierProducts||[]).filter(p=>p.scope.kind==='country'),countryCases:current.countryCases||[]});
  if(!current.previousReleaseId)break;
  current=await repository.read(current.previousReleaseId);
  if(!current||current.kind!=='release')fail('VERSION_NOT_FOUND','历史发布版本不可读取',503);
 }
 return rows;
}

export async function readCountryProducts(ledger,release){
 const rows=await countryProductReleases(ledger.repository,release),origins=new Map();
 // The first publication of an immutable product provides its original version.
 for(const row of [...rows].reverse())for(const ref of [...row.dossierProducts,...row.countryCases])if(!origins.has(ref.productId))origins.set(ref.productId,row);
 const currentIds=new Set([...(release.dossierProducts||[]).filter(p=>p.scope.kind==='country'),...(release.countryCases||[])].map(p=>p.productId));
 return Promise.all([...origins].map(async([productId,origin])=>{
  const product=await ledger.repository.read(productId);
  if(!product||!['dossier','country_case'].includes(product.productType)||product.snapshotId!==origin.snapshotId)fail('PRODUCT_NOT_FOUND','发布清单中的国别成果或绑定版本不可读取',503);
  const publication={releaseId:origin.releaseId,snapshotId:origin.snapshotId,publishedAt:origin.publishedAt,historical:!currentIds.has(productId)||product.snapshotId!==release.snapshotId};
  // Keep the reviewed content byte-for-byte unchanged. Readers bind reference
  // links using publication.releaseId, outside the semantic review digest.
  return {...product,productId,publication,history:product.productType==='dossier'?[{productId,generatedAt:product.generatedAt,revisionReason:product.revisionReason||null,content:product.content}]:[],phaseComparisons:[]};
 }));
}

export function productCountryInScope(product,selected,mode='external'){
 const countries=productCountries(product);
 if(!selected.size)return true;
 if(product.productType==='country_case'&&mode==='within')return countries.filter(code=>selected.has(code)).length>=2;
 return countries.some(code=>selected.has(code));
}

// A reviewed conclusion is indivisible: all actual cited document versions must
// match. Uncited eligible inputs do not exclude an otherwise matching product.
export function productEvidenceInScope(product,entries,{topic,sourceId,start=null,end=null}={}){
 const byId=entries instanceof Map?entries:new Map(entries.map(e=>[e.documentId,e]));
 const refs=productReferences(product);
 return refs.length>0&&refs.every(ref=>{
  const entry=byId.get(ref.documentId);
  return entry&&entry.bodyVersionId===ref.bodyVersionId&&(!topic||canonicalTopic(entry.classification?.primary)===canonicalTopic(topic))&&(!sourceId||entry.body.sourceId===sourceId)&&(start===null||Date.parse(entry.body.publishedAt)>=start)&&(end===null||Date.parse(entry.body.publishedAt)<end);
 });
}

export async function scopeCountryProducts(ledger,release,snapshot,scope){
 const products=await readCountryProducts(ledger,release),indexes=new Map([[release.snapshotId,Promise.resolve(new Map((snapshot.entries||[]).map(e=>[e.documentId,e])))]]);
 const readIndex=id=>{
  if(!indexes.has(id))indexes.set(id,(ledger.repository.readSnapshotIndex?ledger.repository.readSnapshotIndex(id):ledger.snapshot(id)).then(value=>new Map((value.entries||[]).map(e=>[e.documentId,e]))));
  return indexes.get(id);
 };
 const matches=await Promise.all(products.map(async product=>({product,matches:productEvidenceInScope(product,await readIndex(product.snapshotId),scope)})));
 const selected=new Set(scope.countryCodes),countryMatches=matches.filter(({product})=>productCountryInScope(product,selected,scope.relationMode));
 return {matching:countryMatches.filter(p=>p.matches).map(p=>p.product),available:matches.filter(p=>p.matches).map(p=>p.product),excluded:countryMatches.filter(p=>!p.matches).length};
}
