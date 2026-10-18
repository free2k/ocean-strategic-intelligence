import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ResearchLedger} from '../../research/ledger.mjs';
import {FileResearchRepository} from '../../research/repositories.mjs';
import {attachPublishedRules} from '../../published-rules.mjs';
import {publishCountries} from '../../research/countries.mjs';
import {publishDossier} from '../../research/dossier-products.mjs';
import {publishCountryCase} from '../../research/country-cases.mjs';
import {recordReview} from '../../research/semantic-review.mjs';

export const fixtureReview=content=>recordReview(content,{summarySupported:true,summaryReason:'isolated fixture',items:content.items.map(i=>({id:i.id,supported:true,reason:'isolated fixture'})),duplicateGroups:[]},{model:'test-fixture',requestId:'no-provider-call'});

export async function countryProductsFixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'country-products-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const repository=new FileResearchRepository(dir),ledger=new ResearchLedger(repository);
 const quotes=['挪威与瑞典企业讨论海洋低碳项目合作，尚需核对履约条件。','瑞典企业计划向挪威提供海洋装备，尚未确认实际交付。'];
 const data={generatedAt:'2026-10-16T00:00:00Z',sources:[],entities:[],relations:[],observations:[],documents:quotes.map((content,i)=>({id:'d'+i,sourceId:i?'source-b':'source-a',title:i?'装备计划':'低碳合作',content,publishedAt:i?'2026-10-14T16:00:00Z':'2026-10-14T15:59:59Z',industry:{status:'accepted',primary:i?'海洋装备':'海洋低碳'}})),events:quotes.map((_,i)=>({id:'e'+i,documentId:'d'+i,title:'项目讨论',countries:['NO','SE'],entityIds:[],evidenceIds:['q'+i]})),evidence:quotes.map((quote,i)=>({id:'q'+i,documentId:'d'+i,quote}))};
 attachPublishedRules(data,{id:1,config:{rules:[]}});
 const baseline=await ledger.publish(data,{baseline:true,expectedReleaseId:null});let release=await publishCountries(ledger,baseline.releaseId);const emptyRelease=release;
 const entries=(await ledger.snapshot(release.snapshotId)).entries;
 const ref=i=>({documentId:entries[i].documentId,bodyVersionId:entries[i].bodyVersionId,quote:quotes[i]});
 const draft=(countryCodes,i=0)=>({scope:{kind:'country',countryCodes},subject:countryCodes.join(','),snapshotId:release.snapshotId,configVersion:'test',content:{overview:i?'仅有装备供应计划。':'仅有低碳合作讨论依据。',items:[{id:'finding',kind:'finding',title:'有限的项目线索',analysis:'计划尚需进一步核对。',gaps:'缺少实际履约依据。',watch:'跟踪后续资料。',facts:[quotes[i]],references:[ref(i)]}],watch:'跟踪后续资料。',counterevidenceStatus:'not_found_in_scope',counterevidenceNote:'仅在引用的历史资料中未找到反证。'}});
 const drafts=[draft(['NO']),draft(['SE'],1),draft(['NO','SE'])];
 for(const product of drafts)release=await publishDossier(ledger,{...product,semanticReview:fixtureReview(product.content)},release.releaseId);
 const content={project:'挪威—瑞典证据案例',countries:['NO','SE'],overview:'合作讨论与装备供应计划仍需核对。',watch:'继续核对履约。',items:[{id:'role',kind:'role',countryCode:'NO',subject:'讨论方',role:'cross_border_party',title:'项目讨论方',analysis:'原文记录讨论方。',gaps:'未确认履约。',watch:'跟踪后续。',facts:[quotes[0]],references:[ref(0)]},{id:'relation',kind:'relation',countryA:'NO',countryB:'SE',subject:'协议双方',relationType:'supply',stage:'signed_conditional',title:'装备供应计划',analysis:'计划尚未确认实际交付。',gaps:'缺少实际交付记录。',watch:'核对后续。',facts:[quotes[1]],references:[ref(1)]}]};
 release=await publishCountryCase(ledger,{snapshotId:release.snapshotId,content,semanticReview:fixtureReview(content)},release.releaseId);
 return {dir,repository,ledger,data,release,emptyRelease,drafts,entries,quotes};
}
