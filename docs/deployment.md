# 部署指南

本文档介绍如何在本地开发环境和云服务器上部署海洋能源资源情报分析知识库系统。

---

## 1. 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | v20+ | 运行时环境 |
| PostgreSQL | v14+ | 数据库，需安装 pgvector 扩展 |
| npm | v9+ | 包管理器（或使用 pnpm） |

---

## 2. 本地开发部署

### 2.1 克隆项目

```bash
git clone <repository-url>
cd knowledge-base
```

### 2.2 安装依赖

```bash
npm install
```

### 2.3 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键变量：

```dotenv
# PostgreSQL 连接（需要安装 pgvector 扩展）
DATABASE_URL=postgresql://postgres:password@localhost:5432/knowledge_base

# AI API 配置（二选一）
# 方案一：使用 OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# 方案二：使用阿里云 DashScope
OPENAI_API_KEY=sk-your-dashscope-key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CHAT_MODEL=qwen-plus
EMBEDDING_PROVIDER=dashscope
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSION=1024
```

### 2.4 创建 PostgreSQL 数据库

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE knowledge_base;"

# 安装 pgvector 扩展
psql -U postgres -d knowledge_base -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2.5 运行数据库迁移

```bash
npm run db:migrate
```

### 2.6 初始化分类规则

项目 `filter/` 目录下包含预置的分类规则文件：
- `target.json` — 正向过滤规则（目标行业关键词）
- `dispose.json` — 反向过滤规则（排除无关内容）

启动服务后，通过管理后台页面 `/admin` 导入规则，或调用 API：

```bash
# 导入正向规则
curl -X POST http://localhost:3000/api/filters/import \
  -H "Content-Type: application/json" \
  -d @filter/target.json

# 导入反向规则
curl -X POST http://localhost:3000/api/filters/import \
  -H "Content-Type: application/json" \
  -d @filter/dispose.json
```

### 2.7 配置代理节点

微信文章下载需要通过代理节点访问。启动服务后：

1. 访问 `/wechat/proxy` 页面添加代理节点
2. 或直接通过 API 添加：

```bash
curl -X POST http://localhost:3000/api/wechat/proxy \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-proxy.workers.dev", "name": "代理1"}'
```

### 2.8 启动开发服务器

```bash
npm run dev
```

服务默认运行在 `http://localhost:3000`。

---

## 3. 生产环境部署（云服务器）

### 3.1 系统要求

- Ubuntu 20.04+ 或 CentOS 7+
- 最低 2GB 内存（推荐 4GB+，向量化操作较耗内存）
- 20GB+ 磁盘空间

### 3.2 安装 Node.js

推荐使用 nvm 管理 Node.js 版本：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安装 Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node --version  # v20.x.x
npm --version
```

### 3.3 安装 PostgreSQL

**Ubuntu:**

```bash
# 安装 PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# 安装 pgvector 扩展
sudo apt install -y postgresql-14-pgvector
# 如果版本不匹配，使用：
# sudo apt install -y postgresql-$(pg_config --version | grep -oP '\d+' | head -1)-pgvector

# 启动服务
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

**CentOS:**

```bash
# 安装 PostgreSQL
sudo yum install -y postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# pgvector 需要从源码编译安装
sudo yum install -y git gcc make postgresql-devel
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

### 3.4 配置 PostgreSQL

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建应用用户和数据库
CREATE USER kb_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE knowledge_base OWNER kb_user;
\c knowledge_base
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL PRIVILEGES ON DATABASE knowledge_base TO kb_user;
\q
```

修改 `pg_hba.conf` 允许密码认证（如需要）：

```bash
# 找到配置文件
sudo find / -name pg_hba.conf 2>/dev/null

# 编辑，将 local 和 host 的 METHOD 改为 md5 或 scram-sha-256
sudo vim /etc/postgresql/14/main/pg_hba.conf

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

### 3.5 克隆项目并安装依赖

```bash
cd /opt
sudo git clone <repository-url> knowledge-base
sudo chown -R $USER:$USER knowledge-base
cd knowledge-base
npm install
```

### 3.6 配置环境变量

```bash
cp .env.example .env
vim .env
```

生产环境 `.env` 示例：

```dotenv
DATABASE_URL=postgresql://kb_user:your_secure_password@localhost:5432/knowledge_base

OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CHAT_MODEL=qwen-plus
EMBEDDING_PROVIDER=dashscope
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSION=1024
```

### 3.7 构建项目

```bash
npm run build
```

构建产物位于 `.output/` 目录。

### 3.8 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start .output/server/index.mjs --name knowledge-base

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status              # 查看状态
pm2 logs knowledge-base # 查看日志
pm2 restart knowledge-base  # 重启
pm2 stop knowledge-base     # 停止
```

### 3.9 配置 Nginx 反向代理

