import {evaluationAnswers} from './evaluation-case-answers.mjs';
import {digest} from './repository.mjs';

export function caseAnswers(c) {
  if(c.kind==='evaluation')return evaluationAnswers(c);
  const task = key => c.tasks.find(t => t.key === key);
  const source = n => c.sources.find(s => s.number === n);
  const refs = c.sources.map(s => ({id:s.documentId,number:s.number,title:s.title,titleZh:s.title,url:s.url,publishedAt:s.publishedAt,sourceId:s.sourceId||'',summaryZh:'案例所用库内官方原文，保留事实和计划性质。',evidence:[]}));
  for(const key of ['npv-base','npv-rate','npv-delay']){
    const t=task(key);refs.push({id:t.versionId,number:refs.length+1,kind:'strategy-study',publishedAt:t.record.createdAt,title:t.label,titleZh:t.label,url:'http://49.233.77.111/ocean-intelligence/api/strategy/studies/'+t.versionId+'/export?format=json',sourceId:'strategy-case',summaryZh:'真实保存的冻结输入与确定性计算结果；财务参数为研究设定。',evidence:[]});
  }
  const mark = n => `[${'⁰¹²³⁴⁵⁶⁷⁸⁹'[n]}](${refs[n-1].url})`;
  const fmt = key => (task(key).record.calculation.result.npv/10000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const questions = [
    '海上CCUS源汇匹配与投资时序：本案例的研究问题、已知事实与边界是什么？',
    '本案例的投资基准、资金成本压力与收入延后版本得到什么结果，应该如何解释？',
    '这个案例怎样从研究问题走到证据核定、方法参数、成果管理；完整源汇优化还缺什么？'
  ];
  const answers = [
    `### 判断\n\n本案例研究公开协议所披露的跨境接入链条，并用明确的研究设定检验附属接收环节的条件性现金流，不声称已完成源汇最优匹配。\n\n### 已知事实与证据\n\n瑞典 Öresundskraft 协议服务上限为每年20万吨 CO₂，目标启动窗口为2029年第四季度，仍附约定条件；这些是协议上限和未来目标，不是实际封存实绩。${mark(1)}\n\n计划路线为 Filbornaverket—Halmstad 港—Øygarden 接收站—海底封存系统。${mark(1)} 一期年运输封存能力与二期扩建目标分别记录，不据能力推定实际利用量或剩余可接入能力。${mark(2)} Veas 是已披露首次注入的运行试点，与瑞典未来路线分列。${mark(3)}\n\n### 研究边界\n\n净现值只对应自设的附属环节投入和现金流，不代表 Northern Lights、Öresundskraft 的真实投资、报价或利润，也不等于生命周期净减排。${mark(4)}`,
    `### 条件性计算结果\n\n基准版本净现值为 ${fmt('npv-base')} 万欧元。${mark(4)} 保持现金流不变、提高自设折现率的版本为 ${fmt('npv-rate')} 万欧元。${mark(5)} 保持起点支出、把同样的收入晚两期实现的版本为 ${fmt('npv-delay')} 万欧元。${mark(6)}\n\n### 如何解释\n\n这些差异反映资金成本与收入时序对现值的影响；不是项目收益预测或投资建议。各版本使用共同观察窗，现金流单位和期间均可在冻结输入中核对。全部财务参数属于研究设定，未取得真实项目工程报价或财务清单。${mark(4)}${mark(5)}${mark(6)}\n\n### 复核入口\n\n可在研究成果管理查看父子版本、参数差异、输入快照与导出文件；原输入重现须使用原存档算法。${mark(4)}`,
    `### 可展示的完整研究过程\n\n研究问题与边界已经落实到具体附属接收环节；指标与证据核定同时展示协议事实、计划性质、独立研究设定以及实际用于计算的现金流。${mark(1)}${mark(4)}\n\n方法匹配分别采用证据关系度、确定性单因素情景和 NPV；金融情景的输入、人工方法选择记录、结果及版本差异均已保存。${mark(4)}${mark(5)}${mark(6)}\n\n### 完整源汇优化的缺口\n\n尚缺分环节成本、源汇许可与实际剩余能力、船舶和港口逐期可用运力、完整生命周期排放清单。现有公开协议和扩建进展不能单独补齐这些输入。${mark(1)}${mark(2)}\n\n因此，本案例保留完整 GIS/MILP、TEA/LCA 待接入状态；已经完成的局部计算不升级为最优路线、最优投资年份或净减排结论。${mark(4)}`
  ];
  return questions.map((question,i)=>({id:'research_case_'+digest({caseId:c.id,revision:c.revision||'v1',question,versions:c.tasks.map(t=>t.versionId)}).slice(0,32),caseId:c.id,question,answer:answers[i],references:refs,mode:'案例研究整理（公开证据与已保存计算；非AI生成）',generated:false,citationCheck:true,status:'案例整理，待专业审阅',createdAt:new Date().toISOString(),filters:{topic:c.topic,country:'NO,SE',from:'2026-01-01',to:c.asOf},model:null}));
}

export async function publishCaseAnswers(c, store) {
  if(c.evidenceStatus!=='matched')throw Error('案例来源已变化，不能发布新的问答整理');
  const proposed=caseAnswers(c),existing=store.researchByIds?await store.researchByIds(proposed.map(r=>r.id)):await store.researches(),saved=[];
  for(const record of proposed){
    const old=existing.find(r=>r.id===record.id);
    if(old){if(old.answer!==record.answer)throw Error('同编号答复内容变化，须另建案例修订');saved.push(old);}
    else{await store.saveResearch(record);saved.push(record);}
  }
  return saved;
}
