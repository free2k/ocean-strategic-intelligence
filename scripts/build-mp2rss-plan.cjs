const fs=require('fs'),path=require('path');
const {Document,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,HeadingLevel,Packer,ExternalHyperlink}=require('docx');
const {chromium}=require('playwright-core');
const out=path.resolve('docs/mp2rss-plan-2026-10-11');fs.mkdirSync(out,{recursive:true});
const base='海洋能源智库_Mp2RSS订阅管理改造开发文档_V1.0';
const blocks=[];const H=t=>blocks.push({type:'h',text:t}),P=t=>blocks.push({type:'p',text:t}),T=(heads,rows)=>blocks.push({type:'t',heads,rows});
const R=(label,url)=>blocks.push({type:'r',label,url});
H('海洋能源智库｜Mp2RSS 订阅管理改造开发文档');
P('V1.0 · 2026-10-11 · 状态：开发设计与代码核查完成，付费账号联调待开展。本次只编制方案，未更换生产采集源，未调用付费账号接口，未执行远端订阅增删。');
P('建议采用“Mp2RSS Open API 为主、RSS 为备用”的接入方式。保留现有文章库、分类、向量检索和智库证据体系；将旧公众号扫码采集替换为供应商连接器。公众号、X 推文、X 长文共用订阅管理入口，但分别解析和保存出处。');
P('证据边界：已阅读官方 API、FAQ、订阅管理、快速开始和会员说明；已检查当前工作区代码，并只读确认线上存在 pipeline-worker.mjs 和自动提取模块。未取得 Feed 密钥及真实付费响应，全文完整率、历史覆盖、嵌套作者字段和实际稳定性均待联调。文中“建议、拟新增”为待开发项，不能视作已上线功能。');

H('1. 先明确 X 推文、长文与订阅的关系');
T(['内容类型','本系统如何理解','建议呈现与分析'],[
 ['公众号文章','一个公众号下的文章内容流','文章标题、原文、中文摘要、作者、发布时间和微信公众号原链接'],
 ['X 推文 posts','账号发布的帖子；可能带媒体、转推、引用或线程','短内容也可作为线索；没有标题时生成标记为“展示标题”的摘要，不能伪称原文标题'],
 ['X 长文 articles','同一 X 账号的另一种内容流','独立文章详情，保留标题、正文完整性及长文原链接'],
 ['X 线程 thread','推文流中的系列帖子，不能直接当成长文流','保存每段的作者/时间/帖子标识；信息缺失则明确标注，不推测补齐'],
 ['转推／引用','传播动作与被传播内容是两个层次','外层账号不自动成为内层内容的作者；“转推”不能生成“投资、合作”等产业关系']
]);
P('按官方订阅模型，X 订阅单位是账号，同一账号分别读取 posts 和 articles；不应把它设计成两个独立付费账号名额。公众号与 X 共用套餐配额。X 账号新增、搜索、取消在供应商 Web 控制台完成，本系统导入已订阅账号并提供两条内容流的本地开关。若实购套餐另有约定，以账户实际权益为准。');
R('依据：官方订阅管理','https://areyoubugcoder.github.io/Mp2RSS/guide/subscription.html');
P('官方 FAQ 明确：首次订阅不回溯历史，只收录订阅后的新内容；源站发布到服务收录平均约需 2—3 小时，并非实时保证。因此原公众号历史库必须保留；“同步近三天”只能同步供应商已经持有的资料，不能承诺把订阅前三天补齐。长文列表为空也可能只是账号没有发布长文，不能直接报采集失败。');
R('依据：官方 FAQ（历史范围、内容类型与更新延迟）','https://areyoubugcoder.github.io/Mp2RSS/guide/faq.html');

