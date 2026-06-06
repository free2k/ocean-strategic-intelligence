#!/bin/bash
# knowledge-base 部署脚本 - opencloud 9
# 使用方式: 在本地执行 bash deploy/deploy.sh
# 脚本会通过 SSH 连接远程服务器完成部署
set -e

# ============ 本地配置项（按需修改） ============
# 从 deploy/.env.deploy 加载密钥（不提交Git）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo "错误: 找不到 deploy/.env.deploy，请从 deploy/.env.deploy.example 复制并填入密钥"
    exit 1
fi
APP_DIR="/opt/knowledge-base"
DOMAIN="$REMOTE_HOST"
SECRET_KEY=$(openssl rand -hex 32)

# SSH命令封装
SSH_CMD="ssh -p $REMOTE_PORT"
SCP_CMD="scp -P $REMOTE_PORT"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi

echo "=========================================="
echo "  knowledge-base 远程部署脚本 (opencloud 9)"
echo "=========================================="
echo "  目标服务器: $REMOTE_USER@$REMOTE_HOST"
echo "  部署目录:   $APP_DIR"
echo "=========================================="
echo ""
read -p "确认开始部署? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "已取消"
    exit 0
fi

# ============ 1. 推送代码到服务器 ============
echo "[1/7] 推送代码到服务器..."

# 自动定位到项目根目录（deploy.sh 所在目录的上一级）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
echo "项目根目录: $PROJECT_ROOT"

