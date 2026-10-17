# T00 基线核对

基于 fdfe3d6，在隔离工作副本 knowledge-base-strategy、分支 codex/strategy-workbench 开发。原工作区无未提交变更。未发现适用的 AGENTS.md。

本地10项目标文件均匹配交接包原版 SHA-256（新增文件均不存在），已通过安装工具校验后集成预写基线。

线上为 /opt/ocean-intelligence/current -> releases/20261016T154133Z；PM2 ocean-intelligence，入口 intelligence/run.mjs -> server.mjs；端口3101，Nginx代理。

持久化目录 /opt/ocean-intelligence/data，另有 PostgreSQL ocean_intel/classification 等现有表。沿用原认证 ocean_auth/site_auth 与POST同源校验。部署不迁移、不导入、不覆盖任何原数据。

线上 app.js 和 index.html 去除CRLF后与原版相同；quant-routes仅静态白名单差异。线上server新增processing-live/processing-runs及运行状态，逐项合并保留。只部署显式代码清单，保留线上其它差异。

| 文件 | 原版SHA-256 | 预写SHA-256 |
|---|---|---|
|intelligence/public/app.js|611a1f569ce16b42969625784f0c657c7ff2c6859d301c1fa87902014701e7bc|08c2dbaf79273bf85a2ca8eb2efdac45c9d2aba94c13836b404bcb729621a99f|
|intelligence/public/index.html|966a5dd9a976736d639723deedc77f5fa0863af0893b2347a2db73bf3cb66efa|fd173dc399ccb71c951f6be22edb90c1c144631e64400766cb18a616628d1e73|
|intelligence/public/strategy-workbench.css|不存在|4c2b4c8521b5cacfe1ae552521724d76d9e7febcfcfc09dbd2f85226d547ae5b|
|intelligence/public/strategy-workbench.js|不存在|b60691aae11330ac0c8c852daa520976749af335c37ad1ad4d2a6fe3eec060d3|
|intelligence/quant-routes.mjs|623d6e2f40e78b729521c8fbeca7a6eee053eeb2a1a9a56410389d6ef8fd71c4|49e66386f0f6cc6ebfd7e5fa146fa2840f5929afd3cda6a2bd5a75311a6616fc|
|intelligence/server.mjs|882145c4f67478a684888f138ba9c83af14a9a12f5f8b733064e688665e55dd4|6674987d96764137aaba814bb0f17388967ae5554ccf8f88e432ca726e7d6e94|
|intelligence/strategy/engine.mjs|不存在|fe968b0a5a863edf7931ea0262d6a67253e380d9cd578805ae6915c9dc2443a6|
|intelligence/strategy/methods.json|不存在|0b1cb72632705ba92e674c53812aeb325e2edca45d7aa59a5576b9630a9419cc|
|intelligence/strategy/service.mjs|不存在|f5a90e048170f7dfb8252202bddd39206f99eda0a8aaba75af83ccfb992dc61f|
|intelligence/tests/strategy-engine.test.mjs|不存在|59db1716af25e7b82aee6f5472fe51dc0e8f2db111730055504ca5fc95eb4a38|
