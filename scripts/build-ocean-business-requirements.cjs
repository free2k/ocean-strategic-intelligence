const fs=require('fs'),path=require('path');
const {Document,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,HeadingLevel,Packer,ExternalHyperlink,Footer,AlignmentType,PageNumber}=require('docx');
const {chromium}=require('playwright-core');
const out=path.resolve('docs/ocean-energy-strategic-thinktank');
const prior=JSON.parse(fs.readFileSync(path.join(out,'archive-v1/requirements-content.json'),'utf8'));
const base='海洋能源战略智能智库需求文档';
const refs={...prior.refs};
const articles=[
['A01','Equinor','The world’s largest floating offshore wind farm officially opened','2023-08-23','https://www.equinor.com/news/20230823-hywind-tampen-officially-opened','项目规模、水深、供电关系；仅作当时披露值，不代替现状'],
['A02','Equinor','Hywind Tampen 项目页','未标明发布日期；核查于 2026-10-07','https://www.equinor.com/energy/hywind-tampen','当前页面的容量及机组升级说明；升级日期仍需独立证据'],
['A03','Equinor','First power from Hywind Tampen','2022-11-14','https://www.equinor.com/news/20221114-first-power-from-hywind-tampen','正文明确首次发电发生于 11 月 13 日，晚于事件一天发布'],
['A04','Shell Australia','First LNG cargo shipped from Prelude FLNG','2019-06-11','https://www.shell.com.au/about-us/media/2019-media-releases/first-lng-cargo-shipped-from-prelude-flng.html','FLNG 设计产能及首船里程碑'],
['A05','Shell','Whale: setting new standards for deep water','2025-01-09','https://www.shell.com/news-and-insights/our-stories/whale-setting-new-standards-for-deep-water.html','预计峰值油气产量与水深；不是月度实际产量'],
['A06','Equinor','Hywind Scotland remains the UK’s best performing offshore wind farm','2021-03-23','https://www.equinor.com/news/archive/20210323-hywind-scotland-uk-best-performing-offshore-wind-farm','容量因子、统计区间及定义'],
['A07','Transocean 投资者关系官网','Transocean Ltd. Reports Fourth Quarter and Full Year 2025 Results','2026-02-19（原站 EST）','https://investor.deepwater.com/news-releases/news-release-details/transocean-ltd-reports-fourth-quarter-and-full-year-2025-results','平台利用率、合同日租金、经营统计；公司样本不是全市场'],
['A08','Equinor','Investerer 7,5 milliarder kroner i utvidelsen av det banebrytende CCS-prosjektet Northern Lights','2025-03-27','https://www.equinor.com/no/nyheter/20250327-northern-lights-fase-2','二期投资、扩建能力及预期进度；公告检索内容已核对'],
['A09','Northern Lights 官方网站','Green light for CO₂ injection and storage','2025-05-06','https://norlights.com/news/green-light-for-co2-injection-and-storage/','注入与封存许可里程碑'],
['A10','Northern Lights 官方网站','Northern Lights JV has successfully stored first CO₂','2025-08-25','https://norlights.com/news/northern-lights-jv-has-successfully-stored-first-co%E2%82%82/','已开始封存的状态证据；公告未给首批精确吨数'],
['A11','Northern Lights 官方网站','Northern Lights has issued first CO₂ storage certificates','2025-12-08','https://norlights.com/news/northern-lights-has-issued-first-co%E2%82%82-storage-certificates/','按船货记录实存量的凭证机制；公开新闻不等于取得证书数据'],
['A12','美国能源信息署 EIA','Federal Offshore—Gulf of America Field Production of Crude Oil','数据发布：2026-09-30；统计期：月度','https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=M&n=PET&s=MCRFP3FM2','官方海上原油产量月序列及下载；单位千桶/日']
].map(([id,publisher,title,date,url,note])=>({id,publisher,title,date,url,note}));
articles.forEach(a=>refs[a.id]=[a.title,a.url]);
const blocks=[];
const H=(text,level=1)=>blocks.push({type:'h',text,level});
const P=text=>blocks.push({type:'p',text});
const B=text=>blocks.push({type:'b',text});
const T=(heads,rows,kind)=>blocks.push({type:'t',heads,rows,kind});
const V=(kind,text,data)=>blocks.push({type:'visual',kind,text,data});
H('海洋能源战略智能智库',0);
P('业务需求与成果说明 · V2.0 · 2026 年 10 月 7 日');
P('面向业务负责人、研究人员与产品评审。以“海洋能源”为主线，将现有资讯采集与知识库问答，逐步升级为有来源、有关系、有变化、有量化依据的战略研究平台。');
V('flow','建设主线',['可信采集','事实与关系整理','混合检索','地图与趋势','有据研判']);
P('本版重点回答：指标从哪里来；地图和时间线如何由资料形成；相对原版提升了什么；各阶段应交付什么业务成果。省略接口调试、详细数据库字段、部署参数和交付周期。');
P('阅读提示：本文是待建设需求，不表示所述能力均已上线。真实案例用于证明数据可获取、说明处理规则，尚未导入生产知识库。文中建议和系统推导均与原始披露区分。');

