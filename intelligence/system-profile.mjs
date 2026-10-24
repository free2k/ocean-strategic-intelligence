// A process selects its profile at startup. Requests can never select a tenant.
const configured=typeof process!=='undefined'&&process.env?process.env.APP_ID:globalThis.document?.documentElement?.dataset?.system;
export const isLowCarbon=configured==='low-carbon';
export const appId=isLowCarbon?'low-carbon':'ocean';
export const scopeName=isLowCarbon?'能源行业绿色低碳':'海洋能源';
export const appName=isLowCarbon?'碳索智研':'海洋能源战略智能智库';
export const statePrefix=isLowCarbon?'lc-strategy-':'ocean-strategy-';
export const cookieName=isLowCarbon?'lc_site_auth':'site_auth';
const labels={
 '海洋能源战略智能智库':'碳索智研 · 低碳情报与决策支持平台',
 '海洋能源资源情报分析':'绿色低碳情报分析',
 '全球信息感知':'全球低碳信息感知','情报证据中心':'低碳情报证据中心',
 '行业动态监测':'低碳技术与项目监测','产业动态监测':'低碳技术与项目监测',
 '全球态势总览':'全球低碳发展态势','行业数据洞察':'低碳产业与能效洞察',
 '产业数据洞察':'低碳产业与能效洞察','产业关联图谱':'低碳创新协同图谱',
 '量化分析工作台':'低碳转型研究工作台','战略研究工作台':'低碳转型研究工作台',
 '智能选题推荐':'低碳研究选题','战略量化研究':'低碳方案量化评价',
 '战略研究方法库':'低碳决策方法库','研究成果管理':'低碳研究成果库',
 '循证研究问答':'低碳循证问答','与旧版共用同一份数据库规则':'本系统独立维护低碳分类规则',
 '正在读取共享规则':'正在读取低碳规则','公共语境词只检查海洋场景':'公共语境词用于低碳内容定位',
 '通用海洋语境关键词':'通用低碳语境关键词','从全球信息，<br>看见海洋能源的下一步':'从低碳信息，<br>走向有依据的转型决策',
 'OCEAN ENERGY INTELLIGENCE':'LOW CARBON INTELLIGENCE','中国海油 · 深海一号':'低碳创新 · 循证决策',
 '海洋油气 · 海上风电 · 多能协同':'技术发现 · 项目跟踪 · 方案评价',
 '每一次研究，皆有依据':'每一步低碳决策，皆有依据',
 'ocean-map-mode':'lc-map-mode','ocean-theme':'lc-theme','selected-period-report':'lc-selected-period-report',
 'object-browser-recent:':'lc-object-browser-recent:','ocean-navigation':'lc-navigation','layout-preview-theme':'lc-layout-theme',
 'industry-relationship-view':'lc-industry-relationship-view','last-intake-draft':'lc-last-intake-draft',
 '海洋能源 · 战略智能智库':'碳索智研 · 低碳情报与决策支持平台','从原始资讯到可追溯的海洋能源情报':'从原始资讯到可追溯的低碳情报',
 '使用原知识库访问密码，继续探索有据可循的全球海洋能源情报。':'使用低碳版访问密码，进入独立的低碳研究空间。',
 '海洋能源<small>战略智能智库':'碳索智研<small>低碳情报与决策',
 'OCEAN INTELLIGENCE':'LOW CARBON INTELLIGENCE','whale.png?v=1':'low-carbon-logo.svg','wave-energy.png':'low-carbon-logo.svg','shenhai-no1-hero.webp?v=5fdf2c7d':'low-carbon-hero.svg',
 '↗ 原版知识库':'↗ 低碳研究首页','href="/wechat/subscriptions"':'href="source-management.html"',
 '公众号与 X 使用独立的 30 分钟采集计划':'公众号、X、RSS 与官方来源使用低碳版独立采集计划',
 '规则纳入需要：未命中反向排除＋命中公共语境＋命中行业正向规则。':'规则纳入需要：未命中反向排除＋命中公共低碳语境＋命中领域专业词或同段组合条件。',
 '供六个行业共用，分别检查标题和清洗后正文前 1800 字符':'供六个低碳领域共用，分别检查标题和清洗后正文前 1800 字符',
 '规则检出海洋场景词':'规则检出低碳语境词','规则未检出海洋场景词':'规则未检出低碳语境词',
 '海洋语境':'低碳语境','海洋范围词':'低碳范围说明','检查海洋语境':'检查低碳语境',
 '共享规则已保存，旧版入口可见。':'低碳独立规则已保存。','保留现有功能':'进入工作空间',
 'STRATEGIC RESEARCH WORKBENCH':'LOW CARBON RESEARCH WORKBENCH',
 '海洋能源证据简报.txt':'低碳情报证据简报.txt'
};
export function brandText(text){if(!isLowCarbon)return text;for(const [from,to] of Object.entries(labels))text=text.replaceAll(from,to);return text;}
