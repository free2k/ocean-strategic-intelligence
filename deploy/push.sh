#!/bin/bash
# 推送代码并重启服务
# 用法:
#   bash deploy/push.sh              # 全量更新(前端+后端)
set -e

# ============ 配置项 ============
# 从 deploy/.env.deploy 加载密钥（不提交Git）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo "错误: 找不到 deploy/.env.deploy，请从 deploy/.env.deploy.example 复制并填入密钥"
    exit 1
fi
APP_DIR="/opt/knowledge-base"

# SSH/SCP命令封装
SSH_CMD="ssh -p $REMOTE_PORT"
SCP_CMD="scp -P $REMOTE_PORT"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi
