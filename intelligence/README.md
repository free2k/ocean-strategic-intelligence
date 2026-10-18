# 海洋能源战略智能智库 · 第一阶段

本模块在原仓库内独立运行，避免更改原站采集、数据库表和服务端口。界面参考既有智库布局，使用真实网页与RSS，所有原始内容保存在受访问密码保护的资料库。

## 模块导航

导航按信息获取、情报分析与研究应用的使用顺序排列：

1. 全球信息感知：来源覆盖、采集任务、更新状态和异常。
2. 情报证据中心：文章、原文、译文、来源链与证据摘录。
3. 产业动态监测：事件与报道线索、人工录入及文件识别。
4. 全球态势总览：已收录情报的地域分布、最新动态与国家关联。
5. 产业关联图谱：主体之间的关系及原文依据。
6. 产业数据洞察：统计序列、项目登记、指标对比与数据明细。
7. 战略研究工作台：证据检索、研究草稿、历史记录及简报导出。

未指定页面时默认进入“全球态势总览”。原有 `#sources`、`#library`、`#events`、`#dashboard`、`#graph`、`#analysis`、`#research` 链接保持有效。

## 页面响应优化

标签切换先显示对应页面，按同一筛选范围复用一分钟内的数据读取；刷新在后台完成，过期请求不会覆盖后来选择的页面。采集分类统计单独通过受登录保护的 `/api/source-funnels` 加载，不阻塞主数据接口；服务器合并并发统计读取并缓存一分钟。`/api/data` 支持 gzip，图表依据表格在展开时生成，原始记录保持完整。

程序重启不再写入采集状态文件；实际采集任务仍按原有流程保存状态。升级只替换程序文件，不执行采集、导入或数据库迁移。

国别态势研判支持全球汇总、单国档案和多国联合研判，案例与研判分别展示。领域、来源与北京时间发布日期筛选会核对成果实际引用的全部资料；完整证据不匹配时显示排除原因，并提供清除资料筛选的入口。

每份成果保留资料版本、原发布版本及固定版本原文入口。发布新资料版本后，旧成果仍可在“历史已发布成果”中查阅；历史成果单独标明版本，本期角色、关系与事件统计只使用当前版本记录。历史版本链接可刷新恢复，也可返回最新版本。

验证：`node --test intelligence/performance.test.mjs`，以及浏览器中的连续切换、慢请求、研究输入保留和绘图依据展开检查。

## 运行

Node.js 20.6+。复用项目已有的 pg、undici、linkedom、Readability、fast-xml-parser、openai 依赖。

```powershell
node --env-file=.env intelligence/collect.mjs
node intelligence/refine-snapshot.mjs
node --env-file=.env intelligence/import-series.mjs
node --env-file=.env intelligence/server.mjs
npm run test:intelligence
```

本地读取 `.data/intelligence/snapshot.json`。生产通过 `run.mjs` 使用已有 PostgreSQL 连接，但只创建/写入独立 `ocean_intel` schema。密码使用既有 `SITE_PASSWORD`。没有密码时默认不放行；仅本地开发可设置 `INTEL_ALLOW_NO_AUTH=true`。

## 配置

- `INTEL_DATA_DIR`：私有原件、快照与研究记录目录。
- `INTEL_DATABASE_URL`：可选；配置则数据库必须连接成功，不能静默降级。
- `INTEL_PORT`：默认3101，只监听127.0.0.1。
- `INTEL_BASE_PATH`：生产路径 `/ocean-intelligence/`，用于会话Cookie。
- `INTEL_SINCE` / `INTEL_UNTIL`：采集日期边界；第一批2026-01-01至采集当日。不是全量覆盖。
- `INTEL_MAX_PER_SOURCE`：每源本轮目标数量，默认12。
- `INTEL_ENABLE_AI`：默认关闭；只有明确配置为true，才会调用付费模型及embedding。
- 模型启用后复用 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`CHAT_MODEL`、`EMBEDDING_MODEL`。向量模型必须支持所配置的1024维，旧向量须重建。

## 已实现

四个资讯来源实例和EIA官方月度序列、低频RSS/网页发现、正文清洗、内容版本与片段、规则候选/模型提取、逐字证据校验、实体/关系/指标对象、关系人工核验、世界地图与地域共现、资料时间线、关键词检索、可选向量RRF、研究记录与TXT预览导出、CSV指标导出、密码访问、限流、移动端及日夜模式。

模型关闭时不会自动翻译外文或产生语义研判。首轮四篇在关闭前已完成模型提取，保留其记录和原文；后续规则输出统一标为候选。国家由报道提及产生，不等于项目坐标；地图虚线仅为地域共现。所有未审核数值不组成产业增长曲线。

## 更新与回滚

采集结果先写新快照；生产导入用 `node --env-file=.env intelligence/run.mjs --import`，再重启本模块。导入保留同ID的人工审核，原件版本独立存档。执行采集与导入时应由单一运维进程串行运行。当前未开启无人值守调度，后续增加数据库任务队列、来源健康报警和历史回补。

需要继续补齐：实体跨语别名消歧、跨文章事件归并、项目精确坐标、多语言全文翻译、更多连续指标端点、独立用户角色、持久化任务队列以及更大评测集。当前实现是可运行的第一阶段，不宣称V3文档所有阶段已完成。

