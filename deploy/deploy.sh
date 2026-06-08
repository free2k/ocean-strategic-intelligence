#!/bin/bash
# knowledge-base 部署脚本 - OpenCloudOS 9.2 (腾讯云)
# 使用方式: 在本地执行 bash deploy/deploy.sh
# 脚本会通过 SSH 连接远程服务器完成全部部署
set -e

# ============ 加载配置 ============
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo "错误: 找不到 deploy/.env.deploy，请从 deploy/.env.deploy.example 复制并填入配置"
    exit 1
fi

APP_DIR="/opt/knowledge-base"
NODE_VERSION="20"

# SSH命令封装
SSH_CMD="ssh -p ${REMOTE_PORT:-22}"
SCP_CMD="scp -P ${REMOTE_PORT:-22}"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi
SSH_TARGET="$REMOTE_USER@$REMOTE_HOST"

echo "=========================================="
echo "  knowledge-base 远程部署脚本"
echo "  目标系统: OpenCloudOS 9.2"
echo "=========================================="
echo "  目标服务器: $SSH_TARGET"
echo "  部署目录:   $APP_DIR"
echo "  数据库:     $DB_NAME"
echo "=========================================="
echo ""
read -p "确认开始部署? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "已取消"
    exit 0
fi

# ============ 1. 推送代码到服务器 ============
echo ""
read -p "[1/7] 是否推送代码到服务器? (y/n, 首次部署选y): " push_code
if [ "$push_code" = "y" ]; then
    echo "  推送代码到服务器..."
    # 打包项目（排除 node_modules、.nuxt 等）
    cd "$PROJECT_ROOT"
    ARCHIVE="/tmp/knowledge-base-deploy.tar.gz"
    tar czf "$ARCHIVE" \
        --exclude='node_modules' \
        --exclude='.nuxt' \
        --exclude='.output' \
        --exclude='.data' \
        --exclude='.git' \
        --exclude='deploy/.env.deploy' \
        .

    # 上传到服务器
    $SSH_CMD $SSH_TARGET "mkdir -p $APP_DIR"
    $SCP_CMD "$ARCHIVE" "$SSH_TARGET:/tmp/knowledge-base-deploy.tar.gz"
    $SSH_CMD $SSH_TARGET "tar xzf /tmp/knowledge-base-deploy.tar.gz -C $APP_DIR && rm /tmp/knowledge-base-deploy.tar.gz"
    rm -f "$ARCHIVE"
    echo "  代码已推送完成"
else
    echo "  跳过代码推送"
    $SSH_CMD $SSH_TARGET "mkdir -p $APP_DIR"
fi

# ============ 2. 初始化服务器环境 ============
echo ""
echo "[2/7] 初始化服务器环境 (Node.js, PostgreSQL, Nginx, PM2)..."

$SSH_CMD $SSH_TARGET bash -s << 'REMOTE_INIT'
set -e

# ===== 配置国内镜像源 =====
echo "  >> 配置国内镜像源..."

# npm 使用淘宝镜像
npm config set registry https://registry.npmmirror.com 2>/dev/null || true

# PostgreSQL YUM 仓库使用腾讯云镜像
PG_REPO_FILE="/etc/yum.repos.d/pgdg-redhat-all.repo"
if [ -f "$PG_REPO_FILE" ]; then
    sed -i 's|https://download.postgresql.org/pub|https://mirrors.cloud.tencent.com/postgresql|g' "$PG_REPO_FILE"
    sed -i 's|http://download.postgresql.org/pub|https://mirrors.cloud.tencent.com/postgresql|g' "$PG_REPO_FILE"
fi

echo "  >> 更新系统包..."
dnf makecache -q 2>/dev/null || true
dnf update -y -q 2>/dev/null || true

# --- 安装基础工具 ---
dnf install -y -q curl wget tar git gcc make 2>/dev/null || true

