# 战略研究工作台接口与持久化

沿用现有 `intelligence/server.mjs` 的共享口令、会话和POST同源检查。所有研究API均在认证后路由。无新增采集任务、付费模型调用或数据库迁移。

| 接口 | 行为 |
|---|---|
| GET /api/strategy/catalog | 198条目录、独立引擎状态与数据状态、实际序列覆盖（以返回值为准）、分类推荐、可扩展长期跟踪研究主题库、参数治理、分页摘要 |
| POST /api/strategy/match | 按任务与结构匹配MCDA/经济性/因果/优化等设计，返回理由及专属前提 |
| POST /api/strategy/validate | 完整嵌套类型、逐格来源、硬约束和方法前提核验；可进行确定性诊断但不保存研究 |
| POST /api/strategy/studies | 核定后计算并保存；requestId幂等；首次201，重放200，键与内容冲突409 |
| GET /api/strategy/studies?page=1&pageSize=20 | 分页摘要，不读取全部完整结果；支持studyId筛选 |
| GET /api/strategy/studies/:versionId | 完整冻结快照、来源、配置、结果、诊断与差异 |
| POST /api/strategy/studies/:versionId/reproduce | 原输入＋原可执行算法重现，另存新版本；无需当前来源仍存在 |
| POST /api/strategy/studies/:versionId/recalculate | 按核定的当前范围重读平台数据，人工矩阵可恢复编辑；旧版不变 |
| GET /api/strategy/studies/:versionId/updates | 只读检查当前数据变化，提出人工更新建议，不自动保存或重算 |
| GET /api/strategy/studies/:versionId/export?format=json或md | 完整JSON或中文Markdown，包含输入、来源、参数、诊断、版本与差异 |
| POST /api/strategy/parameter-changes | 校验参数修改类别；事实/输出不可通过偏好、情景接口改写；冻结口径修订须有依据 |

请求继续兼容旧title/method/input或dataset/scope/provenance/confirmed/parentId。新界面使用schemaVersion=2、逐格cellEvidence、稳定对象及指标ID、requestId、studyId、parentVersionId、configuration、constraints、review。新建主题与首版分别生成ID；已有主题须引用父版本。

人工矩阵2—500对象、2—30指标。服务端拒绝数字字符串、空值、非有限值、不明方向、无来源、未核定来源、期间/性质不可比和硬约束冲突。官方序列只接收ID与范围，忽略浏览器替换数值。人工纠错继续使用既有数据明细治理流程：insightRevision、原值、前后记录与理由均有日志；不提供偏好接口越权纠错。

错误包含code/message/fieldErrors/requestId/persistence；字段路径如input.matrix.0.1并附objectId/indicatorId。400输入，401未登录，403禁止操作/跨站，404缺记录，409冲突，500保存或服务异常，503损坏记录不可读。保存成功与目录刷新失败在界面分别处理。

版本保存在现有INTEL_DATA_DIR/strategy-research：UUID.json为不可变完整版本，_index.json为可重建分页摘要。独占文件提交与进程内串行队列防止并发重复；requestId及请求指纹随版本保存，重启后可重放。坏记录隔离告警，原文件保留；旧记录通过显式父链归属主题，不按相似标题合并，不改写原JSON。

numericInputHash、evidenceHash、configHash分别解释数值、证据、配置变化。改变功能单位/边界/硬约束必须记录修订依据，产生新的参数配置版本；界面阻止把异口径结果解释为同口径分数比较。六类参数角色与只读输出随版本保存。

正式算法仅在服务端。TOPSIS继续min–max正向化后加权欧氏距离；未改为向量归一化。1.0.0与1.1.0可执行实现分别存档于strategy/engines。1.1.0保留并列、局部±20%权重扰动、九点扫描及完整诊断。九点扫描的剩余权重按原相对比例分配，无随机种子，不冒充输入误差或模型不确定性。

草稿保存在当前浏览器sessionStorage，按方法保留参数，矩阵按25行分页编辑以支持大表；切页签、切任务、切方法、刷新均恢复。退出先注销保存监听，再清理全部私密草稿。容量不足明确提示，未声称已经保存。500×30空矩阵已验证刷新恢复。


## 2026-10-18 范围选择器更新

GET catalog 新增 filterOptions：topics 为完整领域 id/name，countries 为系统支持的国家 code/name（含跨国口径 GLOBAL），sources 为当前登记渠道 id/name。选项清单不随当前筛选缩减；来源名称在界面展示，ID仅在请求中传递。

scope.country 继续使用字符串，支持逗号分隔多选，如 NO,US；服务端去重、排序，各国家之间按“或”匹配。文章按文档去重，统计序列、登记记录和IEA记录使用一致的国家条件；不会合并不同国家的原始数值。空字符串表示不限国家。原单国请求与历史版本保持兼容。

