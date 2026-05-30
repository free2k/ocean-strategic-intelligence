# Implementation Plan: WeChat Integration

## Overview

将 wechat-article-exporter 核心功能集成到 knowledge-base 项目中。实现分为数据层变更、核心服务层（CookieStore、ProxyManager、ArticleDownloader）、API 层、前端页面四个阶段，逐步构建并集成。

## Tasks

- [x] 1. 数据库 Schema 变更与迁移
  - [x] 1.1 为 articles 表新增 downloadStatus 字段
    - 在 `server/db/schema.ts` 的 articles 表中添加 `downloadStatus` 字段（varchar, 默认 'pending'）
    - 可选值：pending | downloaded | deleted | failed
    - _Requirements: 4.3, 4.4, 7.3_

  - [x] 1.2 创建 proxy_nodes 表
    - 在 `server/db/schema.ts` 中新增 `proxyNodes` 表
    - 字段：id, url, name, authorization, isPublic, enabled, failureCount, successCount, lastUsedAt, createdAt
    - _Requirements: 5.1, 5.6_

  - [x] 1.3 创建 wechat_sessions 表
    - 在 `server/db/schema.ts` 中新增 `wechatSessions` 表
    - 字段：id, authKey, token, cookies(jsonb), nickname, avatar, createdAt, expiresAt
    - _Requirements: 6.1, 6.2_

  - [x] 1.4 生成并应用数据库迁移
    - 运行 `npx drizzle-kit generate` 生成迁移文件
    - 确保迁移脚本可通过 `npm run db:migrate` 执行
    - _Requirements: 7.1, 7.4_

- [x] 2. CookieStore 服务实现
  - [x] 2.1 实现 CookieStore 类
    - 创建 `server/utils/wechat/cookie-store.ts`
    - 实现内存 LRU 缓存（最大 1000 条）+ JSON 文件持久化（`.data/wechat-cookies.json`）
    - 实现 `getCookie`, `setCookie`, `getToken`, `removeCookie`, `isExpired` 方法
    - Cookie 有效期 4 天，过期自动清除
    - 文件读写失败时降级为纯内存模式
    - _Requirements: 1.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 2.2 Write property test: CookieStore round-trip
    - **Property 1: CookieStore round-trip**
    - **Validates: Requirements 1.3, 6.1, 6.2**

  - [ ]* 2.3 Write property test: Cookie expiration
    - **Property 2: Cookie expiration**
    - **Validates: Requirements 1.6, 6.3**

  - [ ]* 2.4 Write property test: LRU eviction invariant
    - **Property 13: LRU eviction invariant**
    - **Validates: Requirements 6.4**

  - [ ]* 2.5 Write property test: Logout clears credentials
    - **Property 14: Logout clears credentials**
    - **Validates: Requirements 6.5**

- [x] 3. ProxyManager 服务实现
  - [x] 3.1 实现 ProxyManager 类
    - 创建 `server/utils/wechat/proxy-manager.ts`
    - 实现 `getBestProxy`, `recordFailure`, `recordSuccess` 方法
    - 节点选择策略：优先选择失败次数少的节点
    - 连续失败 5 次进入 60 秒冷却期
    - 所有代理不可用时重置最早使用的代理
    - 内置公共代理节点列表
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 3.2 Write property test: Proxy priority ordering
    - **Property 11: Proxy priority ordering**
    - **Validates: Requirements 4.5, 5.3, 5.4**

- [x] 4. Checkpoint - 核心服务层验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 认证模块 API 实现
  - [x] 5.1 实现获取登录二维码接口
    - 创建 `server/api/wechat/auth/qrcode.get.ts`
    - 向微信公众号平台请求登录会话，返回 base64 二维码图片
    - _Requirements: 1.1_

  - [x] 5.2 实现扫码状态轮询接口
    - 创建 `server/api/wechat/auth/status.get.ts`
    - 每次请求检查扫码状态（waiting/scanned/confirmed/expired）
    - 扫码确认后完成 bizlogin 流程，生成 authKey，写入 CookieStore
    - 返回公众号昵称和头像
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 5.3 实现登出接口
    - 创建 `server/api/wechat/auth/logout.post.ts`
    - 清除 CookieStore 中对应 authKey 的凭证
    - _Requirements: 6.5_

  - [x] 5.4 实现会话过期检测中间件
    - 创建 `server/utils/wechat/auth-guard.ts`
    - 检查请求中的 authKey 是否有效且未过期
    - 处理微信平台返回 ret=200003 时清除登录状态
    - _Requirements: 1.5, 3.5, 6.3_

  - [ ]* 5.5 Write property test: Session expired clears auth
    - **Property 7: Session expired clears auth**
    - **Validates: Requirements 3.5**