# --- 安装 Node.js 20 (通过 dnf module, 兼容 OpenCloudOS 9) ---
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    echo "  >> 安装 Node.js 20..."
    # OpenCloudOS 9 基于 RHEL 9，使用 AppStream module 安装
    dnf module reset nodejs -y 2>/dev/null || true
    dnf module enable nodejs:20 -y 2>/dev/null || true
    dnf install -y nodejs npm
    # 如果 module 方式版本不够新，回退使用 fnm/二进制方式
    if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
        echo "  >> module 安装不满足要求，使用二进制安装..."
        NODE_DIST="node-v20.18.1-linux-x64"
        cd /tmp
        wget -q "https://npmmirror.com/mirrors/node/v20.18.1/${NODE_DIST}.tar.xz"
        tar xf "${NODE_DIST}.tar.xz"
        cp -rf ${NODE_DIST}/bin/* /usr/local/bin/
        cp -rf ${NODE_DIST}/lib/* /usr/local/lib/
        cp -rf ${NODE_DIST}/include/* /usr/local/include/ 2>/dev/null || true
        rm -rf /tmp/${NODE_DIST}*
        # 确保 /usr/local/bin 在 PATH 中
        echo 'export PATH=/usr/local/bin:$PATH' > /etc/profile.d/nodejs.sh
        source /etc/profile.d/nodejs.sh
    fi
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# 设置 npm 淘宝镜像
npm config set registry https://registry.npmmirror.com

# --- 安装 PM2 ---
if ! command -v pm2 &>/dev/null; then
    echo "  >> 安装 PM2..."
    npm install -g pm2
fi

# --- 安装 PostgreSQL 16 + pgvector ---
if ! rpm -q postgresql16-server &>/dev/null; then
    echo "  >> 安装 PostgreSQL 16..."
    dnf install -y postgresql16-server postgresql16-contrib postgresql16-devel
fi

# 检测 psql 路径
PSQL="$(command -v psql 2>/dev/null || echo "")"
if [ -z "$PSQL" ]; then
    # 尝试常见路径
    for p in /usr/pgsql-16/bin/psql /usr/local/pgsql/bin/psql; do
        [ -x "$p" ] && PSQL="$p" && break
    done
fi
echo "  psql: $PSQL"

# 检测 pg_config 路径
PG_CONFIG="$(command -v pg_config 2>/dev/null || echo "")"
if [ -z "$PG_CONFIG" ]; then
    for p in /usr/pgsql-16/bin/pg_config /usr/local/pgsql/bin/pg_config; do
        [ -x "$p" ] && PG_CONFIG="$p" && break
    done
fi
echo "  pg_config: $PG_CONFIG"

# 确定 systemd 服务名
PG_SERVICE=""
for svc in postgresql-16 postgresql; do
    if systemctl list-unit-files "${svc}.service" &>/dev/null; then
        PG_SERVICE="$svc"
        break
    fi
done
# 如果上面没找到，用更宽松的方式
if [ -z "$PG_SERVICE" ]; then
    PG_SERVICE=$(systemctl list-unit-files | grep -oP 'postgresql[^\s]*\.service' | head -1 | sed 's/.service//')
fi
echo "  PostgreSQL 服务名: $PG_SERVICE"

# 初始化数据库（如果尚未初始化）
# OpenCloudOS 9 数据目录通常在 /var/lib/pgsql/data
PG_DATA_DIR=""
for d in /var/lib/pgsql/16/data /var/lib/pgsql/data; do
    if [ -d "$(dirname $d)" ]; then
        PG_DATA_DIR="$d"
        break
    fi
done

if [ -n "$PG_DATA_DIR" ] && [ ! -f "$PG_DATA_DIR/PG_VERSION" ]; then
    echo "  >> 初始化 PostgreSQL 数据库..."
    # OpenCloudOS 9 标准方式: postgresql-setup --initdb
    if command -v postgresql-setup &>/dev/null; then
        postgresql-setup --initdb
    elif [ -x /usr/bin/postgresql-16-setup ]; then
        /usr/bin/postgresql-16-setup --initdb
    else
        # 最后手段：直接用 initdb
        INITDB="$(command -v initdb 2>/dev/null || echo /usr/bin/initdb)"
        sudo -u postgres $INITDB -D "$PG_DATA_DIR"
    fi
fi

systemctl enable "$PG_SERVICE"
systemctl start "$PG_SERVICE"

# 确保 PostgreSQL 运行
systemctl is-active --quiet "$PG_SERVICE" || systemctl start "$PG_SERVICE"
echo "  PostgreSQL: $($PSQL --version)"

# 将路径信息写入临时文件供后续步骤使用
cat > /tmp/.pg_paths << EOF2
PG_CONFIG=$PG_CONFIG
PG_SERVICE=$PG_SERVICE
PSQL=$PSQL
EOF2

# --- 安装 pgvector 扩展 ---
if ! sudo -u postgres $PSQL -c "SELECT 1 FROM pg_available_extensions WHERE name='vector'" 2>/dev/null | grep -q 1; then
    echo "  >> 安装 pgvector..."

    # 方案1: 直接用 dnf 安装
    if dnf install -y pgvector_16 2>/dev/null; then
        echo "  pgvector 通过 dnf 安装成功"
    else
        # 方案2: 从 PGDG 下载预编译的 pgvector RPM 并强制安装
        echo "  >> 尝试下载 PGDG 预编译 pgvector RPM..."
        PGVECTOR_RPM="pgvector_16-0.8.2-1PGDG.rhel9.8.x86_64.rpm"
        PGVECTOR_URL="https://download.postgresql.org/pub/repos/yum/16/redhat/rhel-9-x86_64/${PGVECTOR_RPM}"
        cd /tmp
        rm -f "$PGVECTOR_RPM"
        wget -q "$PGVECTOR_URL" 2>/dev/null || curl -fsSLO "$PGVECTOR_URL" 2>/dev/null || true

        if [ -f "$PGVECTOR_RPM" ]; then
            # 用 --nodeps 跳过对 PGDG postgresql16-server 的依赖（我们用的是 OC 自带版本）
            rpm -ivh --nodeps --force "$PGVECTOR_RPM" 2>&1 || true
            rm -f "$PGVECTOR_RPM"

            # 修复路径：PGDG RPM 安装到 /usr/pgsql-16/ 但 OpenCloudOS PG 期望在 /usr/share/pgsql/ 和 /usr/lib64/pgsql/
            # 创建符号链接
            PGDG_SHARE="/usr/pgsql-16/share/extension"
            PGDG_LIB="/usr/pgsql-16/lib"
            OC_SHARE="/usr/share/pgsql/extension"
            OC_LIB="/usr/lib64/pgsql"

            if [ -d "$PGDG_SHARE" ] && [ -d "$OC_SHARE" ]; then
                echo "  >> 链接扩展文件: $PGDG_SHARE -> $OC_SHARE"
                ln -sf ${PGDG_SHARE}/vector.control "$OC_SHARE/" 2>/dev/null || cp -f ${PGDG_SHARE}/vector.control "$OC_SHARE/"
                ln -sf ${PGDG_SHARE}/vector--*.sql "$OC_SHARE/" 2>/dev/null || cp -f ${PGDG_SHARE}/vector--*.sql "$OC_SHARE/"
            fi
            if [ -d "$PGDG_LIB" ] && [ -d "$OC_LIB" ]; then
                echo "  >> 链接 .so 文件: $PGDG_LIB -> $OC_LIB"
                ln -sf ${PGDG_LIB}/vector.so "$OC_LIB/" 2>/dev/null || cp -f ${PGDG_LIB}/vector.so "$OC_LIB/"
                ln -sf ${PGDG_LIB}/bitcode/vector* "$OC_LIB/bitcode/" 2>/dev/null || true
            fi

            # 如果上面路径不对，自动查找并链接
            VECTOR_CONTROL="$(find /usr -name 'vector.control' -type f 2>/dev/null | head -1)"
            VECTOR_SO="$(find /usr -name 'vector.so' -type f 2>/dev/null | head -1)"
            if [ -n "$VECTOR_CONTROL" ] && [ ! -f "$OC_SHARE/vector.control" ]; then
                FOUND_DIR="$(dirname "$VECTOR_CONTROL")"
                echo "  >> 从 $FOUND_DIR 链接到 $OC_SHARE"
                ln -sf ${FOUND_DIR}/vector.control "$OC_SHARE/"
                ln -sf ${FOUND_DIR}/vector--*.sql "$OC_SHARE/"
            fi
            if [ -n "$VECTOR_SO" ] && [ ! -f "$OC_LIB/vector.so" ]; then
                echo "  >> 从 $(dirname $VECTOR_SO) 链接到 $OC_LIB"
                ln -sf "$VECTOR_SO" "$OC_LIB/"
            fi

            echo "  pgvector RPM 安装完成"
        else
            echo "  >> RPM 下载失败，尝试手动编译..."

            # 方案3: 手动编译，不依赖 pg_config
            # 找到 PostgreSQL 的 lib 和 share 目录
            PG_LIB="$(find /usr -path '*/postgresql/*' -name '*.so' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null)"
            PG_SHARE="$(find /usr -path '*/extension/plpgsql*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null | sed 's|/extension$||')"
            PG_INCLUDE="$(find /usr -name 'postgres.h' -path '*/server/*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null | sed 's|/server$||' | sed 's|$|/server|')"

            if [ -z "$PG_LIB" ] || [ -z "$PG_SHARE" ]; then
                # 再试通过 rpm 查找
                PG_LIB="$(rpm -ql postgresql16-server | grep '\.so$' | head -1 | xargs dirname 2>/dev/null)"
                PG_SHARE="$(rpm -ql postgresql16-server | grep '/extension/' | head -1 | xargs dirname 2>/dev/null | sed 's|/extension$||')"
            fi

            echo "  PG_LIB=$PG_LIB"
            echo "  PG_SHARE=$PG_SHARE"
            echo "  PG_INCLUDE=$PG_INCLUDE"

            if [ -n "$PG_LIB" ] && [ -n "$PG_SHARE" ] && [ -n "$PG_INCLUDE" ]; then
                dnf install -y gcc make 2>/dev/null || true
                cd /tmp
                rm -rf pgvector
                git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git
                cd pgvector

                # 直接手动编译 .so，绕过 pgxs 构建系统
                gcc -Wall -Werror -O2 -shared -fPIC \
                    -I"$PG_INCLUDE" \
                    -o vector.so \
                    src/bitvec.c src/halfutils.c src/halfvec.c src/hnsw.c \
                    src/hnswbuild.c src/hnswinsert.c src/hnswscan.c src/hnswutils.c src/hnswvacuum.c \
                    src/ivfbuild.c src/ivfflat.c src/ivfinsert.c src/ivfkmeans.c src/ivfscan.c src/ivfutils.c src/ivfvacuum.c \
                    src/sparsevec.c src/vector.c src/xorshiftplus.c 2>&1 || {
                    echo "  !! 编译失败，跳过 pgvector（稍后可手动安装）"
                    cd /tmp && rm -rf pgvector
                    # 不退出，继续部署其他步骤
                    true
                }

                if [ -f vector.so ]; then
                    cp vector.so "$PG_LIB/"
                    cp sql/vector--0.7.4.sql "$PG_SHARE/extension/"
                    cp vector.control "$PG_SHARE/extension/"
                    # 复制升级脚本
                    cp sql/vector--*.sql "$PG_SHARE/extension/" 2>/dev/null || true
                    echo "  pgvector 手动编译安装成功"
                fi
                cd /tmp && rm -rf pgvector
            else
                echo "  !! 无法确定 PostgreSQL 安装路径，跳过 pgvector"
                echo "  !! 部署完成后请手动安装 pgvector"
            fi
        fi
    fi
