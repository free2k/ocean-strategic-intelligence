# 腾讯云发布、备份与回滚

目标服务为49.233.77.111上的PM2 `ocean-intelligence`，Nginx入口为 `/ocean-intelligence/`。主知识库及原数据库不重新安装。现有环境配置、口令、采集调度和数据连接保持原配置。

本次只发布29个显式程序文件。完整程序版本位于 `/opt/ocean-intelligence/releases/20261018-strategy-workbench-1.2.0`。`current`指针切换前，核对每个旧程序SHA-256，遇到并行变更拒绝覆盖；本次检测到处理面板样式更新，已从发布清单排除并保留。切换前再次复制发布范围外的线上改动。取得原发布维护锁并确认采集、处理及报告任务空闲后才重启服务，失败自动回切旧程序。

## 备份

受保护目录：`/opt/ocean-intelligence/backups/strategy-workbench-20261017`（以任务开始日命名）。

- `data/`：原业务目录完整文件备份，使用同文件系统CoW复制，209427个文件，33874823603字节；不将旧快照写回现有数据目录。
- `data-manifest.before.json`：全部原文件SHA-256；`data-stat.before.json`：切换前文件元数据；`data-verification.json`：切换后核对。
- `database.dump`：原PostgreSQL数据库完整custom-format备份，目录和备份仅管理员可访问；`database-counts.backup.json`保留备份时点计数，`database-counts.before.json`及`database-verification.json`核对切换前后各表行数。
- `program-before.tar.gz`和`previous-release.txt`：旧程序和旧版本位置；`deployment.json`记录本次实际切换。

不运行数据库迁移、全量导入、采集或数据快照覆盖。新研究版本仍保存在现有INTEL_DATA_DIR/strategy-research，程序更新不携带任何业务数据。

## 回滚程序

使用previous-release.txt核定旧目录，把current通过临时软链接原子切回，再执行 `pm2 restart ocean-intelligence`。验证 `/api/health`、原问答及数据洞察。只回滚程序，不恢复旧数据库或旧快照，以免覆盖发布后新增数据。

数据库和完整文件备份供灾难恢复使用，不能作为日常程序回滚步骤；如需恢复须另行核定恢复点与发布后增量。

## 验证

切换前：284项本地回归、30项云端定向测试、浏览器完整工程样本、13条生产官方序列只读适配。

切换后：检查PM2、公开地址、认证API、六入口、原问答历史、数据洞察、实际序列只校验不保存；核对所有原文件及数据库表行数。最终结果补记于验收报告和受保护部署记录。
