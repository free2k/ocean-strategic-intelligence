import {digest,fail} from './ledger.mjs';
const list=(value,name)=>{
 if(value==null||value==='')return [];
 const values=Array.isArray(value)?value:typeof value==='string'?value.split(','):null;
 if(!values||values.some(v=>typeof v!=='string'))fail('INVALID_SCOPE',name+' must be a string collection');
 return [...new Set(values.map(v=>v.trim()).filter(Boolean))].sort();
};
function instant(value,name){
 if(value==null||value==='')return null;
 if(typeof value!=='string')fail('INVALID_SCOPE',name+' must be an ISO date');
 const full=/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00+08:00':value;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(full)||!Number.isFinite(Date.parse(full)))fail('INVALID_SCOPE',name+' needs a valid date and explicit timezone');
 // Reject impossible calendar dates instead of letting Date.parse normalize February 30.
 const day=value.slice(0,10),[year,month,date]=day.split('-').map(Number);
 if(month<1||month>12||date<1||date>new Date(Date.UTC(year,month,0)).getUTCDate())fail('INVALID_SCOPE',name+' has an invalid calendar date');
 return new Date(full).toISOString();
}
export function normalizeScope(input={},validCountries){
 const countryCodes=list(input.countryCodes,'countryCodes').map(v=>v.toUpperCase());
 if(countryCodes.length&&!validCountries)fail('COUNTRY_DICTIONARY_REQUIRED','Validate countries against the shared map dictionary');
 for(const code of countryCodes)if(!validCountries.has(code))fail('INVALID_COUNTRY','Unknown country code: '+code);
 const relationMode=input.relationMode||'external';if(!['external','within'].includes(relationMode))fail('INVALID_SCOPE','Invalid relation mode');
 const countries=[...new Set(countryCodes)].sort();if(relationMode==='within'&&countries.length<2)fail('INVALID_SCOPE','Within mode requires at least two countries');
 const timeBasis=input.timeBasis||'published';if(!['published','occurred','discovered'].includes(timeBasis))fail('INVALID_SCOPE','Invalid time basis');
 const periodStart=instant(input.periodStart,'periodStart'),periodEndExclusive=instant(input.periodEndExclusive,'periodEndExclusive');
 if(periodStart&&periodEndExclusive&&periodStart>=periodEndExclusive)fail('INVALID_SCOPE','End must be after start');
 const business={countryCodes:countries,relationMode,topic:input.topic||null,sourceIds:list(input.sourceIds,'sourceIds'),periodStart,periodEndExclusive,timeBasis};
 if(business.topic!==null&&typeof business.topic!=='string')fail('INVALID_SCOPE','Invalid topic');
 return {...business,snapshotId:input.snapshotId||null,releaseId:input.releaseId||null,scopeHash:digest(business)};
}
export function generationKey(scope,inputVersionIds,configVersion){return digest({scopeHash:scope.scopeHash,inputVersionIds:[...new Set(inputVersionIds)].sort(),configVersion});}
export function scopeCacheKey(scope,{cursor=null,limit=null}={}){return digest({scopeHash:scope.scopeHash,snapshotId:scope.snapshotId,releaseId:scope.releaseId,cursor,limit});}
export function matchesCountryRelation(relation,scope){
 if(!relation.confirmed||!relation.countryA||!relation.countryB||relation.countryA===relation.countryB)return false;
 const selected=new Set(scope.countryCodes);if(!selected.size)return true;
 return scope.relationMode==='within'?selected.has(relation.countryA)&&selected.has(relation.countryB):selected.has(relation.countryA)||selected.has(relation.countryB);
}
