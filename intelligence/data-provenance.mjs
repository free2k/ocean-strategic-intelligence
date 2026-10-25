export const originNames={collected:'采集数据',imported:'导入数据',manual:'人工录入'};

export function dataOrigin(row,document,source){
 const ingestion=[row,document,source].find(r=>r?.ingestion?.method==='import')?.ingestion;
 if(ingestion)return {origin:'imported',originLabel:originNames.imported,ingestion};
 const manual=row?.manual||document?.manual||source?.method==='manual';
 return {origin:manual?'manual':'collected',originLabel:manual?originNames.manual:originNames.collected};
}

// Collection snapshots and local low-carbon projections may replace their own
// records. User imports remain in the current workspace, including their receipts.
export function preserveImportedData(next,previous={}){
 let result=next;
 for(const kind of ['sources','documents','events','entities','relations','observations','evidence','series']){
  const imported=(previous[kind]||[]).filter(r=>r.ingestion?.method==='import');if(!imported.length)continue;
  if(result===next)result={...next};
  const rows=new Map((next[kind]||[]).map(r=>[r.id,r]));
  for(const old of imported){
   const incoming=rows.get(old.id);
   if(!incoming)rows.set(old.id,old);
   else if(kind==='series')rows.set(old.id,{...incoming,rows:[...new Map([...(old.rows||[]),...(incoming.rows||[])].map(r=>[r.period,r])).values()]});
  }
  result[kind]=[...rows.values()];
 }
 if(previous.insightImportResults){if(result===next)result={...next};result.insightImportResults={...previous.insightImportResults,...next.insightImportResults};}
 return result;
}
