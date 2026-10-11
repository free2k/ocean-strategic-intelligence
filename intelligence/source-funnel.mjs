const states=new WeakMap();
export async function sourceFunnels(pool){
 if(!pool)return {};
 let state=states.get(pool);if(!state){state={cached:null,expires:0,pending:null};states.set(pool,state);}
 if(state.cached&&Date.now()<state.expires)return state.cached;
 if(state.pending)return state.pending;
 state.pending=(async()=>{try{const {rows}=await pool.query(`WITH docs AS MATERIALIZED (SELECT DISTINCT ON (payload->>'url') id,jsonb_build_object('providerHash',payload->>'providerHash','autoExtraction',payload->'autoExtraction') payload,payload->>'url' url FROM ocean_intel.documents ORDER BY payload->>'url',updated_at DESC) SELECT 'mp2rss_'||s.id id,
 count(i.id)::int collected,
 count(*) FILTER(WHERE i.classification->>'status'='accepted' AND d.id IS NOT NULL AND d.payload->>'providerHash'=i.content_hash AND i.payload->>'contentStatus'='complete')::int included,
 count(*) FILTER(WHERE i.classification->>'status'='unmatched')::int candidate,
 count(*) FILTER(WHERE i.classification->>'status'='excluded')::int excluded,
 count(*) FILTER(WHERE i.id IS NOT NULL AND (COALESCE(i.classification->>'status','') NOT IN ('accepted','unmatched','excluded') OR (i.classification->>'status'='accepted' AND (d.id IS NULL OR d.payload->>'providerHash' IS DISTINCT FROM i.content_hash OR i.payload->>'contentStatus' IS DISTINCT FROM 'complete'))))::int pending,
 count(*) FILTER(WHERE i.classification->>'status'='accepted' AND d.payload->>'providerHash'=i.content_hash AND d.payload->'autoExtraction'->>'status' IS DISTINCT FROM 'completed')::int "analysisPending"
 FROM mp2rss.subscriptions s LEFT JOIN mp2rss.items i ON i.subscription_id=s.id LEFT JOIN docs d ON d.url=i.payload->>'url' GROUP BY s.id`);
 state.cached=Object.fromEntries(rows.map(r=>[r.id,r]));state.expires=Date.now()+60000;return state.cached;
 }catch{return state.cached||{};}})();
 try{return await state.pending;}finally{state.pending=null;}
}
