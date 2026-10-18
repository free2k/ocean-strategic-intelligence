import {caseInScope} from './country-cases.mjs';
import {readDossier} from './dossier-products.mjs';
import {readFileSync} from 'node:fs';
import {digest,fail} from './ledger.mjs';import {countries} from '../core.mjs';import {normalizeScope,matchesCountryRelation} from './scope.mjs';
const dictionary=[...new Map([...JSON.parse(readFileSync(new URL('../public/world.json',import.meta.url),'utf8')),...countries].filter(c=>/^[A-Z]{2}$/.test(c.code)).map(c=>[c.code,{code:c.code,name:c.name}])).values()];
const codes=new Set(dictionary.map(c=>c.code)),roles=new Set(['project_location','facility_location','event_location','company_home','cross_border_party']);
export async function publishCountries(ledger,expectedReleaseId){
 const {release,snapshot}=await ledger.resolve({releaseId:expectedReleaseId});
 let prior=release,old=null;while(prior){if(prior.countryRegistryId){old=await ledger.repository.read(prior.countryRegistryId);break;}prior=prior.previousReleaseId?await ledger.release(prior.previousReleaseId):null;}
 if(release.countryRegistryId&&old?.snapshotId===release.snapshotId)return release;
 const themes=new Map((old?.themes||[]).map(t=>[t.id,structuredClone(t)])),countryRoles=[],relations=[],events=[];
 const objectRegistry=release.objectRegistryId?await ledger.repository.read(release.objectRegistryId):null;
 for(const entry of snapshot.entries){const proof=new Map(entry.facts.evidence.filter(e=>typeof e.quote==='string'&&[entry.body.content,entry.body.contentZh].some(b=>b?.includes(e.quote))).map(e=>[e.id,e]));
  for(const e of entry.facts.events){
   const mentions=[...new Set((e.countries||[]).filter(c=>codes.has(c)))].sort(),references=(e.evidenceIds||[]).map(id=>proof.get(id)).filter(Boolean).map(p=>({documentId:entry.documentId,bodyVersionId:entry.bodyVersionId,releaseId:release.releaseId,quote:p.quote}));
   const objectIds=(e.entityIds||[]).map(id=>objectRegistry?.entityMap[id]||id).sort(),eventId=objectRegistry?.eventMap[entry.documentId+'|'+e.id]||'event_'+digest({documentId:entry.documentId,id:e.id});
   events.push({id:eventId,title:e.title,countries:mentions,occurredAt:e.eventDate||null,publishedAt:entry.body.publishedAt,topic:entry.classification?.primary||null,references});
   for(const role of e.countryRoles||[])if(codes.has(role.countryCode)&&roles.has(role.role)&&role.subjectId&&(role.evidenceIds||[]).some(id=>proof.has(id)))countryRoles.push({...role,eventId,status:role.status==='verified'?'verified':'candidate',references:(role.evidenceIds||[]).map(id=>proof.get(id)).filter(Boolean).map(p=>({documentId:entry.documentId,bodyVersionId:entry.bodyVersionId,releaseId:release.releaseId,quote:p.quote}))});
   if(mentions.length){const key={countries:mentions,type:e.type||'其他',objectIds:objectIds.length?objectIds:[eventId]},id='theme_'+digest(key),previous=themes.get(id),member={eventId,documentId:entry.documentId,bodyVersionId:entry.bodyVersionId,publishedAt:entry.body.publishedAt,topic:entry.classification?.primary||null,references};
    const theme=previous||{id,name:e.title||'待明确议题',aliases:[],countries:mentions,type:e.type||'其他',objectIds,firstSeenSnapshot:release.snapshotId,versions:[],members:[]};
    if(e.title&&!theme.aliases.includes(e.title))theme.aliases.push(e.title);if(!theme.members.some(m=>m.eventId===eventId&&m.bodyVersionId===entry.bodyVersionId))theme.members.push(member);
    if(!theme.versions.some(v=>v.snapshotId===release.snapshotId))theme.versions.push({snapshotId:release.snapshotId,releaseId:release.releaseId,change:previous?'continued':'first_recorded',status:'candidate',assessment:null});theme.lastSeenSnapshot=release.snapshotId;themes.set(id,theme);
   }
   for(let i=0;i<mentions.length;i++)for(let j=i+1;j<mentions.length;j++)relations.push({id:'country_relation_'+digest({eventId,a:mentions[i],b:mentions[j]}),countryA:mentions[i],countryB:mentions[j],type:'co_occurrence',confirmed:false,direction:null,eventId,references,title:e.title});
  }
 }
 const registry={kind:'registry',registryType:'country',snapshotId:release.snapshotId,themes:[...themes.values()],countryRoles,relations,events};const id='registry_'+digest(registry);if(id===release.countryRegistryId)return release;
 const {releaseId,...rest}=release,next={...rest,countryRegistryId:id,previousReleaseId:releaseId,publishedAt:new Date().toISOString()};next.releaseId='release_'+digest(next);await ledger.repository.commit({expectedReleaseId,head:{releaseId:next.releaseId,snapshotId:next.snapshotId},records:{[id]:registry,[next.releaseId]:next}});return next;
}
export async function readCountries(ledger,query={}){
 for(const key of Object.keys(query))if(!['releaseId','snapshotId','countryCodes','relationMode','topic','sourceId','from','to','view'].includes(key))fail('INVALID_SCOPE','不支持的国别筛选条件');
 if(query.view&&!['overview','full'].includes(query.view))fail('INVALID_SCOPE','不支持的国别视图');
 const day=value=>{const checked=normalizeScope({periodStart:value});return Date.parse(checked.periodStart);};
 const start=query.from?day(query.from):null,end=query.to?day(query.to)+86400000:null;
 if(start!==null&&end!==null&&start>=end)fail('INVALID_SCOPE','截止日期不能早于起始日期');
 const scope=normalizeScope({countryCodes:query.countryCodes,relationMode:query.relationMode,topic:query.topic},codes),release=await ledger.resolveRelease(query);if(!release.countryRegistryId)fail('COUNTRIES_NOT_INITIALIZED','当前版本尚无国别档案',503);
 const [r,snapshot]=await Promise.all([query.view==='overview'&&ledger.repository.readCountryOverview?ledger.repository.readCountryOverview(release.countryRegistryId):ledger.repository.read(release.countryRegistryId),ledger.repository.readSnapshotIndex?ledger.repository.readSnapshotIndex(release.snapshotId):ledger.snapshot(release.snapshotId)]);if(r?.registryType!=='country')fail('COUNTRIES_NOT_INITIALIZED','国别档案不可用',503);const selected=new Set(scope.countryCodes),matches=c=>!selected.size||c.some(x=>selected.has(x));
 const documents=new Set(snapshot.entries.filter(e=>(!query.sourceId||e.body.sourceId===query.sourceId)&&(start===null||Date.parse(e.body.publishedAt)>=start)&&(end===null||Date.parse(e.body.publishedAt)<end)).map(e=>e.documentId));
 const countryCoverage={};for(const event of r.events.filter(e=>(!scope.topic||e.topic===scope.topic)&&e.references.some(ref=>documents.has(ref.documentId))))for(const code of new Set(event.countries))countryCoverage[code]=(countryCoverage[code]||0)+1;
 const events=r.events.filter(e=>matches(e.countries)&&(!scope.topic||e.topic===scope.topic)&&e.references.some(ref=>documents.has(ref.documentId))),eventIds=new Set(events.map(e=>e.id)),themeRows=r.themes.filter(t=>matches(t.countries)&&t.members.some(m=>eventIds.has(m.eventId))).map(t=>({...t,members:t.members.filter(m=>eventIds.has(m.eventId)&&documents.has(m.documentId))}));
 const relationMatch=e=>scope.relationMode==='within'?selected.has(e.countryA)&&selected.has(e.countryB):!selected.size||selected.has(e.countryA)||selected.has(e.countryB);
 const assessment=scope.countryCodes.length&&!query.topic&&!query.sourceId&&!query.from&&!query.to?await readDossier(ledger,release,{kind:'country',countryCodes:scope.countryCodes}):null;
 const dossiers=await Promise.all(scope.countryCodes.map(async countryCode=>({countryCode,assessment:!query.topic&&!query.sourceId&&!query.from&&!query.to?await readDossier(ledger,release,{kind:'country',countryCodes:[countryCode]}):null})));
 const allCases=(await Promise.all((release.countryCases||[]).map(x=>ledger.repository.read(x.productId)))).filter(p=>p&&p.snapshotId===release.snapshotId);
 const countryEventCoverage={...countryCoverage},countryCaseCoverage={};for(const p of allCases.filter(p=>caseInScope(p,{selected:new Set(),documents,topic:scope.topic,entries:snapshot.entries,mode:'external'})))for(const code of new Set(p.content.countries)){countryCaseCoverage[code]=(countryCaseCoverage[code]||0)+1;countryCoverage[code]=(countryCoverage[code]||0)+1;}
 const caseStudies=allCases.filter(p=>caseInScope(p,{selected,documents,topic:scope.topic,entries:snapshot.entries,mode:scope.relationMode}));
 const caseRoles=caseStudies.flatMap(p=>p.content.items.filter(i=>i.kind==='role'&&(!selected.size||selected.has(i.countryCode))).map(i=>({...i,status:'verified',verification:'model_second_pass'})));
 const caseRelations=caseStudies.flatMap(p=>p.content.items.filter(i=>i.kind==='relation').map(i=>({...i,confirmed:true,type:i.relationType,verification:'model_second_pass'}))).filter(i=>matchesCountryRelation(i,scope));
 return {data:{assessment,dossiers,caseStudies,countries:dictionary,countryCoverage,countryEventCoverage,countryCaseCoverage,roles:[...r.countryRoles.filter(e=>eventIds.has(e.eventId)&&(!selected.size||selected.has(e.countryCode))),...caseRoles],themes:query.view==='overview'?themeRows.map(({versions,...theme})=>({...theme,versionCount:theme.versionCount??versions.length})):themeRows,confirmedRelations:[...r.relations.filter(e=>eventIds.has(e.eventId)&&matchesCountryRelation(e,scope)),...caseRelations],coOccurrences:r.relations.filter(e=>!e.confirmed&&eventIds.has(e.eventId)&&relationMatch(e)),events,assessmentStatus:assessment?'saved_limited_review':'not_published',scopeWarning:'国家来自原记录地域线索；未明确角色不归为项目地或企业所属国。共现不代表合作或战略关系。'},meta:{releaseId:release.releaseId,snapshotId:release.snapshotId,scope:{...scope,sourceIds:query.sourceId?[query.sourceId]:[],periodStart:start===null?null:new Date(start).toISOString(),periodEndExclusive:end===null?null:new Date(end).toISOString()},timeBasis:'document_publication',generatedAt:release.publishedAt}};
}
