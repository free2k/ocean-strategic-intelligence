import {rejectionEvidence} from './rejection-evidence.mjs';
// Display persisted evidence only; rendering never runs rules or a model.
export function classificationEvidence(article,...decisions){
 const expected={accepted:'accepted',rejected:'excluded',pending:'unmatched'}[article.filterStatus];
 const stored=decisions.find(d=>d?.status===expected&&(!d.primary||!article.matchedTopic||d.primary===article.matchedTopic));
 if(article.filterStatus==='rejected')return rejectionEvidence(article,stored);
 if(article.manualClassify||article.classifyMethod==='manual')return {method:'人工标注',reason:'保留人工分类；未记录具体说明',keywords:[]};
 if(stored?.semantic?.status==='completed')return {method:'大模型语义复核',reason:stored.semantic.reason||stored.reason,keywords:[],quote:stored.semantic.quote,model:stored.semantic.model,version:stored.version};
 if(article.classifyMethod==='llm')return {method:'大模型分类',reason:'AI 语义判断；历史记录未保存具体判断说明',keywords:[]};
 if(stored)return {method:'关键词规则',reason:stored.reason||'历史分类依据未保存',keywords:(stored.positive||[]).flatMap(p=>(p.keywords||[]).map(k=>({...k,origin:p.origin,topic:p.topic}))),version:stored.version};
 let hits=[];try{const value=typeof article.matchedKeywordsJson==='string'?JSON.parse(article.matchedKeywordsJson):article.matchedKeywordsJson;if(Array.isArray(value))hits=value.filter(k=>k?.keyword).map(k=>({keyword:k.keyword,field:({title:'标题',content:'正文',digest:'摘要',group:'组合条件'})[k.source]||'未记录位置'}));}catch{}
 return {method:article.classifyMethod==='keyword'?'关键词规则':'分类方式未记录',reason:hits.length?'正向规则匹配':'历史分类依据未保存',keywords:hits};
}