H('1 建设目标与原版对比');
P('原版“海洋能源资源情报分析”已形成公众号/RSS 采集、资讯分类清洗、正文向量化、知识库检索问答、数据上传和定期推送的基础。升级应保留这些入口，把用户工作从“找到文章”推进到“识别发生了什么、涉及谁、发生在哪里、相较过去如何变化，以及依据是什么”。');
P('对比依据：用户提供的原版截图与功能描述，以及此前对 39.96.24.170 预览页面的只读观察。本次访问 49.233.77.111 显示访问密码页，未进入后台复核，因此下表不宣称原版绝对缺少某项未展示能力；升级项是本次拟明确建设与验收的目标。');
T(['业务环节','原版已展示的基础','升级后明确要求的成果'],[
['信息采集','公众号、RSS、正文下载及来源管理','来源按渠道、权威性、可用性管理；中外文汇集且能识别重复转载'],
['资讯整理','分类、筛选、文章列表','在五大主题下建立项目档案、事件档案与持续更新记录'],
['知识检索','基于文章片段的向量检索问答','同时检索原文、名称、日期、关系和指标，精确回答“谁与谁、何时、多少”'],
['证据追溯','文章链接与回答参考来源','观点逐项对应原文段落或数据表，保留平台、账号、日期和历史版本'],
['地图与关联','原版截图以分类统计为主','地图表达实际项目与事件位置；连线表达可核验的供电、供货、投资等关系'],
['时间变化','按文章时间筛选','区分新闻发布时间与事件发生时间，持续记录状态、计划和数值修订'],
['量化分析','数据源、数据上传与分析入口','基于统一口径的指标形成时间序列、区域对比及可追溯计算结果'],
['研究成果','检索回答、行业总结与定期推送','形成“结论—事实—数据—反证/不足—来源”的专题报告及变化订阅']]);
H('1.1 三个阶段的业务提升',2);
T(['阶段','处理范围与提升','可评审成果及进入下一阶段的条件'],[
['第一阶段：可信信息底座','扩大海洋能源有效覆盖；外文中文化；建立原文、发布者、日期与采集记录','可用来源清单、可追溯资料库、双语阅读、采集缺口清单。条件：抽查资料能回到原文，来源不可用时有明确提示'],
['第二阶段：结构化知识与变化发现','把文章拆为事件、实体、关系、指标；合并重复事实；形成混合检索','实体档案、关系证据卡、事件时间线、指标台账。条件：关键关系和数值经核验，版本冲突能解释'],
['第三阶段：战略研究与成果服务','联动地图、图谱、趋势与智能体；面向专题形成研究和订阅','战略驾驶舱、专题研判、可预览简报、证据附件、订阅提醒。条件：每个结论和图表可回溯，缺数据时不补造']]);
P('阶段以成果成熟度划分，不设置交付周期。某一主题完成证据闭环后即可先行启用，不要求全部国家、全部指标同时齐备。');

H('2 主题范围与用户需求');
T(['一级主题','优先覆盖内容','纳入边界'],[
['海洋能源资源宏观政策','海洋能源规划、海域使用、市场准入、海上能源标准、跨国规则','能明确影响海洋能源项目；一般能源新闻只作背景'],
['海洋油气','海上勘探开发、深水油气、FPSO/FLNG、海工装备、生产安全','陆地油气、普通零售油价、无海洋关联的 LNG 贸易排除或归背景'],
['海洋新能源','固定/漂浮式海上风电、海上光伏、波浪/潮汐/温差能、海上制氢','区分概念、示范与商业运行；不把陆上风电混入海上统计'],
['海洋多能融合','风电向油气平台供电、海上综合能源、海水淡化、海上微网','至少明确两类能源或能源与海洋产业之间的耦合关系'],
['海洋低碳','海底封存、海上甲烷管理、蓝碳、船舶清洁燃料与岸电','保留系统边界；减排预测、实际减排和经核证碳量分别记录']]);
P('跨主题标签包含国家/海域、项目阶段、企业、技术、政策、设备、时间和证据状态。“海工装备”作为油气、新能源和融合领域的共用标签，避免同一项目跨栏目重复计数。');
T(['使用者','需要解决的问题','系统给出的成果'],[
['战略研究人员','近几个月某一主题发生了哪些重要变化，判断依据是什么','专题结论、支撑与相反证据、变化时间线、资料覆盖说明'],
['业务与管理人员','哪些国家、企业、项目值得关注，合作链条如何','项目地图、实体档案、合作图谱与重点变化清单'],
['情报编辑与审核人员','一篇文章应如何分类，是否重复，提取是否准确','待核验队列、中外文对照、原文定位、合并和更正记录'],
['数据分析人员','某地区产量、装机或项目进度是否真的改变','口径一致的数据表、趋势图、指标出处、修订说明']]);

