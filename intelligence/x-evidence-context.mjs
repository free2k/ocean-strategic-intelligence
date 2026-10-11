export function xEvidenceContext(doc){
 const provenance=(doc.provenance||[]).map(o=>({provider:o.provider,feedUrl:o.feedUrl,articleUrl:o.articleUrl,feedPublishedAt:o.feedPublishedAt,postUrl:o.postUrl,postPublishedAt:o.postPublishedAt,author:o.author,subscription:o.subscriptionName}));
 const tables=(doc.sourceTables||[]).map(t=>({title:t.title,sourceUrl:t.sourceUrl,rows:t.rows?.slice(0,20),note:'原始单元格，单位、统计期和统计范围需要核对；不得自动拼接时间序列'}));
 const images=(doc.evidenceAssets||[]).filter(a=>a.status==='model_candidate'&&['chart','table','illustration'].includes(a.kind)).map(a=>({url:a.url,title:a.title,kind:a.kind,sourceLabel:a.sourceLabel,axes:a.axes,legends:a.legends,visibleText:String(a.visibleText||'').slice(0,1800),summaryZh:a.summaryZh,note:'AI图像识别候选，可能误读；只作为线索，不作为已核准数值。示意图不是历史数据。'}));
 return provenance.length||tables.length||images.length?'\n附属证据与来源链：'+JSON.stringify({provenance,tables,images}):'';
}
