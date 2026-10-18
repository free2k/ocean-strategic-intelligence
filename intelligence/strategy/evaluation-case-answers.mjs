import {digest} from './repository.mjs';
export function evaluationAnswers(c){
 const refs=c.sources.map(s=>({id:s.documentId,number:s.number,title:s.title,titleZh:s.title,url:s.url,publishedAt:s.publishedAt,sourceId:s.sourceId,summaryZh:'仅支持公开路线、协议和船队背景，不支持研究情景矩阵中的具体数值。',evidence:[]}));
 for(const t of c.tasks)refs.push({id:t.versionId,number:refs.length+1,kind:'strategy-study',title:t.label,titleZh:t.label,url:'http://49.233.77.111/ocean-intelligence/api/strategy/studies/'+t.versionId+'/export?format=json',publishedAt:t.record.createdAt,sourceId:'strategy-case',summaryZh:'逐格标记情景性质的冻结矩阵、参数、约束与真实计算结果。',evidence:[]});
 const ref=n=>`[${'⁰¹²³⁴⁵⁶⁷⁸⁹'[n]}](${refs[n-1].url})`,task=k=>c.tasks.find(t=>t.key===k),rank=k=>task(k).record.calculation.result.ranking.map(r=>r.label+'（'+r.score.toFixed(4)+'）').join(' → ');
 const questions=['海洋低碳综合评价中，哪些是库内事实，哪些是预填情景？','熵权 TOPSIS 的排序和权重说明什么，能否据此判断真实项目优劣？','追加投入加快准备与等权交叉评价如何帮助检验排序？'];
 const answers=[
 `### 事实与研究设定分开\n\n公开协议给出每年最多20万吨 CO₂ 的服务上限、2029年第四季度的目标启动窗口，并披露共享物流及跨境接入链条；上限不是实际年封存量。${ref(1)} 船队资料提供新船设计舱容和未来交付窗口，不能用舱容直接代替年运输能力。${ref(2)}\n\n### 预填矩阵的性质\n\n共享运力、专用运力和分阶段租赁是本研究的设计方案。成本、接口投入、准备期、保障能力和运输排放强度均为逐格标记的研究情景值；官方背景链接不是这些数值的企业原表。${ref(4)}\n\n### 约束与局限\n\n场景只核对设计能力与研究就绪窗口的数值阈值；实际许可、安全和剩余运力仍待核验。本研究兼顾未来扩容与服务冗余，因此在满足参考需求后保留保障能力越大越优；这是研究偏好，不自动代表额外收入或利用率。不据此作真实工程实施承诺或净减排结论。${ref(4)}`,
 `### 本矩阵下的条件性排序\n\n${rank('entropy-base')}。${ref(4)}\n\n### 权重依据\n\n熵权由当前情景矩阵的标准化差异计算；其数值是本矩阵的结果，不代表政策偏好、专家共识或指标的因果重要性。权重及标准化矩阵可在冻结结果中逐项核对。${ref(4)}\n\n### 稳健性\n\n单项权重扰动与九点扫描检验偏好变化下的排序；不是概率预测、置信区间或统计显著性。结论仅适用于本次候选方案、研究设定及边界，不是现实企业或项目排名。${ref(4)}`,
 `### 工程情景更新\n\n追加投入加快准备的版本排序为：${rank('entropy-schedule')}。${ref(5)} 专用方案的准备期与投入同时按设定修改，其他单元格不变；输入差异和父版本关系已保存。本版归一化与熵权也随矩阵重算，其他方案得分可能改变；不能把排序变化单独归因于工期。这不是已发生的项目工程变更。${ref(5)}\n\n### 方法交叉检查\n\n等权 WSM 的排序为：${rank('equal-check')}。${ref(6)} 它使用相同基准矩阵，但改变赋权与评分设定，因此建立独立研究；不能将分数尺度直接当作同一指标相减。${ref(4)}${ref(6)}\n\n### 下一步\n\n应以同口径工程报价、运力和进度、运输排放数据替换相应情景值，重新核定硬约束后另存版本。公开协议与扩建计划提供背景，不能自动补齐这些缺口。${ref(1)}${ref(3)}`
 ];
 return questions.map((question,i)=>({id:'research_case_'+digest({caseId:c.id,revision:c.revision,question,versions:c.tasks.map(t=>t.versionId)}).slice(0,32),caseId:c.id,question,answer:answers[i],references:refs,mode:'案例研究整理（公开证据与已保存计算；非AI生成）',generated:false,citationCheck:true,status:'案例整理，待专业审阅',createdAt:new Date().toISOString(),filters:{topic:c.topic,country:'NO,SE',from:'2026-01-01',to:c.asOf},model:null}));
}