H('2. 现有代码能复用什么，必须改什么');
T(['当前代码／观察','问题或能力','本次开发动作'],[
 ['pages/wechat.vue；公众号列表与登录组件','整个采集区挂载扫码登录状态，旧公众号同步依赖会话','保留旧入口为“历史采集”；新增供应商账号状态，不再让 Mp2RSS 路径依赖扫码'],
 ['server/api/wechat/articles/sync.post.ts','同步以 fakeid 为核心，任务状态主要在进程内','新连接器独立实现；不把供应商 mpId 塞进 fakeid，也不调用旧微信鉴权'],
 ['pages/wechat/rss.vue；server/api/rss/*','已有单源、批量添加及手动同步','复用交互框架，扩展平台、内容流、健康状态与同步记录'],
 ['RSS source.alias 存完整 URL；sources.get 返回整行；sync 写 URL 日志','付费 Feed URL 带凭据，会暴露给前端、日志和导出','改为后端凭据引用；前端只返回脱敏显示，不把完整链接作为普通 alias'],
 ['sources.post.ts 用 URL 前 60 字符生成 fakeid','同账号的多条付费链接前缀接近，存在身份碰撞；重置密钥又可能产生新源','来源身份采用平台稳定 ID；传输端点及密钥与来源分离'],
 ['RSS sync：body.maxArticles || 50','前端传 0 表示不限，后端仍变成 50','改为显式非负整数校验与 0=不限语义；分页大小和任务总量分开'],
 ['rss-parser.ts 仅识别 rss.channel','不能把 Atom／JSON Feed 直接视为已支持；无日期填 1970','主路径用 API 专用解析；备用首期限定 RSS 2.0；日期未知保留空值与精度'],
 ['articles/import-rss.post.ts 可能用帖子中的链接替换原文链接','若用于 X，会丢失推文本身出处','外链另存 relatedLinks，禁止替换帖子 canonicalUrl'],
 ['articles.link 唯一；externalId 无分平台联合约束','重复内容直接忽略，正文补齐及修订难以更新','增加外部身份映射、内容版本及 upsert，保留历史文章 ID'],
 ['article_chunks、过滤规则、summary、vectorized','可复用分类、摘要与 1024 维向量能力','新增版本级状态，避免正文变更后仍使用旧向量'],
 ['intelligence/auto-extract.mjs、pipeline-worker.mjs','当前代码已有四类抽取、原文引用校验、翻译与证据翻译','接入规范化文档；补全任务状态、短帖/引用归属测试，不重复建设抽取器'],
 ['intelligence/scheduler.mjs','综合采集约每六小时；已有处理专用运行入口及互斥锁','供应商采集可独立轮询；发布继续复用互斥与安全合并，不能并行覆盖整个快照']
]);
P('线上只读检查显示最近记录的综合任务包含 pipeline-worker.mjs，结果为 partial。该事实说明自动处理模块已存在，不证明每条文章均已处理成功。本方案以当前代码为依据，不沿用此前“只有翻译、没有自动提取”的旧结论；迁移验收时另核查失败明细。');

H('3. 接入架构：平台、供应商、内容流分开');
P('建议结构：供应商账户 → 平台账号映射 → 内容流 → 原始收录记录／版本 → 原版文章库 → 幂等投递 → 智库文档与处理任务 → 证据、地图、检索和研究。Mp2RSS 是传输供应商；微信公众号或 X 才是原始发布平台；具体账号才是发布者。');
T(['层次','建议职责','关键约束'],[
 ['ProviderAccount','保管 Mp2RSS 密钥、连接状态和人工登记到期日','不在浏览器或文档中存真实密钥；到期日无已确认公开接口时不可伪造自动读取'],
 ['SourceBinding','关联现有 sources 与供应商账号 ID','旧 fakeid 与新 mpId 为不同命名空间；人工核对迁移映射，不凭同名自动合并'],
 ['Stream','公众号文章／X 推文／X 长文三种流独立进度','X 两条流共享账号，但有各自水位、失败状态及开关'],
 ['RawItem + Version','保存响应正文、原文 URL、内容哈希及获取时间','原始响应不包含认证头或带密钥请求 URL；正文原文与译文分开'],
 ['Outbox + ProcessingJob','文章入库后可靠投递，按版本处理','同一事务写入文章及 outbox；重复投递不重复建事件；失败可重试'],
 ['智库存储','规范化文档驱动现有分析和展示','public.articles 与 ocean_intel 不是同一存储；原版入库成功不等于智库已可查']
]);
P('不建议仅将合集 RSS 加入旧页面后宣布完成接入：合集可能让多个发布者被归入同一个 source，且渲染后的 Feed 会弱化 X 转推、引用和线程的结构。API 作为主路径更适合溯源；备用 Feed 需要独立标记来源和内容完整性。');

