# Requirements Document

## Introduction

本需求文档描述将 wechat-article-exporter 项目的核心功能集成到 knowledge-base 项目中的需求。集成后，knowledge-base 将作为独立项目维护，支持微信公众号扫码登录、公众号批量管理与导入、文章内容下载、以及代理节点配置等功能。所有数据存储在本地 PostgreSQL 数据库中，不依赖 Docker 或外部 wechat-article-exporter 项目。

## Glossary

- **Knowledge_Base**: 目标项目，基于 Nuxt 3 + Drizzle ORM + PostgreSQL 的知识库管理系统
- **WeChat_MP_Platform**: 微信公众号管理平台（mp.weixin.qq.com）
- **Proxy_Node**: 代理节点，用于转发对微信公众号文章内容的请求，绕过微信的访问限制
- **QR_Code_Login**: 通过扫描微信公众号平台二维码完成登录认证的流程
- **Auth_Key**: 登录成功后服务端生成的唯一认证标识，用于后续请求的身份验证
- **Cookie_Store**: 服务端存储微信登录 Cookie 的模块，用于代理请求时附带认证信息
- **Fakeid**: 微信公众号的唯一标识符
- **Account_Sync**: 从微信公众号平台拉取公众号文章列表并同步到本地数据库的过程
- **Article_Downloader**: 通过代理节点下载微信公众号文章 HTML 内容的模块
- **Proxy_Manager**: 管理多个代理节点的模块，负责节点选择、健康检查和负载均衡

## Requirements

### Requirement 1: 微信公众号扫码登录

**User Story:** As a 知识库管理员, I want 通过扫描微信公众号平台二维码登录, so that 系统可以获取访问微信公众号平台 API 的权限。

#### Acceptance Criteria

1. WHEN 用户发起登录请求, THE Knowledge_Base SHALL 向 WeChat_MP_Platform 请求登录会话并返回二维码图片
2. WHILE 用户尚未扫码确认, THE Knowledge_Base SHALL 每 2 秒轮询一次扫码状态
3. WHEN 用户扫码确认登录, THE Knowledge_Base SHALL 完成 bizlogin 流程并生成 Auth_Key 存储登录凭证
4. WHEN 登录成功, THE Knowledge_Base SHALL 返回公众号昵称和头像信息并在客户端保存登录状态
5. IF 登录会话超时或扫码失败, THEN THE Knowledge_Base SHALL 显示错误提示并允许用户重新获取二维码
6. THE Knowledge_Base SHALL 将登录获取的 Cookie 存储在服务端 Cookie_Store 中，有效期为 4 天

### Requirement 2: 微信公众号批量管理

**User Story:** As a 知识库管理员, I want 批量搜索、添加和管理微信公众号订阅, so that 可以集中管理多个公众号的文章来源。

#### Acceptance Criteria

1. WHEN 用户输入关键词搜索公众号, THE Knowledge_Base SHALL 通过 WeChat_MP_Platform 接口返回匹配的公众号列表
2. WHEN 用户选择公众号添加到订阅, THE Knowledge_Base SHALL 将公众号信息（fakeid、昵称、头像、类型）持久化到 PostgreSQL 数据库的 sources 表中
3. THE Knowledge_Base SHALL 在公众号管理页面展示所有已订阅公众号的列表，包含昵称、头像、文章数量和最后同步时间
4. WHEN 用户选择删除公众号订阅, THE Knowledge_Base SHALL 从数据库中移除该公众号及其关联的文章数据
5. WHEN 用户通过 JSON 文件批量导入公众号, THE Knowledge_Base SHALL 解析文件内容并批量创建公众号订阅记录
6. IF 导入的公众号 fakeid 已存在于数据库中, THEN THE Knowledge_Base SHALL 跳过该记录并在导入结果中标注为重复

### Requirement 3: 公众号文章列表同步

**User Story:** As a 知识库管理员, I want 从已订阅的公众号拉取文章列表, so that 可以浏览和选择需要下载的文章。

#### Acceptance Criteria

