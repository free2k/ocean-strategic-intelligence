import {isLowCarbon} from './system-profile.mjs';
import {lowCarbonTopics} from './low-carbon/taxonomy.mjs';
// Stable storage keys, display names and historical aliases share one definition.
const marineTopics=[
 {id:'海洋油气',name:'海洋油气',aliases:['海洋油气']},
 {id:'海上风电',name:'海洋新能源',aliases:['海上风电','海洋新能源','海洋新能源（含海上风电）']},
 {id:'海洋低碳',name:'海洋低碳',aliases:['海洋低碳','海洋低碳领域']},
 {id:'多能融合',name:'多能融合',aliases:['多能融合','海洋多能融合']},
 {id:'宏观政策',name:'宏观政策',aliases:['宏观政策','海洋能源资源宏观政策']},
 {id:'海洋装备',name:'海洋装备',aliases:['海洋装备','海洋油气装备']},
];
export const standardTopics=isLowCarbon?lowCarbonTopics:marineTopics;
export const taxonomyVersion=isLowCarbon?'low-carbon-six-v1.1.0':'marine-six-v1';
const definitions={
 '海洋油气':{definition:'海上及海底油气资源勘探、开发、生产、集输、运营和安全环保。',boundary:'以油气项目、资源或运营为主；以装备研发制造为主的归海洋装备。陆上油气及泛能源地缘政治不因提及油价而纳入。'},
 '海上风电':{definition:'海上风电、海上光伏、波浪能、潮汐能、潮流能、海洋温差能、盐差能及以海洋可再生能源或海水为核心的制氢项目与技术。',boundary:'必须明确海上或海洋能源场景；一般陆上风光、生物质、航空燃料不纳入。跨能源协同系统归多能融合，通用装备制造归海洋装备。'},
 '海洋低碳':{definition:'海洋碳汇与蓝碳、海底二氧化碳封存、海洋能源生产减排、船用清洁燃料和港口岸电等海洋及航运脱碳技术、项目与机制。',boundary:'需有直接海洋、海底、船用或港口能源减排关联；一般碳市场、陆上碳捕集、航空生物燃料不自动纳入。'},
 '多能融合':{definition:'海上能源岛、海岛微电网、海上风光储氢协同、风渔融合等包含海洋能源的跨能源或跨产业集成系统。',boundary:'须说明实际协同关系；仅并列提到多种能源不算融合，单一海上可再生能源项目归海洋新能源。'},
 '宏观政策':{definition:'政府及国际机构发布的直接涉及海洋能源开发利用、产业规划、许可监管、市场机制、标准和跨国治理的政策。',boundary:'必须存在明确海洋能源适用范围；泛经济政策、一般能源政策及企业新闻不因出现机构名称而纳入。'},
 '海洋装备':{definition:'直接服务海洋能源开发与运营的装备研发、制造、国产化、交付及运维，包括海洋油气平台、水下生产系统、海上新能源施工运维船、海缆及专用基础装备。',boundary:'范围覆盖海洋油气及海洋新能源专用装备；普通商船、海军装备、无能源用途的海洋仪器不自动纳入。能源项目整体进展按其能源领域归类。'},
};
for(const topic of standardTopics)Object.assign(topic,definitions[topic.id]);
export const topicDefinition=value=>standardTopics.find(t=>t.id===canonicalTopic(value));
export const domainPrompt=()=>standardTopics.map(t=>`${t.name}（返回标识 ${t.id}）：${t.definition} 边界：${t.boundary}`).join('\n');
// Shared rule policy: the gate is deliberately lexical; ambiguous records go to semantic review.
export const marineContextPattern='海洋|海上|海底|深海|深水|近海|海工|海域|蓝碳|船用|岸电|offshore|subsea|deepwater|deep.water|ocean|marine|blue carbon|Northern Lights|FPSO|FSRU|seabed';
export const supplementalRules=[
 {topic:'海洋低碳',groups:[['Northern Lights','offshore','subsea','seabed','海底','海洋'],['carbon storage','CO₂','CO2','CCS','carbon capture','封存']]},
 {topic:'多能融合',groups:[['海上能源岛','海上综合能源','offshore energy island','wind-fishery integration']]},
 {topic:'海洋油气',groups:[['offshore','deepwater','海上','海底','深水'],['oil','gas','原油','天然气','油气']]},
 {topic:'海上风电',groups:[['ocean thermal energy','wave energy','tidal energy','offshore wind','波浪能','潮汐能','温差能','海上光伏','盐差能']]},
];
export const canonicalTopic=value=>standardTopics.find(t=>t.aliases.includes(value))?.id||value;
export const topicLabel=value=>standardTopics.find(t=>t.id===canonicalTopic(value))?.name||value;
export const topicAliases=value=>standardTopics.find(t=>t.id===canonicalTopic(value))?.aliases||[value];
// Each database article has one matched_topic; grouped counts are disjoint.
export function topicCounts(rows){return standardTopics.map(t=>({id:t.id,name:t.name,articleCount:rows.filter(r=>t.aliases.includes(r.topic)).reduce((sum,r)=>sum+Number(r.count),0)}));}
