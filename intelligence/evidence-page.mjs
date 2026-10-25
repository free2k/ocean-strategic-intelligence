import {SensingPageCache} from './sensing-page.mjs';
import {auditInventory} from './classification-audit.mjs';
export function createEvidencePageCache({auditData,beforeRead=async()=>{},...options}){
 return new SensingPageCache({...options,filename:'evidence-page.json',validate:p=>Array.isArray(p?.inventory?.documents),load:async()=>{await beforeRead();return {inventory:auditInventory(await auditData())};}});
}
