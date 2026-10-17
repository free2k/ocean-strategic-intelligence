# 战略研究工作台接口与持久化

沿用现有 `intelligence/server.mjs` 的共享口令、会话和POST同源检查。所有研究API均在认证后路由。无新增采集任务、付费模型调用或数据库迁移。

| 接口 | 行为 |
|---|---|
| GET /api/strategy/catalog | 198条目录、独立引擎状态与数据状态、13类以上实际序列覆盖（以返回值为准）、三态推荐、12模板、参数治理、分页摘要 |
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
