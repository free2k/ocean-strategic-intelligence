# 海洋能源资源宏观知识库 - 文章管理与智能问答

基于 Nuxt 3 + PostgreSQL(pgvector) 的文章知识库系统，支持多渠道文章管理、本地向量化和 RAG 智能问答。

## 功能

- 批量导入微信公众号文章（兼容 `batch_sync.py` 输出格式）
- 文章浏览、搜索、分页展示
- 文章内容向量化（支持 OpenAI 及兼容 API）
- 基于向量检索的 RAG 智能问答
- 多来源渠道管理

## 前置要求

- Node.js >= 20
- PostgreSQL >= 15（需安装 pgvector 扩展）
- OpenAI API Key（或兼容的 Embedding/Chat API）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库连接和 API Key

# 3. 初始化数据库（需先创建数据库并启用 pgvector）
# psql: CREATE EXTENSION IF NOT EXISTS vector;
npm run db:generate
npm run db:migrate

# 4. 启动开发服务器
npm run dev

# 5. 导入文章（可选）
npm run import -- ../clawWechat/target/articles_1weeks_debug.json
```

## 与爬取工具的衔接

本项目设计为与 `wechat-article-exporter` 配合使用：

1. 爬取工具通过 `batch_sync.py` 生成 JSON 文件
2. 本项目通过管理后台上传或命令行脚本导入
3. 导入后可一键向量化，支持智能问答

## 后续扩展

- [ ] 支持 RSS 订阅源自动抓取
- [ ] 支持网页文章手动录入
- [ ] 文章全文内容抓取（配合 Puppeteer）
- [ ] 定时自动同步 + 向量化
- [ ] 用户认证与权限管理
