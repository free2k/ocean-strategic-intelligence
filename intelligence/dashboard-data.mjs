import {ResearchLedger,fail} from './research/ledger.mjs';
import {readCountries} from './research/countries.mjs';
import {countries} from './core.mjs';
import {standardTopics} from './industry-topics.mjs';
const memo=(map,key,read)=>{if(!map.has(key)){if(map.size>=16)map.delete(map.keys().next().value);map.set(key,Promise.resolve().then(read).catch(e=>{map.delete(key);throw e;}));}return map.get(key);};
// Country views only need the immutable country registry and short document
// metadata. Never hydrate the object archive or start a research/model task.
export class DashboardData{
 constructor(repository){
  const records=new Map(),overviews=new Map(),snapshots=new Map(),chains=new Map();
  const snapshot=id=>memo(snapshots,id,()=>repository.readDashboardSnapshot?repository.readDashboardSnapshot(id):repository.readSnapshotIndex?repository.readSnapshotIndex(id):repository.read(id));
  const view={head:()=>repository.head(),read:id=>memo(records,id,()=>repository.read(id)),isPublished:repository.isPublished?id=>repository.isPublished(id):undefined,releaseForSnapshot:id=>repository.releaseForSnapshot(id),readSnapshotIndex:snapshot,readCountryOverview:id=>memo(overviews,id,()=>repository.readCountryOverview?repository.readCountryOverview(id):repository.read(id))};
  if(repository.readCountryProductReleases)view.readCountryProductReleases=id=>memo(chains,id,()=>repository.readCountryProductReleases(id));
  this.ledger=new ResearchLedger(view);this.snapshot=snapshot;
 }
 async page(query={}){
  if(query.view&&query.view!=='overview')fail('INVALID_SCOPE','请通过原始国别档案接口读取完整历史');
  const result=await readCountries(this.ledger,{...query,view:'overview'}),snapshot=await this.snapshot(result.meta.snapshotId);
  return {...result,options:{sources:(snapshot.sources||[]).map(({id,name})=>({id,name})),topics:standardTopics.map(({id,name})=>({id,name})),mapCountries:countries}};
 }
}