1. WHEN 用户触发某个公众号的文章同步, THE Knowledge_Base SHALL 通过 WeChat_MP_Platform 的 appmsgpublish 接口分页获取文章列表
2. THE Knowledge_Base SHALL 将同步到的文章元数据（标题、链接、封面、摘要、作者、发布时间）存储到 PostgreSQL 数据库的 articles 表中
3. WHILE 文章列表尚未加载完毕, THE Knowledge_Base SHALL 按每页 20 条的分页大小继续请求下一页
4. WHEN 文章列表同步完成, THE Knowledge_Base SHALL 更新该公众号的最后同步时间和文章总数
5. IF 请求返回 session expired 错误（ret=200003）, THEN THE Knowledge_Base SHALL 清除登录状态并提示用户重新登录
6. WHEN 用户输入关键词搜索文章, THE Knowledge_Base SHALL 通过 WeChat_MP_Platform 接口按关键词过滤文章列表

### Requirement 4: 公众号文章内容下载

**User Story:** As a 知识库管理员, I want 通过代理节点下载公众号文章的完整 HTML 内容, so that 可以在本地保存和分析文章全文。

#### Acceptance Criteria

1. WHEN 用户选择文章并触发下载, THE Article_Downloader SHALL 通过 Proxy_Node 请求文章的完整 HTML 内容
2. THE Article_Downloader SHALL 支持并发下载，默认并发数为 3，并在下载过程中显示进度（已完成/总数）
3. WHEN 文章 HTML 下载成功, THE Knowledge_Base SHALL 将文章内容存储到 articles 表的 content 字段中
4. IF 文章已被删除, THEN THE Article_Downloader SHALL 标记该文章状态为已删除并通知用户
5. IF 文章下载失败且未超过最大重试次数, THEN THE Article_Downloader SHALL 切换到其他可用代理节点重试下载
6. WHEN 下载任务完成, THE Knowledge_Base SHALL 显示下载统计信息，包含成功数、失败数和已删除数
7. THE Article_Downloader SHALL 支持用户手动停止正在进行的下载任务

### Requirement 5: 代理节点配置与管理

**User Story:** As a 知识库管理员, I want 配置和管理代理节点, so that 可以通过代理访问微信公众号文章内容。

#### Acceptance Criteria

1. THE Knowledge_Base SHALL 提供代理节点配置界面，支持添加、编辑和删除私有代理节点地址
2. THE Knowledge_Base SHALL 内置公共代理节点列表作为默认可用节点
3. WHEN 代理节点请求失败, THE Proxy_Manager SHALL 记录失败次数并降低该节点的优先级
4. WHEN 代理节点请求成功, THE Proxy_Manager SHALL 记录成功并提升该节点的优先级
5. THE Knowledge_Base SHALL 支持配置代理节点的 Authorization 认证头信息
6. THE Knowledge_Base SHALL 将代理节点配置持久化到本地数据库或配置文件中，重启后配置不丢失

### Requirement 6: 登录会话管理

**User Story:** As a 知识库管理员, I want 系统自动管理登录会话的生命周期, so that 不需要频繁重新登录。

#### Acceptance Criteria

1. THE Cookie_Store SHALL 在服务端内存中缓存登录 Cookie，并支持通过 Auth_Key 检索
2. WHEN Cookie_Store 内存缓存未命中, THE Cookie_Store SHALL 从持久化存储（本地文件或数据库）中加载 Cookie
3. WHEN 登录凭证过期（超过 4 天）, THE Knowledge_Base SHALL 自动清除过期凭证并提示用户重新登录
4. THE Cookie_Store SHALL 使用 LRU 策略管理内存缓存，最大缓存条目数为 1000
5. WHEN 用户主动登出, THE Knowledge_Base SHALL 清除服务端 Cookie_Store 中的对应凭证和客户端登录状态

### Requirement 7: 数据存储本地化

**User Story:** As a 知识库管理员, I want 所有数据存储在本地 PostgreSQL 数据库中, so that 不依赖外部服务或 Docker 容器。

#### Acceptance Criteria

1. THE Knowledge_Base SHALL 使用 Drizzle ORM 管理所有数据库表结构和迁移
2. THE Knowledge_Base SHALL 在 sources 表中存储公众号订阅信息，包含 fakeid、名称、头像、类型等字段
3. THE Knowledge_Base SHALL 在 articles 表中存储文章数据，包含标题、链接、内容、来源关联、发布时间等字段
4. THE Knowledge_Base SHALL 提供数据库迁移脚本，用户通过 `npm run db:migrate` 命令即可完成数据库初始化
5. THE Knowledge_Base SHALL 通过环境变量 DATABASE_URL 配置本地 PostgreSQL 连接信息
