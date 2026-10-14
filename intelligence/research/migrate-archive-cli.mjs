// Explicit derived-schema migration; never updates source articles or ocean_intel records.
import fs from 'node:fs/promises';import path from 'node:path';import pg from 'pg';
import {FileResearchRepository,PostgresResearchRepository} from './repositories.mjs';import {ResearchLedger} from './ledger.mjs';import {readCountries} from './countries.mjs';
const a=process.argv.slice(2),arg=k=>a[a.indexOf(k)+1];if(!a.includes('--archive')||!a.includes('--publish-derived'))throw Error('Requires archive and explicit derived publication');
const source=new FileResearchRepository(path.resolve(arg('--archive'))),local=new ResearchLedger(source),head=await source.head();await local.resolve({});const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{for(const name of ['001-ledger.sql','002-products-runtime.sql','003-object-registry.sql'])await pool.query(await fs.readFile(new URL('./migrations/'+name,import.meta.url),'utf8'));
 const target=new PostgresResearchRepository(pool),before=await target.head();if(before?.releaseId===head.releaseId){console.log('Already published');process.exitCode=0;}else{
 if(before&&!a.includes('--expected-release'))throw Error('Existing release requires explicit expected head');if(before&&before.releaseId!==arg('--expected-release'))throw Error('HEAD_CHANGED');
 const records={};for(const name of await fs.readdir(source.dir))if(/^(snapshot|batch|release|product|registry)_[a-f0-9]{64}\.json$/.test(name)){const id=name.slice(0,-5);records[id]=await source.read(id);}
 // Updates must descend from the already-published head; never replace unrelated history.
 if(before&&!await source.isPublished(before.releaseId))throw Error('HISTORY_DIVERGED');
 await target.commit({expectedReleaseId:before?.releaseId||null,head,records});const verified=await readCountries(new ResearchLedger(target),{countryCodes:'NO,SE',relationMode:'within'});
 console.log(JSON.stringify({published:true,records:Object.keys(records).length,releaseId:head.releaseId,cases:verified.data.caseStudies.length,roles:verified.data.roles.length,relations:verified.data.confirmedRelations.length,countryCoverage:verified.data.countryCoverage,sourceWrites:0}));}
}finally{await pool.end();}