H('3 推荐指标的依据与真实来源');
P('上一版的“推荐指标”是面向海洋能源研究的候选指标框架，不是已从现有文章库自动汇总出的指标，也不是一套法定统一标准。其依据有三层：用户的研究问题、项目生命周期中的可观测事实、官方或企业披露中可核对的数据。');
P('本版将指标分为“已有真实来源案例”“基于已核验资料计算”“获得专项数据后启用”三类。找到一个案例，只证明该指标有现实来源，不代表全球覆盖、连续更新或全部商业使用权已经具备。来源编号可点击；附录 B 给出标题、发布者、日期与原始地址。');
H('3.1 有真实来源支撑的指标',2);
T(['指标与用途','真实披露案例','采集后应保留的口径'],[
['项目装机容量：比较海上风电规模','Hywind Tampen：2023-08-23 公告披露 88 MW；当前项目页披露 94.6 MW，并说明机组由 8 升至 8.6 MW。[A01][A02]','分别保存历史与当前页面值；项目页未给明确更新日期，不推测升级发生日'],
['FLNG 设计产能：比较海上液化能力','Shell 2019-06-11 的 Prelude 首船公告披露 LNG 产能 3.6 Mtpa。[A04]','Mtpa 为百万吨/年；是能力，不是某年实际产量；不同产品分开'],
['预计峰值产量：观察油气项目规模','Whale 2025-01-09 项目介绍披露预计峰值 100,000 桶油当量/日。[A05]','预计峰值、油当量、全项目口径；不得当作实际原油日产量'],
['水深与机组规格：识别工程条件','Hywind Tampen 官方材料给出水深 260—300 米；当前项目页列单机升级至 8.6 MW。[A01][A02]','区间保留；水深不是钻井深度；单机容量不是项目总容量'],
['运行表现：容量因子','Equinor 2021-03-23 公告披露 Hywind Scotland 在截至 2020 年 3 月的十二个月容量因子为 57.1%。[A06]','容量因子=期间实际发电量/期间理论最大可发电量；不是设备可用率，也不是装机增速'],
['海工市场：平台利用率','Transocean 于 2026-02-19 披露 2025 年第四季度全船队钻井平台利用率 85.8%。[A07]','公司船队、季度、原报告定义；不能推广为全球平台利用率'],
['海工市场：合同日租金','同一报告披露自 2025 年 10 月报告以来的 10 项新增签约，加权平均日租金 417,000 美元/日。[A07]','限定这批合同样本与披露窗口；不与平均每日收入混同'],
['投资：已宣布的阶段投资','2025-03-27 Northern Lights 二期公告披露投资 75 亿挪威克朗。[A08]','二期、公告投资、原币；不是已经支付金额，也不是整个项目累计投资'],
['低碳：运输/封存能力','Northern Lights 公告披露一期能力 150 万吨 CO₂/年、扩建目标至少 500 万吨/年。[A08][A10]','当前能力与扩建目标分别展示；运输/注入/封存能力按原文边界区分'],
['实际海上产量：月度趋势','EIA 海上原油月序列给出 2026 年 4—7 月分别为 2,123、1,958、2,042、2,043 千桶/日，发布于 2026-09-30。[A12]','区域限定美国联邦海域对应海湾；月度日均流量，不是每月总桶数']]);
H('3.2 可以计算，但必须说明样本的指标',2);
T(['指标','形成方法','输出限定'],[
['已收录项目数、事件数、合作项目数','按统一项目或事件去重，再在指定主题/区域/时间内计数','显示“已收录/已核验”，不称全球总量；转载数不增加事件数'],
['新增投运规模','只累计期间明确投运且有规模证据的项目；核对是否分期或重复','规划、核准和在建单独展示；同一项目多篇公告只计一次'],
['同比/环比变化','比较同口径、同覆盖的两个时期，并保留本期和基期值','原值缺失不计算；基期为零显示从零新增；不以新闻数量替代行业增长'],
['单项目投资强度','有同一项目、同一阶段的投资与规模时计算，并列原始数值','明确币种、价格基准和包括哪些设施；不可跨项目拼分子分母']]);
H('3.3 改为“有数据后启用”的扩展指标',2);
T(['原候选内容','本版处理','启用所需材料'],[
['实际发电量、单项目实际产量、停产时长','不要求每篇新闻都提取；无连续披露时显示缺失','运营报告、官方统计或授权记录，含统计期与单位'],
['交付时间、在手订单、试验工况','按项目作为事实记录；只有样本完整时再做统计','合同/交付公告、试验报告；区分预计与实际，不把计划写成完成'],
['阶段到账、单位成本','不列为首期必须展示的指标','实际支付披露、审计报告或同口径成本资料；估算需单独标识'],
['实际 CO₂ 封存量','已有凭证机制的公开证据，尚未取得船货级数量','Northern Lights 2025-12-08 披露签发封存证书；需进一步获得含吨数的证书或报告。[A11]'],
['甲烷强度、核证蓝碳量','本次未验证项目级可用样本，保留为扩展','明确分母、测量期、核证体系和项目边界的原始报告']]);
P('“验证工况”“项目阶段”首先是描述性事实，不强行转成数字分数；“约”“超过”“至少”和区间必须保留。新闻没有说出的吨数、坐标、金额或原因，系统不得补齐。');

H('4 数据如何从文章变成可检索知识');
V('flow','统一处理流程',['采集与原文留存','海洋主题筛选','中文翻译与去重','事实及关系提取','核验与更新','检索及成果']);
T(['处理环节','业务规则','用户可见成果'],[
['采集与原文留存','登记平台、机构/账号、原文链接、发布/更新/采集时间；保存允许留存的版本','资料来源卡、原文快照；全文不可用时标“仅摘要/链接”'],
['主题筛选','判断与海洋能源的直接关联，归入核心、背景或待判断；支持人工纠正','五大主题资料库与排除原因'],
['翻译与去重','外文译成中文，名称和单位保持一致；同一消息的转载与中外文版本归并','中外文对照、原始首发与转载链；保留多个独立证据'],
['提取','识别谁、做了什么、涉及哪个项目、何地、何时、多少以及原文依据','事件、实体、关系和指标候选卡'],
['核验与更新','比较历史资料；对冲突、高影响数值和关键关系核验，保留更正记录','已核验/待核验/冲突/撤回状态；新旧值对照'],
['检索与成果','合并文字、名称、时间、关系与数值检索结果；用一致口径形成图表和回答','地图、时间线、指标趋势、带逐项来源的研究报告']]);
H('4.1 保留哪些核心对象',2);
T(['对象','必要信息示例','在系统中的作用'],[
['文章/报告','标题、平台、发布者、原文地址、发布日期、版本','回答“证据从哪里来”'],
['实体','机构、项目、设备、技术、地理区域；统一名称与别名','同一公司中英文名称或项目简称归为同一对象'],
['事件','事件类型、参与方、项目、发生时间、位置、核验状态','把多篇报道合并成一次签约、投运或政策变化'],
['关系','主体、关系类型、客体、适用项目、有效时间、证据','说明谁投资/运营/供货/供电，以及依据是什么'],
['指标观察','对象、指标、数值、单位、统计期、实际/计划、出处','形成可比较的表格与时间序列'],
['证据与变化','原文段落或页码、新旧值、两端来源、发现时间','支持点击溯源和研究历史回看']]);
P('这些是便于业务理解的核心信息，不是完整数据库字段清单。每个事件、关系与数值都应能回到文章或报告的具体位置；只有文章标题而没有正文证据时，不能据此确认复杂关系。');
H('4.2 关系类型与提取边界',2);
T(['关系类别','表达示例','确认依据'],[
['所有权/投资','企业 → 持有权益/投资 → 项目','明确股比、交易或投资说明；保留阶段与生效时间'],
['运营/开发','企业 → 运营/开发 → 海上项目','官方说明该企业角色；参与报道不等于运营方'],
['合同/供货','企业 → 为某项目供货/施工 → 项目','明确合同对象与内容；中标、签约、交付分别记录'],
['能源耦合','风场 → 向平台供电 → 平台/油田','明确受电方和项目；Hywind Tampen 可作为真实样例 [A01][A03]'],
['监管/政策','机构 → 批准/规范 → 项目或领域','审批机关、文件和适用范围；生效时间不等于发布日期'],
['技术应用','项目 → 采用 → 技术/设备','原文明确采用或试验；研发意向与已应用区分'],
['区位','设施/事件 → 位于 → 海域/国家','发生地点、设施位置与企业总部分开'],
['观点/共同提及','机构 → 提出观点；两实体 → 被同文提及','观点注明归属；共同提及仅为线索，默认不进入已确认合作图']]);
H('4.3 混合检索与阿里云能力的业务分工',2);
P('原有向量检索保留，用来寻找语义相关的材料；增加精确名称、时间、地理范围、指标和关系条件。用户问“近三个月某国新增投运多少”时，既找到相关报道，也必须在已核验事件与指标中筛选计算，不能只让模型阅读少量相似文章后估算。');
T(['能力','处理作用','输出要求'],[
['中文翻译','借助阿里云翻译能力统一外文阅读体验','专名一致，原文与译文可互相定位；数值、单位与条件不丢失'],
['向量化与检索排序','借助阿里云向量化及相关性排序寻找语义相关资料','与名称/时间/关系/数值检索共同工作；展示原始来源'],
['实体关系识别','借助语言模型提取结构化候选事实','候选结果必须有原文依据；模型判断不自动标为核验通过'],
['研究归纳','根据检索到的证据组织分析','区分事实、计算、推断、预测和缺口；逐项引用']]);
P('是否微调取决于实际错误：先统一行业术语、实体别名、关系定义和人工审核样本；如果仍长期出现同类错误，再评估微调。业务验收关注事实准确与可追溯，不以是否微调作为成果。');