```bash
sudo apt install -y nginx  # Ubuntu
# sudo yum install -y nginx  # CentOS
```

创建 Nginx 配置文件：

```bash
sudo vim /etc/nginx/sites-available/knowledge-base
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 IP

    client_max_body_size 50M;  # 允许较大的文件上传

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持（用于流式导出）
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/knowledge-base /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3.10 配置 SSL（可选）

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（需要域名已解析到服务器）
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 4. 初始化配置

部署完成后，按以下步骤完成初始化：

### 4.1 数据库迁移

```bash
npm run db:migrate
```

### 4.2 导入分类规则

访问管理后台 `/admin` 页面，或使用 API 导入：

```bash
# 导入正向规则（目标行业）
curl -X POST http://localhost:3000/api/filters/import \
  -H "Content-Type: application/json" \
  -d @filter/target.json

# 导入反向规则（排除词）
curl -X POST http://localhost:3000/api/filters/import \
  -H "Content-Type: application/json" \
  -d @filter/dispose.json
```

### 4.3 配置代理节点

访问 `/wechat/proxy` 页面，添加至少一个可用的代理节点用于微信文章下载。

代理节点需要支持转发请求到微信公众平台域名（`mp.weixin.qq.com`）。

### 4.4 首次登录微信公众号

1. 访问 `/wechat` 页面
2. 点击"扫码登录"获取二维码
3. 使用微信公众号管理员账号扫码确认
4. 登录成功后即可搜索和订阅公众号

> ⚠️ 微信登录会话有时效限制，过期后需重新扫码登录。

---

## 5. 常见问题

### 数据库连接失败

**症状**：启动时报错 `connection refused` 或 `authentication failed`

**排查步骤**：
1. 确认 PostgreSQL 服务正在运行：`sudo systemctl status postgresql`
2. 检查 `DATABASE_URL` 格式是否正确
3. 确认用户名密码正确：`psql -U kb_user -d knowledge_base`
4. 检查 `pg_hba.conf` 是否允许连接
5. 确认 pgvector 扩展已安装：`psql -d knowledge_base -c "SELECT * FROM pg_extension WHERE extname='vector';"`

### 微信登录二维码过期

**症状**：扫码页面提示二维码已过期

**解决方案**：
1. 刷新页面重新获取二维码
2. 确保网络能正常访问微信公众平台 API
3. 检查代理节点是否可用（如果通过代理访问）

### 代理节点不可用

**症状**：文章下载失败，提示代理连接超时

**排查步骤**：
1. 在 `/wechat/proxy` 页面检查节点状态
2. 确认代理节点 URL 可访问
3. 检查代理节点的 `failureCount`，失败次数过多的节点会被自动跳过
4. 添加新的代理节点或重置失败计数

### 端口冲突

**症状**：启动时报错 `EADDRINUSE: address already in use :::3000`

**解决方案**：
```bash
# 查找占用端口的进程
lsof -i :3000
# 或
netstat -tlnp | grep 3000

# 终止进程
kill -9 <PID>

# 或修改端口（开发环境）
PORT=3001 npm run dev
```

### 向量化失败

**症状**：文章向量化报错

**排查步骤**：
1. 确认 `OPENAI_API_KEY` 配置正确
2. 确认 `OPENAI_BASE_URL` 可访问
3. 检查 `EMBEDDING_DIMENSION` 与所选模型匹配
4. 确认 pgvector 扩展正常工作

---

## 6. 维护与更新

### 拉取最新代码

```bash
cd /opt/knowledge-base
git pull origin main
```

### 安装新依赖

```bash
npm install
```

### 运行新的数据库迁移

```bash
npm run db:migrate
```

### 重新构建并重启

```bash
# 构建
npm run build

# 重启 PM2 进程
pm2 restart knowledge-base
```

### 查看日志

```bash
# PM2 日志
pm2 logs knowledge-base

# 实时查看最近 100 行
pm2 logs knowledge-base --lines 100
```

### 数据库备份

```bash
# 备份
pg_dump -U kb_user knowledge_base > backup_$(date +%Y%m%d).sql

# 恢复
psql -U kb_user knowledge_base < backup_20240101.sql
```

---

## 附录：完整部署检查清单

- [ ] Node.js v20+ 已安装
- [ ] PostgreSQL 已安装并运行
- [ ] pgvector 扩展已安装
- [ ] 数据库和用户已创建
- [ ] `.env` 文件已正确配置
- [ ] 数据库迁移已执行
- [ ] 分类规则已导入
- [ ] 代理节点已配置（如需微信功能）
- [ ] 项目已构建（生产环境）
- [ ] PM2 已配置并启动（生产环境）
- [ ] Nginx 反向代理已配置（生产环境）
- [ ] SSL 证书已配置（可选）