最近1/3/6/12个月按北京时间的当前日期计算日历月范围，月末向目标月最后一天收敛；选择时解析成固定的 scope.from/to 和期间说明。再次打开草稿保留原日期，旧版本保留原研究期间，不自动滚动到今天。默认可选择全部历史数据，也保留自定义日期入口。所有日期范围遵循既有统计期间重叠规则。

筛选变更自动刷新目录，进入后续步骤前再次核对目录范围；改变期间或国家等范围会撤销计算确认。输入及保存仍由服务端读取该冻结范围的真实序列。

## 2026-10-18 选择式研究输入

GET catalog 新增 inputOptions：objects（当前证据范围内的对象名称及类型）、references（实际入库资料/原表的URL与标题）、indicators（建议词典与平台统计指标）、units、relationTypes。对象来自当前纳入文档关联实体及当前登记记录，不生成虚构项目或专家。选项帮助定位，不表示数值已填入或完成核定。series摘要提供来源名称、URL、单位、频率、性质及实际统计期间，用于平台序列的只读来源展示。

功能单位、总体、边界、币值基年/口径、指标名称/单位/频率/方向/性质、常用参数、AHP判断标度及核定声明均采用选择控件。原始数值、具体原文、未登记身份/出处、精确自定义参数及特殊口径保留必要填写，通过aria-describedby关联可见原因说明。没有真实备选清单时直接解释并保留填写，不创建只有“自定义”的空下拉。

平台序列的来源由服务端保存，无须重复填写人工来源。自有数据可从入库原文、对象和单位清单选择，或填写有理由的自定义值。原表数值不生成预设档位；自定义权重、折现率等精度保留。常用参数属于研究设定，不能替代项目依据。固定赋权方法不再展示会被计算忽略的通用赋权选择。

年度/月度/季度统计期选择后仍保存为YYYY/YYYY-MM/YYYY-Qn；选择不完整时保持缺失。全部历史资料不能被批量声明为单元格的具体统计期。人工观测按25行分页，提交仍含全部记录。

choiceModes、choiceHistory和periodParts仅属于浏览器私密草稿，不进入计算或事实接口；继续兼容旧自由文本与保存版本。数值算法、研究版本格式和原始数据不迁移。

## 选题分类与长期跟踪主题（1.5.0）

GET /api/strategy/catalog 保留 recommendations、templates，新增 discovery：version、directions、industries、opportunities、counts、policy。同一 dataset.id 的方法归为一个 opportunity，actions 引用推荐的稳定ID。分类读取当前范围数据目录已发布的标准领域和结构化任务；政策序列单独进入政策治理方向。新增数据随目录重读自动归组，缺少受控元数据进入待核定分类，分类不会提高计算可用状态。研究方向互斥计数，领域标签允许交叉；仍按原数据前提优先级和稳定ID排序，无额外模型调用或未经标定的价值分。

主题登记 classification.directionId、industryIds、taskType、tracking.object、refreshTrigger 与 comparisonBasis。前端用稳定ID建立方案，不再维护模板ID到任务的固定映射。主题可扩展，页面数量动态读取；相关序列仅作为线索，所有主题 canExecute 始终 false，具体任务仍走独立输入核定。

选题页分“数据驱动选题”和“长期跟踪研究主题库”，支持研究方向、领域、任务、状态、关键词交叉筛选，每页最多6张卡片。先过滤方法再合并显示，避免状态筛选后出现不匹配入口；两个目录分别保存浏览器筛选与页码，浏览不会修改研究核定、请求ID或计算输入。当前目录在服务端生成，前端过滤及分页只渲染当前页；超过千组选题的工程样本验证了渲染上限。

长期跟踪指同一主题沿用可比对象、指标、期间、单位和方法，人工核定新数据后另建版本比较变化；当前未启用自动定时监测、提醒或后台复算。更新规则、数据缺口和方法边界在主题卡片中可查看。

## 自定义研究领域（1.5.1）

研究领域下拉新增“自定义”，选择后显示1—120字的实际领域名称输入。名称仍使用 scope.topic 字符串，随草稿、冻结版本、导出和原算法重现保存；choiceModes 与 customTopic 仅记住浏览器选择方式和上次自定义值，不进入研究请求。切回标准领域或全部领域时恢复原筛选方式，再选自定义可恢复已填名称。

自定义不新增全平台分类规则，也不将其他领域的资料或序列并入当前研究。已有筛选规则按实际名称匹配；没有已核定序列时明确提示，并允许使用有来源、经核定的人工数据。自定义名称为空时阻止进入后续步骤和保存计算。原标准领域、国家多选、来源和快捷期间逻辑保持兼容。