H('5 地图、知识图谱与时间图表如何形成');
H('5.1 全球地图的数据链路',2);
V('flow','从资料到地图',['找到项目/事件','确认地理对象','核验位置依据','按筛选条件统计','绘制点与关系','点击查看原文']);
T(['地图元素','从什么资料形成','展示与解释规则'],[
['项目点','项目公告中的设施位置，或官方海洋空间数据','有可靠坐标才画精确点；仅知国家时显示国家聚合，不能猜测海上坐标'],
['区域数字','所选期间内、所选主题下已核验事件或项目的去重计数','写明“12 个事件”或“8 个项目”；可切换文章数但不混用'],
['关系连线','已核验的投资、运营、供货、供电关系及两端位置','点线可点击；显示关系、项目、时间和出处；国别汇总不得误称政府间协议'],
['热度与颜色','事件数量或主题分类','图例明确单一含义；不将媒体关注度冒充产业规模或风险等级'],
['海域和设施范围','可核验的官方地图/空间数据，例如 SODIR、EMODnet','区分实际范围与示意连线；没有真实几何或航迹数据，不显示为实际路线'],
['证据侧栏','点击对象对应的事实与原文','显示机构、标题、发布/事件日期、摘录、链接、核验状态与位置精度']]);
P('地图与资料列表共用主题、时间、区域、状态筛选。国家视图的总数按事件去重，不把同一跨国事件在两个国家的计数相加作为全球总数。国家聚合标记不代表设施建在国家中心位置。');
H('5.2 知识图谱的数据链路',2);
V('flow','真实关系样例：风电与油气耦合',['Equinor｜运营角色','Hywind Tampen｜风场','供电关系｜有公告依据','Gullfaks / Snorre｜油田']);
P('上图是关系阅读顺序示意，不是实际电缆或航线。图谱采用“实体—明确关系—实体”的表达，每条边附项目、时间和证据；从当前问题展开相关的一至两层关系，避免一次铺开所有节点。真实供电关系可从官方首电及开幕公告核对。[A01][A03]');
P('共同出现在同一篇文章中的两个企业，先形成“共同提及”线索。只有进一步找到合同、联合开发、股权或供货证据，才进入正式关系图谱；研究人员能够更正、撤销或合并关系。');
H('5.3 必须区分三类时间图表',2);
T(['图表','数据形成方式','横轴与使用边界'],[
['资讯时间分布','按原文发布日期统计收录资料','表达信息供给或报道热度；不代表行业活动真实发生日期'],
['项目/事件时间线','提取发生日期或里程碑，合并重复报道并关联来源','区分已发生、预计与时间不详；仅知月份就保留月份精度'],
['指标趋势图','同一对象、同一单位和统计口径下的多期数值','横轴用统计期；无数据留空，不以新闻日期生成连续产量曲线']]);
P('例如 Hywind Tampen 的首电公告发布于 2022-11-14，正文明确首台机组于 11 月 13 日开始发电。因此事件时间线放在 11 月 13 日，资料列表仍显示 11 月 14 日。二者各自保存，不能互相替代。[A03]');
H('5.4 真实时间线示例：Northern Lights',2);
V('timeline','事实里程碑与未来计划分开展示',[
['2025-03-27','二期投资决定','已宣布投资与扩建目标 [A08]'],
['2025-05-06','注入/封存许可公告','确认所需许可；不等于开始实际注入 [A09]'],
['2025-08-25','首次封存公告','确认已开始；具体首次注入日未在此样例中锁定 [A10]'],
['2028 年下半年','二期预期就绪','公告中的计划，须另核查后续更新 [A08]']]);
P('本示例按公告日期排列，第三项只确认“截至公告时已发生”，不擅自把公告日当作精确发生日；最后一项用虚线和“预计”标记。扩建目标与一期运行状态并存，不将 500 万吨/年直接计为已投运能力。该时间线是选定历史公告的解释示例，不宣称覆盖项目截至今日的全部进展。');
H('5.5 真实数值图示：海上原油月度日均产量',2);
V('chart','EIA｜美国联邦海域海湾原油产量｜千桶/日',[
['2026-04',2123],['2026-05',1958],['2026-06',2042],['2026-07',2043]]);
P('来源：[A12]。这四个值来自官方月度序列，数据发布日期为 2026-09-30；图示以零为基线。原始统计是月度日均流量，不能直接将四个值相加称为四个月总产量。若计算累计桶数，需按各月天数折算并明确公式。');
P('落地过程为：读取官方表格 → 保留地区、统计月份、单位和来源版本 → 检查缺失与修订 → 选择相同口径的月份 → 绘图 → 点击柱或点查看原始表格。后续修订更新当前视图，同时保留旧报告当时使用的数据。');
H('5.6 变化、预测和雷达图的使用约束',2);
P('新旧资料比较时，先判断是项目真实变化、统计口径改变还是页面修订。Hywind Tampen 的历史容量与当前容量可以做“资料版本对照”，但在取得升级日期之前，不能将其画成有精确变更日的阶梯曲线。[A01][A02]');
P('区域或主题雷达图只用于有明确口径的多维比较，例如已核验项目数、已投运装机、已披露投资覆盖率。每条轴都需公布定义、时间窗、样本范围和标准化方法；资料不足的轴标缺失，不补零、不用模型主观打分生成国家综合实力排名。首期优先用原值条形图与指标卡，具备可比数据后再启用雷达图。');