## 验证记录（2026-10-09）

7项单元/持久化测试通过。本地与线上浏览器均通过7个页面、国家筛选、证据抽屉、无模型检索、TXT预览、日夜切换、390px布局检查；浏览器无未捕获错误。生产30篇资讯、4个资讯源及1个指标源，EIA31个月度值（2024-01至2026-07）。线上使用服务器访问密码，不保证与开发机.env密码相同。生产验收可通过SSH在内存生成短期测试会话，不在截图或日志记录密码与令牌。

生产部署采用独立进程与Nginx location，不覆盖原站。保留部署前Nginx配置与新模块目录备份，可还原配置后重载；数据库独立schema不删除。原站导航新增入口仅在未来部署原Nuxt版本时生效。

地图边界：Natural Earth公开数据，使用此前示例站公开静态资源中的同投影路径。仅作研究资料分布展示，国家点为代表位置，非精确项目点或航迹。
# 交互升级（2026-10-09）

## EIA API 接入（2026-10-09）

新增 `import-eia.mjs`，使用服务端 `.env` 中的 `EIA_API_KEY`。原 `import-series.mjs` 网页采集脚本保留用于人工排查，不要与 API 任务交替调度。

```powershell
# 本地网络需要代理时设置；服务器不能直接使用开发机的回环地址
$env:DOWNLOAD_PROXY='http://127.0.0.1:10808'
node --env-file=.env intelligence/import-eia.mjs
```

默认采集序列 `PET.MCRFP3FM2.M`：美国对应联邦海域海湾原油月度日均产量，单位千桶/日。API 返回历史数据，本地按 `EIA_START`（默认2024-01）过滤。该序列547条记录可一次完整取得；如果将来返回截断，脚本拒绝覆盖旧数据，需增加分页。

采集只更新本地快照中的目标序列和来源记录，保留其他资料。缺失值不补零，单位不符、重复月份及不完整响应均拒绝导入。`.data/intelligence/eia-history/` 保存本次响应数据与上次序列，便于审计历史修订；不保存API回显的请求密钥。采集时间与指标月份分开，API未给出的发布日期不推测。

生产采用PostgreSQL时，需要在同一部署目录依次执行采集、`node --env-file=.env intelligence/run.mjs --import`，再重启智库独立进程（核对实际PM2名称，不能重启原站代替）。文件模式也需要重启智库进程读取新快照。

生产部署（2026-10-09）：49.233.77.111 已启用 `ocean-eia-daily.timer`，每天 Asia/Shanghai 07:10运行，Persistent=true，关机错过任务将在恢复后补执行。独立密钥文件 `/opt/ocean-intelligence/eia.env` 权限600。服务器直连EIA成功，不依赖开发机代理。

`deploy/eia-daily.sh` 先采集到 `/opt/ocean-intelligence/eia-stage`，成功后短暂停止 `ocean-intelligence`，`publish-eia.mjs` 从PostgreSQL读取最新状态，仅合并EIA来源与序列，再启动智库并检查健康。原站 `knowledge-base` 不重启。发布前完整快照保存在生产数据目录 `eia-publish-backups`，API历史在暂存目录 `eia-history`。密钥不写日志或API返回。失败记录在systemd journal，尚未配置邮件告警。

任务用flock避免自身重叠，发布期间停止智库防止人工编辑冲突；其他运维导入脚本仍需串行执行，不可同时全量导入。未来更换current发布目录时需要包含eia.mjs、import-eia.mjs和publish-eia.mjs。手动执行：`systemctl start ocean-eia-daily.service`；查看：`journalctl -u ocean-eia-daily.service -n 50`；停用：`systemctl disable --now ocean-eia-daily.timer`。不要再创建重复调度。

验证：`node --test intelligence/tests/eia.test.mjs`。2026-10-09真实API调用成功，本地保留2024-01至2026-07共31个月值；最新2043千桶/日。该模块不调用大模型，不消耗百炼余额。

- 关键词检索先约束主体、国家及短关键词，再排序；包含中国海油/CNOOC、巴西/Brazil等别名。不调用外部模型，词典不代表完整语义理解。
- 实体关系按多个主体分组展开/收起；对象节点悬停或键盘聚焦显示来源，点击查看证据。国家选项仅保留当前领域/日期下有关系数据的国家。
- 量化分析新增官方月度序列热力矩阵和环比/同比散点图，附公式、数值、来源。国家选项仅显示有可用时间序列的国家；不把不同口径的零散指标拼成趋势。
- 情报事件可人工录入，原始链接、出处、证据、事件日期、发布日期必填，初始状态待核验。人工条目在后续采集导入时保留。
- 文章可触发规则实体关系提取，保留既有核验结果；词典与句内规则仍可能误判，新增关系不能直接当作事实。
- 采集仍为脚本人工触发，未启用定时刷新；全球信息感知隐藏页面筛选。刷新浏览器不触发采集。
- 验证：`npm run test:intelligence`；Node 测试通过加载器复用服务端的浏览器资源映射。国别成果用例覆盖全球／单国／多国、完整证据筛选、版本发布与历史原文；设置 `TEST_PROJECTION_DATABASE_URL` 可执行数据库投影验证。`qa-upgrade.cjs`覆盖新交互，默认使用隔离的3102本地实例；线上模式只检查录入表单，不写入测试事件。
