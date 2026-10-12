// Use persisted decisions only. Never reclassify an article while rendering a list.
export function rejectionEvidence(article,stored){
 if(article.filterStatus!=='rejected')return null;
 const reason=String(article.rejectReason||'').trim();
 if(article.manualClassify||article.classifyMethod==='manual')return {method:'人工标注',reason:reason||'人工排除；未记录具体说明',keywords:[]};
 const explicit=[...reason.matchAll(/(标题|正文|摘要|组合条件)?命中排除词「([^」]+)」/g)].map(m=>({keyword:m[2],field:m[1]||'未记录位置'}));
 if(explicit.length)return {method:'关键词规则',reason,keywords:explicit};
 if(article.classifyMethod==='llm')return {method:'大模型分类',reason:reason||'大模型分类未匹配目标行业；历史记录未保存进一步说明',keywords:[]};
 if(stored?.status==='excluded'&&Array.isArray(stored.negative)&&stored.negative.length){return {method:'关键词规则',reason:reason||stored.reason||'命中反向排除规则',keywords:stored.negative.map(k=>({keyword:k.keyword,field:k.field||'未记录位置'})),version:stored.version};}
 return {method:article.classifyMethod==='keyword'?'关键词规则':'分类方式未记录',reason:reason||'该历史记录未保存具体排除依据，可通过重新分类补齐',keywords:[]};
}
