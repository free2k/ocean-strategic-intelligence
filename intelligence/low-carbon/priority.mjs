// Classify each record once. Sorting must never repeat full keyword scans for
// every comparison; yield between batches so rule editing stays responsive.
export async function prioritizeLowCarbonRecords(records,classify,{yieldEvery=20}={}){
 const decisions=new Map();let seen=0;
 for(const record of records){decisions.set(record,classify(record));if(++seen%yieldEvery===0)await new Promise(resolve=>setImmediate(resolve));}
 const ordered=[...records].sort((a,b)=>Number(decisions.get(b).status==='accepted')-Number(decisions.get(a).status==='accepted'));
 return {ordered,decisions};
}