H('6 智库应用需求与业务成果');
T(['模块','用户操作与处理需求','成果'],[
['战略驾驶舱','按主题、区域和时间查看已核验事件、重要变化、资料覆盖与待核验项','地图、趋势、变化清单、来源覆盖说明；统计可点击下钻'],
['全球信息感知','管理公众号/RSS/官网/API/手动资料，观察最近成功获取时间及缺口','来源目录、更新状态、补采待办'],
['情报资料','搜索、筛选、翻译对照、查看来源及快照，纠正主题与重复归并','可检索的原始证据库'],
['情报事件','查看或核验时间、地点、角色、状态；合并重复事件','事件档案、里程碑与关联资料'],
['战略知识库','查询企业、项目、设备、技术及其关系，维护别名与冲突','实体档案、关系图谱和指标记录'],
['量化分析','选择指标、范围和时期；先确认口径再比较或汇总','趋势、区域对比、数据明细及计算依据'],
['AI 研究工作台','提出问题、确认范围、查看证据、生成初稿并审核','有结论、有依据、有不足说明的专题研判'],
['情报订阅','订阅主题/项目/实体变化；同一事件转载不重复提醒','新增事实与重要修订摘要，含来源链接'],
['简报与研究快照','在线预览 TXT 简报，导出 Word/PDF，保存研究使用的资料版本','可分享成果包：正文、图表、证据清单、截止日期和审核状态']]);
P('保持白天/夜间模式和移动端布局。手机上地图、图表和证据侧栏可切换查看；颜色之外同时使用文字状态和图例，确保黑白打印仍可理解。');
H('6.1 AI 研判示例与输出结构',2);
P('问题示例：“最近三个月，海上风电为油气平台供电的项目有哪些进展？是否能够判断商业化在加速？依据是什么？”');
T(['回答部分','系统应提供的内容'],[
['研究范围','明确起止日期、覆盖国家、主题与已收录来源；历史案例只能作背景'],
['事实变化','按项目列出新增审批、签约、首电、扩建或暂停，分别附事件日期与来源'],
['关系与量化','解释风场—平台的供电关系，按已核验项目统计规模和阶段；不累计重复公告'],
['研判','先说明能直接证明什么，再给有限度的分析；不能由报道增加推导商业化加速'],
['不足与反证','缺哪些地区、连续运营数据或成本资料；是否存在延误、取消或相反证据'],
['来源清单','逐条列标题、机构/账号、平台、发布日期、原文地址、证据位置及必要译文']]);
P('可用于历史背景的真实案例是 Hywind Tampen，但 2022—2023 年的公告不属于“最近三个月”的新增事件。若当前资料不足，应回答“已收录资料不足以判断商业化整体加速”，并列出补证需求，不用历史公告填充近期进展。');
H('6.2 每个输出怎样做到有依据',2);
T(['输出对象','必须能追到哪里'],[
['回答中的事实或机构观点','原始文章/报告、发布者、日期、原文段落；观点注明是谁提出'],
['地图中的点和线','地点证据、位置精度、关系证据及有效时间'],
['趋势图中的数值','原始统计表或证据段落、对象、单位、统计期与版本'],
['增幅或汇总值','计算公式、输入数据、去重规则和覆盖范围'],
['研究人员或 AI 的推断','所依据的事实集合、推断条件和不确定性，不伪装成原文结论'],
['保存的研究成果','当时使用的资料版本、筛选条件、截止时间和审核状态']]);
P('外文来源同时提供中文译文与原文入口。出处暂不可访问时标明状态；受限全文仅展示允许的元数据与链接。网页更新后，旧报告仍保留当时证据；原资料被更正或撤回时提示受影响结论。');

H('7 业务验收与成果清单');
T(['验收场景','应达到的可观察结果'],[
['一篇英文项目公告入库','能查看原文、中文译文、主题、发布主体、日期和链接'],
['多平台转载同一事件','保留转载来源但只形成一个事件；地图和列表计数一致'],
['两家公司同文出现','仅标共同提及；没有合作证据时不画已确认合作连线'],
['容量、投资或计划变动','旧值与新值均保留，能够说明时间和来源；不将计划当实际'],
['统计期与发布日期不同','时间线和趋势图使用各自适当的日期，并能查看另一个日期'],
['地图上点击一个热点','打开同筛选范围的项目/事件及证据；不显示未经证实的坐标'],
['点击图表一个数值','打开来源表格或段落；涉及计算时同时显示公式和输入'],
['研究问题证据不足','明确缺口或拒绝给出无依据数值；已知事实仍可正常呈现'],
['简报预览与导出','内容、图表、来源编号一致；标明截止时间和审核状态'],
['演示资料与正式资料并存','演示数据明确标识，默认不参与正式研究与行业统计']]);
P('最终成果包括：可用来源台账、海洋能源资料库、实体与事件档案、关系图谱、指标台账、全球地图与时间图表、可追溯研究问答、专题简报与变化订阅。是否启用某项指标，以真实来源及口径核验为前提。');