fi

# --- 安装 Nginx ---
if ! command -v nginx &>/dev/null; then
    echo "  >> 安装 Nginx..."
    dnf install -y nginx
    systemctl enable nginx
fi

# --- 安装 Playwright 依赖 (Chromium 运行所需系统库) ---
echo "  >> 安装 Playwright 浏览器依赖..."
dnf install -y \
    alsa-lib atk at-spi2-atk cups-libs libdrm libXcomposite \
    libXdamage libXrandr mesa-libgbm pango nss nss-util nspr \
    libxkbcommon xorg-x11-fonts-Type1 dbus-libs \
    libXtst libXScrnSaver gtk3 2>/dev/null || true

echo "  环境初始化完成"
REMOTE_INIT

# ============ 3. 配置 PostgreSQL 数据库 ============
echo ""
echo "[3/7] 配置 PostgreSQL 数据库..."

# 将敏感参数 base64 编码后传输，避免 shell 特殊字符问题
B64_DB_NAME=$(echo -n "$DB_NAME" | base64)
B64_DB_USER=$(echo -n "$DB_USER" | base64)
B64_DB_PASS=$(echo -n "$DB_PASS" | base64)

$SSH_CMD $SSH_TARGET bash -s "$B64_DB_NAME" "$B64_DB_USER" "$B64_DB_PASS" << 'REMOTE_DB'
set -e
DB_NAME="$(echo "$1" | base64 -d)"
DB_USER="$(echo "$2" | base64 -d)"
DB_PASS="$(echo "$3" | base64 -d)"

