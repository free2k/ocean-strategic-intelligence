# 页面资料加载

`GET /api/data` 保持完整兼容。页面可以传 `projection=summary|relations|full`，只缩减本次传输的字段，不修改入库数据。`scopeCounts` 保留筛选范围的真实数量。原文、证据、处理检查点和历史版本继续通过原接口读取；关系图保留全部关系及其引用证据。

主服务支持原生 projection。后台采集、AI 处理或归档运行时，不能为这次优化重启主进程。此时使用 `workspace-data-server.mjs`：它只监听本机 3104，向主服务转发登录 Cookie、全部筛选条件和只读请求，再在内存中整理响应，不连接数据库，不启动后台任务。主服务以后正常重启时，适配服务会直接保留主服务返回的原生 projection。

在当前版本的文件已备份、语法与数据完整性校验通过后，启动：

```sh
pm2 start /opt/ocean-intelligence/current/intelligence/workspace-data-run.mjs --name ocean-workspace-data --interpreter /usr/bin/node-20 --max-memory-restart 512M
```

将 `workspace-data.nginx.conf` 中的精确 location 放入原 server，执行 `nginx -t`，再平滑重载 Nginx。核对未登录请求、筛选条件、完整旧接口、三个 projection、原文详情和历史版本，确认主服务及在途任务没有中断后执行 `pm2 save`。

回滚时先恢复原 Nginx location 并平滑重载，再删除本次新增的 `ocean-workspace-data` 进程并恢复本次前端程序备份。只回滚程序和路由，不恢复旧数据库或旧数据快照，以免覆盖期间新增资料。