H('4. 供应商 API 契约摘要与待验证边界');
P('官方 API 使用 Feed 密钥作 Bearer 凭据，服务地址为 https://mp2rss.bugcode.dev。以下只列实现必需的调用；具体字段与未来变动以官方契约和联调样本为准。');
T(['用途','方法与路径','分页／处理要点'],[
 ['发现已订阅账号','GET /open-api/subscriptions','sourceType 区分 mp／x；每页最多 50'],
 ['添加／取消公众号','POST /open-api/subscriptions；DELETE /open-api/subscriptions/{mpId}','添加提交 articleUrl；成功写操作为 204，不解析 JSON'],
 ['公众号内容','GET /open-api/subscriptions/{mpId}/articles','每页最多 100；没有 total，按不足一页结束'],
 ['X 推文','GET /open-api/x/{xUserId}/posts','每页最多 50；使用 postId，保留嵌套结构'],
 ['X 长文','GET /open-api/x/{xUserId}/articles','每页最多 50；以原始 url 标识，正文可能为空']
]);
P('时间为 UTC 毫秒，存储统一 UTC，前端显示北京时间。公众号正文也可能为空；X 用户 ID 必须按字符串保存。429 按 Retry-After 退避；401、403、404 分别进入凭据、权益或订阅核查流程，不反复盲重试。');
R('依据：Mp2RSS Open API 契约','https://areyoubugcoder.github.io/Mp2RSS/api/');
P('尚未实测的边界：第三方是否覆盖所有帖子类型及编辑；转推对象/线程内部是否总有作者、ID、日期；长文 URL 是否保持稳定；正文空值何时补齐；旧资料保留多久；帖子原链接可否由返回身份稳定定位；分页时新增条目的漂移表现。这些均列入首轮付费样本验证，不能凭示例响应承诺。');
P('文档服务介绍页对 X API 能力有概括性表述，与具体 API/FAQ 的明确限制不完全一致；实现以详细 API 和 FAQ 为准，不开发未公开的 X 搜索、订阅写接口，不抓取控制台内部接口冒充 Open API。');

H('5. 订阅管理页面改造需求');
T(['页面区域','用户能做什么','实现边界'],[
 ['渠道账户','录入／替换 Feed 密钥，测试连接，查看脱敏账号状态','测试只读；密钥提交后不回显，API 列表不返回凭据'],
 ['统一订阅列表','按公众号、X 筛选；看最近成功拉取、最新原文日期、待处理数','区分“连接正常无新内容”与“失败”；不把旧发布日期等同采集故障'],
 ['公众号订阅','粘贴文章链接添加；从供应商导入；关联旧公众号历史记录','新增远端订阅会使用套餐名额；批量操作先列明目标和结果'],
 ['X 订阅','跳转供应商管理账号；导入后勾选推文和／或长文','本地暂停不等于取消供应商订阅；取消远端须去控制台'],
 ['同步设置','现在同步、启用定期、可用历史回补范围、失败重试','分页数不等于采集总量上限；无历史时显示覆盖起点'],
 ['采集结果','新增、更新、重复、待正文、待筛选、排除及失败计数','每条可查看原因；不把模型处理进度合并成“同步成功”'],
 ['资料详情','原平台、原发布者、获取供应商、日期、原文／译文、引用关系','原始链接始终指向公众号／X 内容，不指向付费 Feed'],
 ['任务中心','采集、正文、分类、抽取、翻译、向量、智库投递分别显示状态','显示下一次执行、重试时间与失败原因，不把等待写成处理中'],
 ['停用与迁移','暂停旧扫码任务；保留旧文章和来源映射；必要时回滚连接器','停用本地订阅默认不删除历史资料、不调用远端 DELETE']
]);
P('建议沿用“资讯抓取”导航，内部调整为“渠道账户、公众号订阅、X 订阅、通用 RSS、同步任务、历史采集”。移动端列表转卡片，状态和原文按钮优先可见；密钥设置独立弹窗，禁止表格直接展示完整链接。');

