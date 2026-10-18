# 腾讯云发布、备份与回滚

目标服务为49.233.77.111上的PM2 `ocean-intelligence`，Nginx入口为 `/ocean-intelligence/`。主知识库及原数据库不重新安装。现有环境配置、口令、采集调度和数据连接保持原配置。

本次只发布29个显式程序文件。完整程序版本位于 `/opt/ocean-intelligence/releases/20261018-strategy-workbench-1.2.0`。`current`指针切换前，核对每个旧程序SHA-256，遇到并行变更拒绝覆盖；本次检测到处理面板样式更新，已从发布清单排除并保留。切换前再次复制发布范围外的线上改动。取得原发布维护锁并确认采集、处理及报告任务空闲后才重启服务，失败自动回切旧程序。

## 备份

受保护目录：`/opt/ocean-intelligence/backups/strategy-workbench-20261017`（以任务开始日命名）。

- `data/`：原业务目录完整文件备份，使用同文件系统CoW复制，210540个文件，33985652006字节；不将旧快照写回现有数据目录。
- `data-manifest.before.json`：全部原文件SHA-256；`data-stat.before.json`：切换前文件元数据；`data-verification.json`：切换后核对。
- `database.dump`：原PostgreSQL数据库完整custom-format备份，目录和备份仅管理员可访问；`database-counts.backup.json`保留备份时点计数，`database-counts.before.json`及`database-verification.json`核对切换前后各表行数。
- `program-before.tar.gz`和`previous-release.txt`：旧程序和旧版本位置；`deployment.json`记录本次实际切换。

不运行数据库迁移、全量导入、采集或数据快照覆盖。新研究版本仍保存在现有INTEL_DATA_DIR/strategy-research，程序更新不携带任何业务数据。

## 回滚程序

使用previous-release.txt核定旧目录，把current通过临时软链接原子切回，再执行 `pm2 restart ocean-intelligence`。验证 `/api/health`、原问答及数据洞察。只回滚程序，不恢复旧数据库或旧快照，以免覆盖发布后新增数据。

数据库和完整文件备份供灾难恢复使用，不能作为日常程序回滚步骤；如需恢复须另行核定恢复点与发布后增量。

## 验证

切换前：284项本地回归、30项云端定向测试、浏览器完整工程样本、13条生产官方序列只读适配。

切换后：检查PM2、公开地址、认证API、六入口、原问答历史、数据洞察、实际序列只校验不保存；核对所有原文件及数据库表行数。全部验证已完成。原文件零缺失、业务数据一致；数据库原记录保留，原后台仍可正常追加同步状态。业务快照仅刷新原服务启动时的规则应用时间戳。公开地址浏览器验证通过，未在生产创建演示研究。详情见验收报告和受保护部署记录。


## 2026-10-18 范围选择器发布

当前版本为 /opt/ocean-intelligence/releases/20261018-strategy-filters-1.3.0，按显式清单发布15个程序/测试文件。发布前逐文件核对线上哈希；core.mjs 的既有 eventDates 更新在部署包中合并保留，其他发布范围外文件从线上版本带入。未导入数据或运行数据库迁移。

备份及校验记录在 /opt/ocean-intelligence/backups/20261018-strategy-filters-1.3.0：snapshot-before.json、data-before.json、previous-release.txt、deployment.json 和测试日志。旧程序版本原地保留，可仅切换 current 后重启回滚程序，不能回写旧业务快照。

切换在维护锁取得且采集、报告任务空闲后执行。发布前后业务快照哈希相同（仅排除服务原有启动流程刷新的规则应用时间），1484篇原资料、13条序列、772个数据点均保留；9张业务表的逐行ID及payload指纹相同，原有不可变研究文件指纹相同。

本地55项回归全部通过，原完整研究浏览器流程及1440/1024/390宽度、深浅主题通过。云端55项检查中54项通过，唯一Windows-1252解码断言在原运行版本同样失败，相关导入器和测试文件未改动，已记录为服务器Node 20环境的既有测试失败。未为本次UI更新改写该导入器。

公开地址浏览器核验通过：6个领域、32个国家/口径选项、190个登记来源；美国与挪威多选、来源筛选、快捷期间、旧草稿期间恢复及1440/390宽度均通过。最近半年筛选下的挪威序列以4个统计期完成只读校验，没有新增生产研究版本。记录见 evidence/filter-deployment.json 和 evidence/filter-production-browser-result.json。