- [x] 6. 公众号管理模块 API 实现
  - [x] 6.1 实现公众号搜索接口
    - 创建 `server/api/wechat/accounts/search.get.ts`
    - 通过微信平台接口搜索公众号，返回匹配列表
    - _Requirements: 2.1_

  - [x] 6.2 实现公众号订阅接口
    - 创建 `server/api/wechat/accounts/subscribe.post.ts`
    - 将公众号信息（fakeid、昵称、头像、类型）写入 sources 表
    - _Requirements: 2.2, 7.2_

  - [x] 6.3 实现已订阅公众号列表接口
    - 创建 `server/api/wechat/accounts/index.get.ts`
    - 返回所有 type='wechat' 的 sources 记录，包含文章数量和最后同步时间
    - _Requirements: 2.3_

  - [x] 6.4 实现删除公众号订阅接口
    - 创建 `server/api/wechat/accounts/[id].delete.ts`
    - 删除 source 记录及其关联的所有 articles 记录（级联删除）
    - _Requirements: 2.4_

  - [x] 6.5 实现批量导入公众号接口
    - 创建 `server/api/wechat/accounts/import.post.ts`
    - 解析 JSON 文件内容，批量创建订阅记录
    - 已存在的 fakeid 跳过并标注为重复
    - 返回 total/created/skipped 统计
    - _Requirements: 2.5, 2.6_

  - [ ]* 6.6 Write property test: Account subscription round-trip
    - **Property 3: Account subscription round-trip**
    - **Validates: Requirements 2.2, 7.2**

  - [ ]* 6.7 Write property test: Account deletion cascades
    - **Property 4: Account deletion cascades**
    - **Validates: Requirements 2.4**

  - [ ]* 6.8 Write property test: Batch import idempotency
    - **Property 5: Batch import idempotency**
    - **Validates: Requirements 2.5, 2.6**

- [x] 7. 文章同步模块 API 实现
  - [x] 7.1 实现文章列表同步接口
    - 创建 `server/api/wechat/articles/sync.post.ts`
    - 通过微信平台 appmsgpublish 接口分页获取文章列表（每页 20 条）
    - 将文章元数据（标题、链接、封面、摘要、作者、发布时间）写入 articles 表
    - 同步完成后更新公众号的最后同步时间和文章总数
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.2 实现本地文章列表查询接口
    - 创建 `server/api/wechat/articles/list.get.ts`
    - 支持按 sourceId 分页查询，支持关键词搜索
    - _Requirements: 3.6_

  - [ ]* 7.3 Write property test: Article metadata storage round-trip
    - **Property 6: Article metadata storage round-trip**
    - **Validates: Requirements 3.2**

- [x] 8. Checkpoint - API 层验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. 文章下载模块实现
  - [x] 9.1 实现 ArticleDownloader 服务
    - 创建 `server/utils/wechat/article-downloader.ts`
    - 实现并发下载控制（默认并发数 3）
    - 通过 ProxyManager 获取代理节点发起请求
    - 下载失败时切换代理重试（最多 3 次）
    - 检测文章删除标记，标记 downloadStatus='deleted'
    - 下载成功写入 content 字段，标记 downloadStatus='downloaded'
    - 支持手动停止下载任务
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 9.2 实现 SSE 下载进度推送接口
    - 创建 `server/api/wechat/download/start.post.ts`
    - 使用 SSE 实时推送下载进度事件（progress/completed/deleted/failed/finish）
    - 下载完成后返回统计信息（成功数、失败数、已删除数）
    - _Requirements: 4.2, 4.6_

  - [x] 9.3 实现停止下载接口
    - 创建 `server/api/wechat/download/stop.post.ts`
    - 通知 ArticleDownloader 停止当前下载任务
    - _Requirements: 4.7_

  - [ ]* 9.4 Write property test: Download concurrency limit
    - **Property 8: Download concurrency limit**
    - **Validates: Requirements 4.2**

  - [ ]* 9.5 Write property test: Article content storage
    - **Property 9: Article content storage**
    - **Validates: Requirements 4.3**

  - [ ]* 9.6 Write property test: Deleted article status marking
    - **Property 10: Deleted article status marking**
    - **Validates: Requirements 4.4**

- [x] 10. 代理节点管理 API 实现
  - [x] 10.1 实现代理节点 CRUD 接口
    - 创建 `server/api/wechat/proxy/index.get.ts` - 获取代理列表
    - 创建 `server/api/wechat/proxy/index.post.ts` - 添加代理
    - 创建 `server/api/wechat/proxy/[id].put.ts` - 编辑代理
    - 创建 `server/api/wechat/proxy/[id].delete.ts` - 删除代理
    - 支持配置 Authorization 认证头
    - _Requirements: 5.1, 5.5, 5.6_

  - [ ]* 10.2 Write property test: Proxy config persistence round-trip
    - **Property 12: Proxy config persistence round-trip**
    - **Validates: Requirements 5.6**

- [x] 11. Checkpoint - 服务端功能验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 前端页面与 Composables 实现
  - [x] 12.1 实现 useWechatAuth composable
    - 创建 `composables/useWechatAuth.ts`
    - 封装登录状态管理：isLoggedIn, nickname, avatar, login, logout, checkStatus
    - 客户端保存 authKey 到 localStorage
    - _Requirements: 1.4, 1.5_

  - [x] 12.2 实现 useWechatDownload composable
    - 创建 `composables/useWechatDownload.ts`
    - 封装 SSE 连接和下载进度管理：loading, progress, total, start, stop
    - _Requirements: 4.2, 4.6, 4.7_

  - [x] 12.3 实现微信公众号管理页面
    - 创建 `pages/wechat.vue`
    - 包含：扫码登录区域、公众号搜索与订阅、已订阅列表、文章列表与下载、代理节点配置
    - 登录状态展示昵称和头像
    - 公众号列表展示文章数量和最后同步时间
    - 下载进度实时展示（已完成/总数）
    - _Requirements: 1.4, 2.3, 4.2, 4.6_

- [x] 13. Final checkpoint - 全功能集成验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Cookie 存储使用本地 JSON 文件（`.data/wechat-cookies.json`），不依赖数据库
- 所有微信平台 API 调用在服务端完成，前端不直接访问微信平台