H('6. 增量同步、修订与去重规则');
P('以下频率是本项目建议，不是供应商 SLA：内容流默认每 30 分钟轮询，任务加随机错峰；订阅名单每日核对一次，并提供“立即刷新”。首次只处理供应商可提供的近三天资料，用户可选择其可用历史全量。过短轮询不会消除供应商本身的收录延迟。');
T(['场景','建议规则','完成条件'],[
 ['首次同步','逐源分页读取，先持久化再推进进度；有效范围写入覆盖说明','不会因空列表或账户刚订阅而显示“全历史同步完成”'],
 ['后续增量','重读首页并覆盖最近七天，结合稳定 ID＋哈希去重；周度核对可用旧记录','覆盖延迟收录及正文补齐；老记录改动不得只靠发布时间水位发现'],
 ['分页漂移','本轮保存开始水位；连续边界重叠并回扫首页；中断可重放','并发新帖造成页码位移时不丢数据；不要承诺无快照接口下的绝对一致性'],
 ['正文为空','存元数据并标 pending_body；单独延迟复查','无正文不生成全文向量、强事实关系或“全文已处理”状态'],
 ['短推文','短文本可独立为完整推文，不套用文章最小长度门槛','“短而完整”与“仅长文摘要”分别判断'],
 ['正文修订','版本哈希变化后生成新版本，重新分类／抽取／翻译／向量化','旧研究保留所引版本；未更新资料不重复消耗模型调用'],
 ['跨渠道重复','外部身份优先；精确原文 URL 辅助；内容近似仅聚合不删除出处','同一文章旧库与新供应商记录合并溯源，不丢来源证据'],
 ['X 两条流重复','按内容类型＋稳定标识区分；推文引用长文建立“指向”关系','不因标题相似自动把两种内容合成同一条原文'],
 ['失败与恢复','单源失败隔离；账号失效暂停受影响任务；续费后从可用水位恢复','漏采时间范围可见；不能承诺补回供应商未收录的断档'],
 ['删除／失效','供应商列表中消失不自动推断源文删除','保留历史证据；原链不可用时单独标注可访问性']
]);
P('正文、媒体和外链分别处理：首期保存媒体 URL 与类型，不默认下载视频，不声称读取图片文字。需要 OCR／视频转写时单独建任务、标明证据介质。抓取外链不得覆盖原帖子；禁止将付费凭据发送给外链域名。');

H('7. 接入现有 AI 与证据处理流程');
P('建议处理依赖：规范化原文 → 正文完整性／语言／主题初筛 → 原文抽取与中文翻译 → 证据校验、主题复核 → 向量与检索索引 → 智库发布。抽取应以原文为依据，翻译不必强制先于抽取；当前 pipeline-worker 先抽取后翻译可以继续复用。');
T(['处理阶段','必须满足的行为','输出状态'],[
 ['主题过滤','围绕海洋油气、海上风电、海洋能、海工装备、海底 CCS 与相关运输政策；宽泛能源内容需有海洋关联','accepted／rejected／needs_review；短帖上下文不足时待复核，不直接丢弃'],
 ['抽取','复用 auto-extract，输出实体、事件、关系、指标；先验证来自哪一层帖子','四类可为空；“零条关系”不等于失败；不得把账号认证当事实认证'],
 ['翻译','中文原文跳过；外文保留原文＋中文；名称、单位、预测和引述忠实保留','独立 translation 状态，不让摘要成功掩盖正文失败'],
 ['引用校验','片段必须来自指定版本及指定作者段落；校验 ID、位置、数值、单位','校验通过只说明有文本依据，仍为待核验主张'],
 ['指标归档','区分实际、计划、预测、设计能力；区分发布日期与统计期','指标来源可追溯；多条新闻数字不能直接拼为同口径趋势'],
 ['向量化','按原文／译文版本及模型签名建索引；长文切片，不静默截断','只有当前版本完成才标 ready；不混用模型维度'],
 ['智库投递','outbox 幂等写入 ocean_intel 并合并，不覆盖人工审核结果','原版文章 ID 与智库文档 ID 可互查；发布成功后才确认投递'],
 ['问答与地图','返回原平台、作者、发布时间、原文链接及证据；地图只使用有证据的位置','收录热度不冒充产业规模；引用多篇转载不算多份独立证据']
]);
P('建议处理 worker 持续消费持久化任务，初期模型并发 2，不设每轮 8 篇限制；每篇／每阶段保存进度，超时续跑与指数退避。沿用现有采集发布锁和合并函数，先做增量可靠性，再将整批快照任务迁移到持久队列；这部分是拟开发改造，不是当前已存在的全天候队列。');
P('费用控制采用“内容未变化不重做、先过滤后深加工、失败退避、日用量可见”。即便正文采集无总篇数限制，也需遵守供应商限流与大模型账户额度；模型余额不足时保留原文并暂停加工，不影响其他无需模型的采集。');

