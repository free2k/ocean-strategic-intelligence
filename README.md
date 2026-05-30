# 海洋能源资源情报分析知识库系统

基于向量检索的文章知识库系统，支持微信公众号文章抓取、RSS 订阅、智能分类、摘要生成、向量化检索和智能问答。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Nuxt 3 (SSR) |
| 前端 UI | Nuxt UI + TailwindCSS |
| 图表 | ECharts |
| 数据库 | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| AI/LLM | OpenAI 兼容 API（支持阿里云 DashScope） |
| 向量化 | text-embedding-v4 / text-embedding-3-small |
| 文档导出 | docx、xlsx |
| RSS 解析 | fast-xml-parser |
| 运行时 | Node.js >= 20 |

## 功能模块

### 1. 微信公众号文章抓取

- **扫码登录**：通过微信公众平台扫码获取会话凭证
- **公众号管理**：搜索、订阅、导入公众号，管理关注列表
- **文章同步**：从已订阅公众号批量同步历史文章列表
- **文章下载**：通过代理节点下载文章正文内容
- **代理节点配置**：管理多个代理节点，支持负载均衡和故障转移

### 2. 文章管理

- **RSS 导入**：添加 RSS 源并定时同步文章
- **智能分类**：基于关键词规则自动分类（正向匹配目标行业 + 反向排除无关内容）
- **LLM 分类**：支持 LLM 语义分类作为关键词匹配的补充
- **摘要生成**：调用 LLM 自动生成文章摘要
- **向量化**：将文章拆分为 chunk 并生成向量嵌入，支持语义检索

### 3. 图表可视化

- **ECharts 图表**：基于文章数据生成可视化图表
- **AI 对话生成**：通过自然语言描述生成图表配置

### 4. 导出与推送

- **Markdown 导出**：将筛选后的文章导出为 Markdown 格式
- **DOCX 导出**：生成 Word 文档，支持流式导出和摘要导出
- **导出统计**：按分类统计可导出文章数量

### 5. 智能问答（QA Widget）

- 基于向量检索的 RAG 问答
- 支持上下文关联的多轮对话
- 引用来源文章

### 6. 管理后台

- **分类规则管理**：增删改查过滤规则（正向/反向）
- **规则导入/导出**：支持 JSON 格式批量导入规则
- **规则应用**：一键对所有待筛选文章执行分类

## 项目结构

```
knowledge-base/
├── pages/                    # 页面路由
│   ├── index.vue             # 首页/仪表盘
│   ├── articles.vue          # 文章管理
│   ├── charts.vue            # 图表可视化
│   ├── export.vue            # 导出页面
│   ├── filters.vue           # 过滤规则页面
│   ├── qa.vue                # 智能问答
│   ├── admin.vue             # 管理后台
│   ├── wechat.vue            # 微信模块布局
│   └── wechat/               # 微信子页面
│       ├── index.vue         # 微信首页（扫码登录）
│       ├── accounts.vue      # 公众号管理
│       ├── articles.vue      # 微信文章列表
│       ├── proxy.vue         # 代理节点管理
│       └── rss.vue           # RSS 源管理
├── components/               # UI 组件
│   ├── QAWidget.vue          # 问答组件
│   ├── AdminFiltersTab.vue   # 管理后台过滤规则标签页
│   ├── charts/               # 图表组件
│   └── wechat/               # 微信相关组件
├── composables/              # 前端组合式函数
│   ├── useChartChat.ts       # 图表对话逻辑
│   ├── useFileParser.ts      # 文件解析
│   ├── useWechatAuth.ts      # 微信认证状态
│   └── useWechatDownload.ts  # 微信文章下载
├── server/
│   ├── api/                  # API 路由
│   │   ├── articles/         # 文章 CRUD、分类、向量化、导出
│   │   ├── charts/           # 图表生成
│   │   ├── export/           # Markdown/文件导出
│   │   ├── filters/          # 过滤规则管理
│   │   ├── rss/              # RSS 源管理与同步
│   │   ├── sources/          # 来源管理
│   │   ├── wechat/           # 微信相关 API
│   │   │   ├── auth/         # 登录认证（扫码、状态、登出）
│   │   │   ├── accounts/     # 公众号管理
│   │   │   ├── articles/     # 文章同步与管理
│   │   │   ├── download/     # 文章下载
│   │   │   └── proxy/        # 代理节点管理
│   │   ├── qa.post.ts        # 智能问答
│   │   ├── stats.get.ts      # 统计数据
│   │   └── topics.get.ts     # 主题列表
│   └── db/
│       ├── schema.ts         # 数据库表定义
│       └── migrations/       # 数据库迁移文件
├── filter/                   # 过滤规则配置
│   ├── target.json           # 正向过滤规则（目标行业关键词）
│   ├── dispose.json          # 反向过滤规则（排除关键词）
│   └── requirement.txt       # 需求说明
├── scripts/                  # 工具脚本
├── tests/                    # 测试文件
├── types/                    # TypeScript 类型定义
├── utils/                    # 工具函数
├── nuxt.config.ts            # Nuxt 配置
├── drizzle.config.ts         # Drizzle ORM 配置
└── package.json              # 项目依赖
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 DATABASE_URL 和 AI API 密钥

# 3. 创建数据库并安装 pgvector 扩展
psql -c "CREATE DATABASE knowledge_base;"
psql -d knowledge_base -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. 运行数据库迁移
npm run db:migrate

# 5. 启动开发服务器
npm run dev
```

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串（需安装 pgvector） | - |
| `OPENAI_API_KEY` | OpenAI 兼容 API 密钥 | - |
| `OPENAI_BASE_URL` | API 基础地址 | `https://api.openai.com/v1` |
| `EMBEDDING_PROVIDER` | 向量化提供商 | - |
| `EMBEDDING_MODEL` | 向量化模型 | `text-embedding-3-small` |
| `EMBEDDING_DIMENSION` | 向量维度 | `1536` |
| `CHAT_MODEL` | 对话模型 | `gpt-4o-mini` |
| `DOWNLOAD_PROXY` | 文章下载 HTTP 代理地址 | - |

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `sources` | 文章来源/公众号（支持 wechat、web、rss、manual 类型） |
| `articles` | 文章主表（标题、内容、分类状态、摘要、下载状态等） |
| `article_chunks` | 文章向量块（拆分 chunk + 1024 维向量嵌入） |
| `filter_rules` | 过滤规则（正向目标行业 / 反向排除，支持关键词组合匹配） |
| `proxy_nodes` | 代理节点配置（URL、授权、启用状态、成功/失败计数） |
| `wechat_sessions` | 微信登录会话（token、cookies、过期时间） |

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览生产构建
npm run db:generate  # 生成数据库迁移文件
npm run db:migrate   # 执行数据库迁移
npm run db:studio    # 打开 Drizzle Studio 数据库管理界面
npm run test         # 运行测试
```
