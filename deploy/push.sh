#!/bin/bash
# 快速更新脚本 - 仅推送代码、重新构建并重启
# 用于首次部署后的日常更新
# 使用方式: bash deploy/push.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo "错误: 找不到 deploy/.env.deploy"
    exit 1
fi

APP_DIR="/opt/knowledge-base"

SSH_CMD="ssh -p ${REMOTE_PORT:-22}"
SCP_CMD="scp -P ${REMOTE_PORT:-22}"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi
SSH_TARGET="$REMOTE_USER@$REMOTE_HOST"

echo ">>> 打包项目..."
cd "$PROJECT_ROOT"
ARCHIVE="/tmp/knowledge-base-deploy.tar.gz"
tar czf "$ARCHIVE" \
    --exclude='node_modules' \
    --exclude='.nuxt' \
    --exclude='.output' \
    --exclude='.data' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='deploy/.env.deploy' \
    .

echo ">>> 上传代码..."
$SCP_CMD "$ARCHIVE" "$SSH_TARGET:/tmp/knowledge-base-deploy.tar.gz"
rm -f "$ARCHIVE"

echo ">>> 远程更新..."
$SSH_CMD $SSH_TARGET bash -s "$APP_DIR" << 'REMOTE_UPDATE'
set -e
APP_DIR="$1"
cd "$APP_DIR"

export npm_config_registry=https://registry.npmmirror.com

# 解压新代码（保留 .env 和 node_modules）
tar xzf /tmp/knowledge-base-deploy.tar.gz --exclude='.env'
rm /tmp/knowledge-base-deploy.tar.gz

# 安装依赖 & 构建
echo ">>> npm install..."
npm install 2>&1 | tail -3
echo ">>> 构建..."
npm run build 2>&1 | tail -3

# 迁移数据库
echo ">>> 数据库迁移..."
npm install drizzle-kit tsx typescript --save-dev 2>&1 | tail -1
npx drizzle-kit migrate

# 重启
echo ">>> 重启服务..."
pm2 restart knowledge-base
pm2 status
REMOTE_UPDATE

echo ""
echo "✅ 更新完成! http://$REMOTE_HOST"