// Source appendix: explicit acquisition method, independent of verification state.
const methodMap={S01:'download',S02:'download',S03:'api',S04:'api',S05:'api',S06:'web',S07:'rss',S08:'manual',S09:'web',S10:'web',S11:'web',S12:'rss',S13:'api',S14:'rss',S15:'rss',S16:'api',S17:'api',S18:'download',S19:'download',S20:'web',S21:'web',S22:'web',S23:'web',S24:'download',S25:'web',S26:'web',S27:'manual',S28:'api',S29:'manual',S30:'api'};
const groups={rss:{label:'RSS 订阅',color:'19735F',fill:'E9F5EF'},api:{label:'API / 数据服务',color:'2364A1',fill:'EAF2FC'},web:{label:'官网栏目获取',color:'7758A1',fill:'F1EDF8'},download:{label:'官方文件下载',color:'9A680E',fill:'FCF3DF'},manual:{label:'手动 / 授权获取',color:'596774',fill:'EDF0F3'}};
const overrides={
S01:['报告/数据目录→按许可下载','目录已核查；公开与付费混合','不承诺通用新闻 API'],S02:['MOMR 月报及 Excel 附表下载','下载入口已核查','作为油气背景，筛选海洋关联'],
S03:['商业 API / 批量交付','官方产品确认；未取得账号','询价确认海上资产范围及模型加工权'],S04:['商业 API / 数据交付','官方产品确认；未取得账号','索取样本和授权范围'],S05:['商业 API / 研究数据服务','官方产品确认；未取得账号','日租金、平台利用率等需确认套餐'],
S06:['官网新闻；受限时申请供稿','可检索；本地直接访问受限','未确认官方 RSS/API'],S07:['RSS 自动发现文章','已验证 RSS 返回条目','全文、海洋主题和转载需二次核验'],S08:['机构订阅、授权文章或手动导入','订阅入口确认','普通阅读订阅不等于批量获取许可'],S09:['官网公告栏目及邮件提醒','页面可访问，持续获取待验证','未确认稳定全站 RSS'],S10:['官网新闻栏目','页面可访问，持续获取待验证','按海上项目筛选'],S11:['官网葡语/英语公告','页面可访问，持续获取待验证','合并多语言版本'],S12:['官方 RSS','已验证 RSS 返回条目','与 EIA 统计表互补'],S13:['官方数据 API；亦可下载表','官方文档确认；需申请免费账号密钥','已核对海上产量表样例 [A12]'],S14:['RSS 自动发现文章','已验证 RSS 返回条目','与 S15 可能同源，不能算独立证据'],S15:['RSS 自动发现文章','已验证 RSS 返回条目','优先海上风电专题'],S16:['官方空间数据服务','官方目录确认；本地请求曾超时','须验证项目位置和实际可用范围'],S17:['官方空间服务及数据下载','官方目录确认；尚未完成实际接入','用于风场位置/范围，不是实时运营数据'],S18:['数据库查询后导出文件','官方数据库入口确认','先确认海上/陆上分类；不承诺已验证 API'],S19:['官网报告、年报下载','出版目录确认','补足潮汐、波浪等海洋能资料'],S20:['官网政策栏目及附件','主页可达；具体栏目待验证','未确认开放 RSS/API'],S21:['官网栏目；手动文件作补充','本地解析失败，待复核','不因一次失败认定站点不可用'],S22:['官网政策与报告','公开页面可读取','只纳入海洋相关低碳内容'],S23:['官方政策库及附件','本次未读出，待复核','与部委原始文件去重'],S24:['官方统计表与发布文件下载','主页可达；具体表待核验','全国能源总量不能替代海上数据'],S25:['企业官网/公告；授权公众号补充','候选来源，需逐栏目确认','核实账号主体和原始公告'],S26:['沿海省市官网白名单','候选渠道集合，尚非单一来源','逐个登记真实栏目地址，不提供占位订阅链接'],S27:['授权供稿、手动链接/文件；有权账号可用官方接口','按账号授权验证','无任意第三方公众号全量读取承诺'],S28:['官方 API','官方文档确认；未认证获取','付费及访问范围以账号为准'],S29:['机构供稿、手动线索；官网替代','第三方机构页读取权限未取得','获批接口只在授权范围内使用'],S30:['商业新闻发现 API','文档确认；未带账号获取','通常仅摘要线索，不能替代全文证据']};
const sources=prior.sources.map(s=>({...s,group:methodMap[s.id],businessMethod:overrides[s.id][0],verification:overrides[s.id][1],businessNote:overrides[s.id][2]}));
sources.push(...[
['S31','Equinor','https://www.equinor.com/news','风电、油气、能源融合','官方项目页与公告；手动样例已核对','公开案例可读；持续采集待验证','保留项目页与历史公告不同版本'],
['S32','Transocean','https://investor.deepwater.com/','海工平台与合同市场','投资者关系公告、运营报告','真实季度报告已核对；持续获取待验证','公司船队口径，不等于全球市场'],
['S33','Northern Lights','https://norlights.com/news/','海底 CO₂ 封存','项目官方新闻与文件','真实公告已核对；持续获取待验证','实际证书数量需要另行取得']
].map(([id,name,url,scope,businessMethod,verification,businessNote])=>({id,name,url,scope,group:'web',businessMethod,verification,businessNote,cost:'公开入口；使用范围逐项确认'})));
sources.forEach(s=>refs[s.id]=[s.name,s.id==='S26'?'https://www.nea.gov.cn/':s.url]);
H('附录 A 信息渠道获取方式与核验状态');
P('按“主要推荐获取方式”分组，同一来源可以有补充方式。颜色只表示获取方式，不代表可信度或已经接通；每行单列核验状态。以下为 33 项来源/渠道方案（原 30 项，新增 3 个本次案例来源），不是 33 个已运行连接器。');
V('legend','渠道图例',Object.values(groups).map(g=>[g.label,g.fill,g.color]));
P('RSS 获取的是订阅条目，可能只有摘要；API 获取的内容取决于产品和账号；官网获取需验证栏目稳定性；文件下载可由人工或允许的自动流程完成；手动/授权获取用于无稳定公开渠道或需内容许可的来源。可访问不等于已获得全文保存、翻译和 AI 加工的全部权限。');
for(const [key,g] of Object.entries(groups)){
 H('A.'+(Object.keys(groups).indexOf(key)+1)+' '+g.label,2);
 T(['来源与入口','主要方式 / 内容','核验状态 / 费用及限制'],sources.filter(s=>s.group===key).map(s=>[
 s.id==='S26'?s.name+'（逐省登记）':s.name+' ['+s.id+']',s.businessMethod+'；'+s.scope,s.verification+'。'+s.businessNote+'。'+(s.cost||'')
 ]),key);
}
P('四个 RSS 的验证记录沿用 2026-10-07 的只读探测：Oilprice、EIA Today in Energy、Offshore Energy、OffshoreWIND；本次未宣称所有渠道已实现持续自动采集。附随 CSV 保留可点击入口及分组，供筛选和补充核验。');