# 加载 PostgreSQL 路径信息
source /tmp/.pg_paths
echo "  使用 psql: $PSQL"

# 配置 pg_hba.conf 使用密码认证
PG_HBA=$(sudo -u postgres $PSQL -t -c "SHOW hba_file;" | xargs)
echo "  pg_hba.conf: $PG_HBA"

# 确保 host 和 local 连接都使用 scram-sha-256（替换 ident/peer 为 scram-sha-256）
if [ -f "$PG_HBA" ]; then
    echo "  >> 配置 PostgreSQL 认证为 scram-sha-256..."
    # 备份原文件
    cp "$PG_HBA" "${PG_HBA}.bak" 2>/dev/null || true
    # 将所有 ident 和 peer 认证方式替换为 scram-sha-256
    sed -i 's/\bident\b/scram-sha-256/g' "$PG_HBA"
    sed -i 's/\bpeer\b/scram-sha-256/g' "$PG_HBA"
    # 重启 PostgreSQL 使配置生效
    systemctl restart "$PG_SERVICE"
fi

# 创建用户和数据库
echo "  >> 创建数据库用户: $DB_USER..."
sudo -u postgres $PSQL -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASS';
    ELSE
        ALTER ROLE \"$DB_USER\" WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;
"

echo "  >> 创建数据库: $DB_NAME..."
sudo -u postgres $PSQL -c "
SELECT 'CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME');
" | grep -q "CREATE" && sudo -u postgres $PSQL -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" || true

