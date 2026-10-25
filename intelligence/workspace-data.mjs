// Workspace lists do not need document bodies, OCR assets or processing
// checkpoints. Those remain available through the document/detail endpoints.
const documentFields=['id','title','titleZh','url','sourceId','topic','publishedAt','collectedAt','summaryZh','language','translationType','titleTranslation','originalPublisher','manual'];
const entityFields=['id','name','nameZh','type','aliases'];
const pick=(row,fields)=>Object.fromEntries(fields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
export function workspaceEvidence(evidence,documents){
 const ids=new Set(documents.map(d=>d.id));
 return evidence.filter(e=>ids.has(e.documentId));
}
export function workspaceCountries(events,dictionary){
 const codes=new Set(events.flatMap(e=>e.countries));
 return dictionary.filter(c=>codes.has(c.code));
}
export function workspaceData(snapshot,projection){
 if(!projection)return snapshot;
 if(!['summary','signals','relations','full'].includes(projection))throw new RangeError('Unknown workspace projection');
 const summary=projection==='summary'||projection==='signals',relations=projection==='relations';
 const proofIds=relations?new Set(snapshot.relations.flatMap(row=>row.evidenceIds||[])):null;
 const documents=projection==='summary'?[]:snapshot.documents.map(row=>({...pick(row,documentFields),...(row.industry?{industry:pick(row.industry,['primary','status','manual'])}:{})}));
 return {...snapshot,projection,
  scopeCounts:{documents:snapshot.documents.length,seriesRows:(snapshot.series||[]).reduce((count,series)=>count+series.rows.length,0)},
  documents,entities:snapshot.entities.map(row=>pick(row,entityFields)),
  events:summary||relations?[]:snapshot.events,
  relations:summary?[]:snapshot.relations,
  evidence:summary?[]:relations?snapshot.evidence.filter(row=>proofIds.has(row.id)):snapshot.evidence,
  observations:summary||relations?[]:snapshot.observations,
  series:summary||relations?[]:snapshot.series,
  reportCatalog:summary||relations?[]:snapshot.reportCatalog};
}