H('8. 最小数据结构与代码改动清单');
T(['拟新增／扩展对象','代表字段（非完整 DDL）','原因'],[
 ['provider_accounts','provider、credential_ref、health、expires_at_manual','凭据与展示数据隔离；人工填入的到期日标明来源'],
 ['source_bindings','source_id、provider_account_id、platform、provider_source_id','同一历史公众号关联新供应商身份；X ID 全程字符串'],
 ['subscription_streams','binding_id、content_kind、enabled、watermark、next_run_at','账号与推文／长文流分离，单独统计进度'],
 ['provider_items／版本','provider_item_key、canonical_url、raw_payload_ref、hash、version_id','供应商投递幂等；保存修订与原始证据'],
 ['articles 扩展','platform、content_kind、content_format、content_status、origin_author、origin_published_at','不再用 sourceType=rss 代替内容实际平台；未知日期需可空迁移'],
 ['delivery_outbox／jobs','article_id、version_id、stage、attempts、next_retry_at、lease_until','进程重启不丢任务；旧版与智库间可靠投递'],
 ['evidence 元数据','document_version、segment_id、origin_author、origin_url、quote_offsets','X 引用、转推、线程分别保留证据归属']
]);
P('公众号外部身份建议：供应商＋平台＋mpId＋articleId；X 推文：平台＋postId；X 长文：平台＋规范化原始 URL，后续若确认稳定文章 ID 再补充映射。文章本体去重和订阅账号的“发现该内容”记录分别保存。同一帖被多个订阅账号引用，不能因此新建多个同源事实。');
P('公众号 URL 规范化只剔除确认无关的跟踪参数，不可盲删 __biz、mid、idx、sn 等定位信息。X handle 变更不新建账号；无法确认子帖 ID 或作者时保存原始嵌套结构和“归属待核”，不要编造可点击原链。');
T(['开发文件范围','建议新增／修改内容','优先级'],[
 ['server/utils/providers/mp2rss.ts（新增）','后端认证、分页、错误映射、退避；连接只使用供应商允许域名','P0'],
 ['server/utils/providers/normalize-social.ts（新增）','公众号／X 三类适配、版本与作者段落映射','P0'],
 ['server/db/schema.ts + 迁移','供应商映射、任务、版本、outbox；兼容已有 sources/articles','P0'],
 ['server/api/subscriptions/*（新增）','脱敏账户配置、导入列表、流开关、手动同步、状态查询','P0'],
 ['pages/wechat/* 与相关导航组件','统一管理入口；扫码组件仅用于旧采集','P0'],
 ['server/api/rss/*、rss-parser.ts、import-rss.post.ts','凭据泄露点、不限量语义、原链被替换、未知日期问题','P0（先修后接付费链接）'],
 ['intelligence/import-provider-items.mjs（拟新增）','文章库到智库标准文档桥接，outbox 幂等确认','P0'],
 ['pipeline-worker、auto-extract、enrich、store','复用并增加内容类型、作者归属、版本级状态；迁移持久队列','P1'],
 ['tests/unit + intelligence/tests','契约样本、跨库投递、幂等、短帖、引用归属、密钥脱敏测试','P0／P1']
]);

H('9. 分阶段落地与回滚');
T(['阶段','交付成果','上线门槛'],[
 ['A：只读联调','验证凭据、订阅清单，分别拉取公众号／X 推文／X 长文样本','仅测试真实已订阅账号；正文、日期、原链可核对；空列表不伪装通过全文验证'],
 ['B：采集接管','修复 RSS 隐患；迁移映射；账号管理、采集与出错状态可用','先选两个公众号、两个 X 账号灰度；旧历史数量与审核结果不变'],
 ['C：智库贯通','版本、outbox、自动处理和溯源展示连通','新内容可从订阅列表追到原文、证据和问答；失败可重试'],
 ['D：全量切换','扩大到用户指定账号，定时同步、告警与历史覆盖说明完善','至少观察两个实际轮询周期；有真实新增或受控重放验证，不仅检查页面 HTTP 200']
]);
P('切换前导出现有源与文章数量、备份配置和映射；新连接器先写隔离暂存并与旧文章去重。验证后停用失效扫码采集任务，保留旧文章及入口，不执行删除会话／历史数据等无关清理。失败时关闭 Mp2RSS 本地流并保留已取得资料，原有 EIA、官网及 RSS 任务继续运行。不要为了接新源修改现有其他服务的 Nginx location。');