H('附录 B 指标与图示的真实证据目录');
P('本目录包含新闻公告、官方项目页和统计表。新闻日期、统计期与本次核查时间分开列示；无发布日期的动态项目页明确标注。案例属于指标设计证据，不能直接作为任意近期研究的结论。');
for(const a of articles){
 H(a.id+' '+a.publisher,2);P(a.title);P('发布日期/数据时间：'+a.date+'。用途：'+a.note+'。');P(a.url);
}
H('附录 C 业务名词与阅读口径');
T(['名词','本需求中的含义'],[
['Mtpa','百万吨/年；需注明 LNG、CO₂ 或其他介质'],['MW / MWh','MW 表示功率或装机；MWh 表示一定时期内的电量，二者不能直接替代'],['桶油当量/日','以油当量表示的油气流量，不能改写为原油桶/日'],['容量因子 / 利用率','容量因子比较实际与理论发电量；平台利用率依报告中的船队和天数定义，二者不能混用'],['新闻热度 / 行业增长','前者统计收录信息数量，后者需要产量、容量等业务指标证据'],['核验 / 可信','核验表示已检查特定主张与证据；单一官方或企业公告也可能修订，不代表永远无误'],['研究快照','保存某次研究用到的资料版本、统计范围、图表和结论，可按当时依据复核']]);
P('本版已隐藏详细接口、数据库设计和工期信息。历史 V1 文档单独归档；当前同名 PDF、Word、HTML 均为 V2 业务评审版。本次只更新本地文档，未修改线上网站或生产数据。');

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function inline(s){let re=/\[([ASM]\d+|W01)\]|https?:\/\/[^\s]+/g,last=0,res='',m;while((m=re.exec(s))){res+=esc(s.slice(last,m.index));const url=m[1]?refs[m[1]]?.[1]:m[0];res+=url?`<a href="${esc(url)}">${esc(m[0])}</a>`:esc(m[0]);last=re.lastIndex;}return res+esc(s.slice(last));}
function runs(s){let re=/\[([ASM]\d+|W01)\]|https?:\/\/[^\s]+/g,last=0,res=[],m;while((m=re.exec(s))){if(m.index>last)res.push(new TextRun(s.slice(last,m.index)));const url=m[1]?refs[m[1]]?.[1]:m[0];res.push(url?new ExternalHyperlink({link:url,children:[new TextRun({text:m[0],style:'Hyperlink'})]}):new TextRun(m[0]));last=re.lastIndex;}if(last<s.length)res.push(new TextRun(s.slice(last)));return res;}
const doc=[],parts=[],toc=[];
for(const [i,b] of blocks.entries()){
 if(b.type==='h'){
  const tag=b.level===0?'h1':b.level===1?'h2':'h3';
  parts.push(`<${tag} id="s${i}">${esc(b.text)}</${tag}>`);
  doc.push(new Paragraph({text:b.text,heading:b.level===0?HeadingLevel.TITLE:b.level===1?HeadingLevel.HEADING_1:HeadingLevel.HEADING_2,keepNext:true,spacing:{before:260,after:160}}));
  if(b.level===1)toc.push([i,b.text]);
 }else if(b.type==='p'||b.type==='b'){
  parts.push(`<p>${inline(b.text)}</p>`);doc.push(new Paragraph({children:runs(b.text),spacing:{after:120,line:300}}));
 }else if(b.type==='t'){
  const g=groups[b.kind];
  parts.push(`<div class="table-wrap"><table${g?` style="--tint:#${g.fill};--ink:#${g.color}"`:''}><thead><tr>${b.heads.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${b.rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`);
  doc.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[b.heads,...b.rows].map((r,j)=>new TableRow({tableHeader:j===0,cantSplit:true,children:r.map(c=>new TableCell({width:{size:100/r.length,type:WidthType.PERCENTAGE},shading:j===0?{fill:g?.fill||'E8F1F5'}:undefined,margins:{top:90,bottom:90,left:100,right:100},children:[new Paragraph({children:runs(c),spacing:{after:70,line:280}})]}))}))}));
  doc.push(new Paragraph({text:'',spacing:{after:70}}));
 }else if(b.type==='visual'){
  let content='';
  if(b.kind==='flow')content=`<div class="flow">${b.data.map((x,j)=>`<div><small>${String(j+1).padStart(2,'0')}</small>${esc(x)}</div>`).join('<span>→</span>')}</div>`;
  if(b.kind==='timeline')content=`<div class="timeline">${b.data.map((r,j)=>`<div class="milestone ${j===3?'planned':''}"><strong>${esc(r[0])}</strong><b>${esc(r[1])}</b><p>${inline(r[2])}</p></div>`).join('')}</div>`;
  if(b.kind==='chart')content=`<div class="chart">${b.data.map(([d,v])=>`<div class="bar-row"><label>${d}</label><div class="bar-track"><div style="width:${v/2500*100}%"></div></div><strong>${v.toLocaleString('en-US')}</strong></div>`).join('')}<div class="axis">0 <span>2,500 千桶/日</span></div></div>`;
  if(b.kind==='legend')content=`<div class="legend">${b.data.map(([label,fill,color])=>`<span style="background:#${fill};color:#${color}">${esc(label)}</span>`).join('')}</div>`;
  parts.push(`<figure><figcaption>${esc(b.text)}</figcaption>${content}</figure>`);
  doc.push(new Paragraph({text:b.text,keepNext:true,spacing:{before:140,after:100}}));
  const lines=b.kind==='flow'?[b.data.join(' → ')]:b.data.map(r=>b.kind==='legend'?r[0]:r.join(' ｜ '));
  lines.forEach(line=>doc.push(new Paragraph({children:runs(line),shading:{fill:'EFF6F7'},spacing:{after:100,line:300}})));
 }
}
const css=`*{box-sizing:border-box}body{margin:0;background:#eef3f6;color:#213e4c;font:15px/1.85 "Microsoft YaHei","Segoe UI",sans-serif}nav{position:fixed;width:235px;inset:0 auto 0 0;background:#123444;color:#fff;padding:28px 20px;overflow:auto}nav strong{font-size:17px;display:block;margin-bottom:15px}nav a{display:block;color:#cce0e6;text-decoration:none;font-size:12px;padding:8px 0}main{max-width:1110px;background:#fff;margin:28px 25px 60px 260px;padding:42px 44px}h1{font-size:34px;margin:0;color:#0f5361}h2{font-size:23px;color:#165d6c;border-bottom:2px solid #dae8ed;padding-bottom:10px;margin-top:42px;scroll-margin-top:20px}h3{font-size:17px;color:#246d7b;margin-top:27px}p{overflow-wrap:anywhere;margin:12px 0}a{color:#1a7c88;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px;line-height:1.85}th,td{border:1px solid #d5e2e7;padding:10px 12px;vertical-align:top;overflow-wrap:anywhere}th{background:var(--tint,#e8f2f5);color:var(--ink,#174f60);text-align:left}th:first-child,td:first-child{width:23%}tbody tr:nth-child(even){background:#f7fafb}.table-wrap{margin:18px 0;overflow:auto}figure{margin:22px 0;padding:19px;background:#f0f7f8;border:1px solid #d7e8eb;break-inside:avoid}figcaption{font-size:13px;font-weight:bold;color:#225d6a;margin-bottom:15px}.flow{display:flex;align-items:center;gap:8px}.flow div{flex:1;background:white;border:1px solid #cee0e5;padding:12px 9px;font-size:12px;line-height:1.7}.flow small{display:block;color:#369293;font-weight:bold}.timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.milestone{border-top:3px solid #338b90;padding-top:12px}.milestone strong{font-size:12px;color:#28777c;display:block}.milestone b{font-size:13px;display:block}.milestone p{font-size:11px;line-height:1.8}.planned{border-top:3px dashed #b08430}.bar-row{display:flex;gap:12px;align-items:center;margin:12px 0;font-size:12px}.bar-row label{width:70px}.bar-row strong{width:48px}.bar-track{flex:1;background:#e1ecee;height:23px}.bar-track div{height:23px;background:#2c8790}.axis{margin-left:82px;margin-right:60px;font-size:10px;color:#607d87;display:flex;justify-content:space-between}.legend{display:flex;gap:9px;flex-wrap:wrap}.legend span{padding:6px 12px;font-size:12px;font-weight:bold;border-radius:4px}.actions{position:fixed;right:18px;top:10px}button{background:#1a737d;color:white;border:0;border-radius:5px;padding:10px 16px;cursor:pointer}@media screen and (max-width:900px){nav{position:static;width:auto;max-height:190px;padding:16px}nav a{display:inline-block;margin-right:12px}main{margin:12px;padding:24px 17px}h1{font-size:27px}.actions{position:static;padding:10px 14px}.table-wrap{overflow:auto}table{min-width:580px}.flow{flex-direction:column;align-items:stretch}.flow span{transform:rotate(90deg);text-align:center}.timeline{grid-template-columns:1fr 1fr}}@media print{nav,.actions{display:none}body{background:#fff;font-size:10pt;line-height:1.8}main{margin:0;padding:0;max-width:none}h1{font-size:28pt}h2{font-size:17pt;break-after:avoid;margin-top:24px}h3{font-size:12pt;break-after:avoid}p{widows:3;orphans:3}table{font-size:8.5pt;line-height:1.75}th,td{padding:8px 9px}tr{break-inside:avoid}.table-wrap{overflow:visible}figure{padding:13px}a{color:#175e70}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@page{size:A4;margin:17mm 16mm 18mm}`;
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${base} · V2 业务评审版</title><style>${css}</style></head><body><nav><strong>海洋能源战略智能智库</strong><small>V2.0 · 业务评审版</small>${toc.map(([i,t])=>`<a href="#s${i}">${esc(t)}</a>`).join('')}</nav><div class="actions"><button onclick="print()">打印 / 保存 PDF</button></div><main>${parts.join('\n')}</main></body></html>`;
fs.writeFileSync(path.join(out,base+'.html'),html);
fs.writeFileSync(path.join(out,'requirements-content.json'),JSON.stringify({version:'2.0',date:'2026-10-07',blocks,sources,articles,refs},null,2));
const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
const csv=[['编号','来源','获取方式分组','推荐获取方式','覆盖内容','核验状态','费用/权限','业务限制','入口'],...sources.map(s=>[s.id,s.name,groups[s.group].label,s.businessMethod,s.scope,s.verification,s.cost,s.businessNote,s.id==='S26'?'逐省核验后登记':s.url])];
fs.writeFileSync(path.join(out,'source-register-2026-10-07.csv'),'\uFEFF'+csv.map(r=>r.map(quote).join(',')).join('\r\n'));
const evidence=[['编号','发布机构/平台','原始标题','发布日期或统计时间','原始链接','用途'],...articles.map(a=>[a.id,a.publisher,a.title,a.date,a.url,a.note])];
fs.writeFileSync(path.join(out,'metric-evidence-2026-10-07.csv'),'\uFEFF'+evidence.map(r=>r.map(quote).join(',')).join('\r\n'));
async function main(){
 const document=new Document({creator:'Ocean Intelligence',title:base+' V2 业务评审版',styles:{default:{document:{run:{font:'Microsoft YaHei',size:21},paragraph:{spacing:{line:300}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:950,bottom:1000,left:950,right:950}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'海洋能源战略智能智库 · V2 业务评审版  |  ',size:17}),new TextRun({children:[PageNumber.CURRENT],size:17})]})]})},children:doc}]});
 fs.writeFileSync(path.join(out,base+'.docx'),await Packer.toBuffer(document));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(require('url').pathToFileURL(path.join(out,base+'.html')).href);
 await page.pdf({path:path.join(out,base+'.pdf'),format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="width:100%;text-align:center;font-size:8px;color:#617682">海洋能源战略智能智库 · V2 业务评审版　<span class="pageNumber"></span> / <span class="totalPages"></span></div>',preferCSSPageSize:true});
 const desktop=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenAnchors:[...document.querySelectorAll('nav a')].filter(a=>!document.getElementById(a.hash.slice(1))).length}));
 await page.screenshot({path:path.join(process.env.TEMP,'ocean-v2-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 await page.screenshot({path:path.join(process.env.TEMP,'ocean-v2-mobile.png')});
 await browser.close();
 console.log(JSON.stringify({blocks:blocks.length,sources:sources.length,articles:articles.length,desktop,mobile,out}));
}
main().catch(e=>{console.error(e);process.exit(1)});