# 安装 pgvector 扩展
echo "  >> 启用 pgvector 扩展..."
sudo -u postgres $PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 授权
sudo -u postgres $PSQL -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$DB_USER\";"
sudo -u postgres $PSQL -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";"

echo "  数据库配置完成"
REMOTE_DB

# ============ 4. 配置环境变量 ============
echo ""
echo "[4/7] 配置环境变量..."

# 生成远程 .env 文件内容（本地生成后上传）
DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
ENV_CONTENT="# PostgreSQL 连接
DATABASE_URL=${DB_URL}

# AI 配置
EMBEDDING_DIMENSION=1024
EMBEDDING_PROVIDER=dashscope
EMBEDDING_MODEL=text-embedding-v4
OPENAI_API_KEY=${OPENAI_API_KEY:-sk-your-key}
OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://dashscope.aliyuncs.com/compatible-mode/v1}
CHAT_MODEL=${CHAT_MODEL:-qwen-plus}

# SMTP 邮件配置
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-465}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-}

# 站点访问密码
SITE_PASSWORD=${SITE_PASSWORD:-}

# Tushare
TUSHARE_TOKEN=${TUSHARE_TOKEN:-}"

echo "$ENV_CONTENT" | $SSH_CMD $SSH_TARGET "cat > $APP_DIR/.env"
echo "  .env 文件已生成"

# ============ 5. 安装依赖并构建 ============
echo ""
echo "[5/7] 安装依赖并构建项目..."

$SSH_CMD $SSH_TARGET bash -s "$APP_DIR" << 'REMOTE_BUILD'
set -e
APP_DIR="$1"
cd "$APP_DIR"

# 确保使用淘宝镜像
export npm_config_registry=https://registry.npmmirror.com
# Playwright 使用国内镜像下载浏览器
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright

echo "  >> npm install..."
npm install 2>&1 | tail -5

echo "  >> npm run build..."
npm run build 2>&1 | tail -5

echo "  >> 安装 Playwright Chromium..."
npx playwright install chromium 2>&1 | tail -3

echo "  构建完成"
REMOTE_BUILD

# ============ 6. 数据库迁移 ============
echo ""
echo "[6/7] 执行数据库迁移..."

$SSH_CMD $SSH_TARGET bash -s "$APP_DIR" << 'REMOTE_MIGRATE'
set -e
APP_DIR="$1"
cd "$APP_DIR"
export npm_config_registry=https://registry.npmmirror.com

# drizzle-kit 迁移需要 dev dependencies
npm install drizzle-kit tsx typescript --save-dev 2>&1 | tail -2
npx drizzle-kit migrate
echo "  数据库迁移完成"
REMOTE_MIGRATE

# ============ 7. 配置 Nginx 并启动服务 ============
echo ""
echo "[7/7] 配置 Nginx 并启动应用..."

$SSH_CMD $SSH_TARGET bash -s "$APP_DIR" "$REMOTE_HOST" << 'REMOTE_START'
set -e
APP_DIR="$1"
SERVER_HOST="$2"

# 配置 Nginx
cat > /etc/nginx/conf.d/knowledge-base.conf << EOF
server {
    listen 80;
    server_name $SERVER_HOST _;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
EOF

# 移除默认配置避免冲突
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# 测试并重启 Nginx
nginx -t
systemctl restart nginx

# 配置防火墙
if command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --permanent --add-service=https 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi

# 用 PM2 启动应用
cd "$APP_DIR"
pm2 delete knowledge-base 2>/dev/null || true
pm2 start .output/server/index.mjs --name knowledge-base --node-args="--env-file=.env --max-old-space-size=4096"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "  ✅ 部署完成!"
echo "  访问地址: http://$SERVER_HOST"
echo ""
pm2 status
REMOTE_START

echo ""
echo "=========================================="
echo "  🎉 部署全部完成!"
echo "  访问地址: http://$REMOTE_HOST"
echo "=========================================="