H('10. 验收用例与成功标准');
T(['用例','必须观察到的结果'],[
 ['凭据正确／无效／到期','成功可列出账号；错误不泄露 key，状态准确，失败不会清空旧订阅'],
 ['同一 X 账号开启两条流','一个账号，两套进度；某流无内容不使另一流失败'],
 ['超过一页的数据','公众号及 X 分页各按自身契约完整处理；无固定 8／50 条总量截断'],
 ['重复轮询、重复投递','重复数增加而文章／事件不重复；旧人工审核结果保留'],
 ['中断与重启','从持久化任务继续；上次成功进度不被失败页提前推进'],
 ['摘要先到、正文后补','pending_body 更新成完整新版本，自动进入后续处理'],
 ['短推文与长线程','完整短帖不被文章长度阈值误删；各段引用可定位、作者不串位'],
 ['转推／引用／外链','引用保留被引用者；外链不覆盖原帖；转推不能自动变为“合作”'],
 ['中文／英文','中文不重复翻译；英文完成后显示译文；原文和数字可核对'],
 ['无关能源资讯','明确排除原因；待复核内容不计入海洋主题成果'],
 ['两库桥接失败','文章已保存但智库待投递，恢复后自动补投，无静默丢失'],
 ['原文修改','新版本使旧处理状态失效；历史报告引用版本仍可追溯'],
 ['安全显示','前端响应、日志、报表、页面原链均不包含 Feed 密钥；正文 HTML 经净化'],
 ['统计口径','显示采集量、独立文章、有效事件、完成加工分别计数；订阅起点前无数据不填零'],
 ['旧功能回归','历史公众号、EIA、其他 RSS 与官网内容仍可检索；无源名误合并']
]);
P('新来源入库不应默认“已核验”。抽取引用通过校验后仍是待核验候选；问答须区分机构自述、媒体转述与多源印证。需要展示趋势时，只采用同口径指标或明确标注“当前收录量”，尤其不能用新订阅后的不完整时间窗推断全年行业变化。');

H('11. 用户需要提供什么，哪些无需提供');
T(['材料','建议提供方式','用途'],[
 ['Feed 密钥（优先）','在服务器独立受限配置中保存，或后续通过本系统仅写入式密钥表单配置','同一账户读取公众号和 X 的订阅及内容；不需要微信 Cookie'],
 ['付费订阅链接（替代）','若只能提供链接，分别给一个公众号、X 推文、X 长文样本；按敏感凭据处理','验证 Feed 类型、来源和正文；不自动把“提供链接”视为授权增删远端订阅'],
 ['目标账号清单','公众号名称＋代表文章链接；X @handle＋是否要推文／长文','核对主体、排除同名账号，建立旧源映射'],
 ['X 控制台订阅','先在 Mp2RSS 控制台完成目标账号订阅','本系统读取已订阅账号，无需提供 X 登录密码'],
 ['套餐确认信息','档位、到期日、订阅建立时间；不需要付款凭证或支付密码','容量规划、覆盖起点及续费提醒'],
 ['真实样本','优先选择已经有新内容的账号；长文为空时另选实际发布过长文的样本','验证正文、转推、线程与空值；空列表不能替代解析验收']
]);
P('Feed 密钥与链接具有访问能力，完整付费链接不应进入代码仓库、普通业务日志或公开文档。本文所有接口仅使用占位符。首期建议只授权读取已订阅内容，公众号新增／取消功能在用户明确操作时才触发。');
P('现阶段不用购买 X 官方开发者 API 来配合本方案，也不需要恢复公众号扫码作为前置条件；但真实覆盖取决于 Mp2RSS 的收录能力。若后续需要订阅前历史、媒体原件或更低延迟，应作为单独需求向供应商确认，不能用现有套餐名称推定支持。');
R('依据：官方快速开始（Feed 密钥与账号接入）','https://areyoubugcoder.github.io/Mp2RSS/guide/quick-start.html');
P('官方当前列出 50／100／400 个信息源档位，分别为 49／99／399 元、30 天；公众号和 X 合计占用，功能差异主要在数量上限。用户已有付费账户可先复用，不建议在联调前重复购买；价格与权益以付款时控制台为准。');
R('依据：官方会员与计费','https://areyoubugcoder.github.io/Mp2RSS/guide/membership.html');

H('12. 开发决策清单');
P('已建议确定：API 主路径；公众号与 X 共用供应商账户；X 两条流独立开关；原文来源与获取供应商分开；旧历史保留；本地暂停与远端退订分开；持续任务不设固定篇数总量上限。');
P('待真实样本确认：X 原链接及嵌套归属字段、Markdown 正文完整率、历史保留范围、修订可见性、会员状态接口是否另有公开支持、供应商获取与本系统 AI 使用范围。以上确认前不标记“已打通”。');
P('交付状态说明：本次完成的是可执行的开发需求和代码差异清单。取得凭据后先完成 A 阶段只读联调，再按 B—D 实施；本文件不代表付费源已接入线上系统。');

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const body=blocks.map((b,i)=>b.type==='h'?`<${i===0?'h1':'h2'}>${esc(b.text)}</${i===0?'h1':'h2'}>`:b.type==='p'?`<p>${esc(b.text)}</p>`:b.type==='r'?`<p class="ref"><a href="${esc(b.url)}">${esc(b.label)}</a></p>`:`<div class="table-wrap"><table><thead><tr>${b.heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('\n');
fs.writeFileSync(path.join(out,base+'.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${base}</title><style>@page{size:A4;margin:16mm 14mm 18mm}*{box-sizing:border-box}body{font-family:'Microsoft YaHei',sans-serif;color:#193047;background:#eef3f7;margin:0;line-height:1.65}main{max-width:1100px;margin:30px auto;padding:45px;background:white}h1{font-size:29px;border-bottom:4px solid #168e96;padding-bottom:20px}h2{font-size:20px;color:#09666e;margin:30px 0 14px;break-after:avoid}p{font-size:14px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:14px 0}th,td{border:1px solid #cddae4;padding:10px;vertical-align:top;font-size:12px;overflow-wrap:anywhere}th{background:#dfedf1;text-align:left}tr:nth-child(even){background:#f6f9fb}tr{break-inside:avoid}thead{display:table-header-group}.ref{font-size:12px;color:#526575}a{color:#087a89}@media(max-width:600px){main{margin:0;padding:18px}h1{font-size:24px}th,td{padding:6px;font-size:11px}}@media print{body{background:white}main{margin:0;padding:0;max-width:none}h1{font-size:23px}h2{font-size:16px}p{font-size:10.5px}th,td{font-size:9px;padding:6px}}</style><main>${body}</main></html>`);
const children=blocks.map((b,i)=>{
 if(b.type==='h')return new Paragraph({text:b.text,heading:i===0?HeadingLevel.TITLE:HeadingLevel.HEADING_1,keepNext:true,spacing:{before:250,after:160}});
 if(b.type==='p')return new Paragraph({children:[new TextRun(b.text)],spacing:{after:130}});
 if(b.type==='r')return new Paragraph({children:[new ExternalHyperlink({link:b.url,children:[new TextRun({text:b.label,style:'Hyperlink'})]})],spacing:{after:140}});
 return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[b.heads,...b.rows].map((r,idx)=>new TableRow({tableHeader:idx===0,cantSplit:true,children:r.map(t=>new TableCell({shading:{fill:idx===0?'DFEDF1':idx%2?'FFFFFF':'F6F9FB'},children:[new Paragraph({children:[new TextRun({text:t,bold:idx===0,size:19})],spacing:{after:80,before:60}})]}))}))});
});
(async()=>{
 fs.writeFileSync(path.join(out,base+'.docx'),await Packer.toBuffer(new Document({title:base,creator:'项目开发方案',styles:{default:{document:{run:{font:'Microsoft YaHei',size:21}}}},sections:[{properties:{page:{margin:{top:850,bottom:850,left:800,right:800}}},children}]})));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});await page.goto(require('url').pathToFileURL(path.join(out,base+'.html')).href);
 await page.pdf({path:path.join(out,base+'.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center">Mp2RSS 订阅管理改造 · 开发设计，尚未接入　<span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 await page.screenshot({path:path.join(out,'preview.png')});await page.setViewportSize({width:390,height:844});const check=await page.evaluate(()=>({mobileOverflow:document.documentElement.scrollWidth>innerWidth,headings:document.querySelectorAll('h2').length,tables:document.querySelectorAll('table').length}));
 await browser.close();console.log(JSON.stringify({out,...check}));
})().catch(e=>{console.error(e);process.exit(1)});
