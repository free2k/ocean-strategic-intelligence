#!/bin/bash
# 数据库同步脚本 - 将本地 PostgreSQL 数据同步到远程服务器
# 使用方式: bash deploy/sync-db.sh
# 注意: 会覆盖远程数据库的所有数据！
set -e

# ============ 加载配置 ============
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo "错误: 找不到 deploy/.env.deploy"
    exit 1
fi

# 本地数据库配置（从 .env 读取）
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
    LOCAL_DB_URL=$(grep "^DATABASE_URL=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
fi

if [ -z "$LOCAL_DB_URL" ]; then
    echo "错误: 无法从 .env 读取 DATABASE_URL"
    exit 1
fi

# 解析本地数据库连接信息
# 格式: postgresql://user:pass@host:port/dbname
LOCAL_DB_USER=$(echo "$LOCAL_DB_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
LOCAL_DB_PASS=$(echo "$LOCAL_DB_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
LOCAL_DB_HOST=$(echo "$LOCAL_DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
LOCAL_DB_PORT=$(echo "$LOCAL_DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
LOCAL_DB_NAME=$(echo "$LOCAL_DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

# SSH命令封装
SSH_CMD="ssh -p ${REMOTE_PORT:-22}"
SCP_CMD="scp -P ${REMOTE_PORT:-22}"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi
SSH_TARGET="$REMOTE_USER@$REMOTE_HOST"

echo "=========================================="
echo "  数据库同步: 本地 → 远程"
echo "=========================================="
echo "  本地: $LOCAL_DB_USER@$LOCAL_DB_HOST:$LOCAL_DB_PORT/$LOCAL_DB_NAME"
echo "  远程: $DB_USER@$REMOTE_HOST/$DB_NAME"
echo ""
echo "  ⚠️  这将覆盖远程数据库的所有数据!"
echo "=========================================="
echo ""
read -p "确认同步? (输入 yes): " confirm
if [ "$confirm" != "yes" ]; then
    echo "已取消"
    exit 0
fi

# ============ 1. 导出本地数据库 ============
echo ""
echo "[1/4] 导出本地数据库..."

DUMP_FILE="$PROJECT_ROOT/deploy/.db-dump.sql"

# 检测 pg_dump 路径（Windows 上可能不在 PATH 中）
PG_DUMP="pg_dump"
if ! command -v pg_dump &>/dev/null; then
    # 尝试 Windows 常见 PostgreSQL 安装路径
    for pg_dir in \
        "/c/Program Files/PostgreSQL"/*/bin \
        "/c/Program Files (x86)/PostgreSQL"/*/bin \
        "$PROGRAMFILES/PostgreSQL"/*/bin \
        "/mnt/c/Program Files/PostgreSQL"/*/bin
    do
        if [ -f "$pg_dir/pg_dump.exe" ] 2>/dev/null; then
            PG_DUMP="$pg_dir/pg_dump.exe"
            break
        fi
    done
    if [ "$PG_DUMP" = "pg_dump" ]; then
        echo "错误: 找不到 pg_dump 命令"
        echo "请确保 PostgreSQL bin 目录在 PATH 中，或手动指定路径"
        echo "例如: export PATH=\"/c/Program Files/PostgreSQL/16/bin:\$PATH\""
        exit 1
    fi
    echo "  使用: $PG_DUMP"
fi

# 导出数据库
PGPASSWORD="$LOCAL_DB_PASS" "$PG_DUMP" \
    -h "$LOCAL_DB_HOST" \
    -p "$LOCAL_DB_PORT" \
    -U "$LOCAL_DB_USER" \
    -d "$LOCAL_DB_NAME" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    -f "$DUMP_FILE"

# 验证 dump 文件
if [ ! -f "$DUMP_FILE" ]; then
    echo "错误: dump 文件未生成: $DUMP_FILE"
    echo "请检查 pg_dump 是否正常工作"
    exit 1
fi

DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || wc -c < "$DUMP_FILE")
if [ "$DUMP_SIZE" -lt 1000 ]; then
    echo "警告: dump 文件过小 (${DUMP_SIZE} bytes)，本地数据库可能为空"
    echo "文件内容:"
    cat "$DUMP_FILE"
    exit 1
fi

echo "  导出完成: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# ============ 2. 上传到远程服务器 ============
echo ""
echo "[2/4] 上传数据库备份到服务器..."

$SCP_CMD "$DUMP_FILE" "$SSH_TARGET:/tmp/knowledge-base-dump.sql"
echo "  上传完成"

# ============ 3. 在远程服务器恢复数据库 ============
echo ""
echo "[3/4] 恢复数据库到远程服务器..."

$SSH_CMD $SSH_TARGET bash -s "$(echo -n "$DB_NAME" | base64)" "$(echo -n "$DB_USER" | base64)" "$(echo -n "$DB_PASS" | base64)" "$(echo -n "$LOCAL_DB_NAME" | base64)" << 'REMOTE_RESTORE'
set -e
DB_NAME="$(echo "$1" | base64 -d)"
DB_USER="$(echo "$2" | base64 -d)"
DB_PASS="$(echo "$3" | base64 -d)"
LOCAL_DB_NAME="$(echo "$4" | base64 -d)"

# 检测 psql 路径
PSQL="$(command -v psql || echo /usr/pgsql-16/bin/psql)"
if [ -f /tmp/.pg_paths ]; then
    source /tmp/.pg_paths
fi

# 检测服务名
PG_SERVICE="${PG_SERVICE:-postgresql-16}"
systemctl is-active --quiet "$PG_SERVICE" 2>/dev/null || PG_SERVICE="postgresql"

# 断开现有连接
sudo -u postgres $PSQL -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
" 2>/dev/null || true

# 如果本地和远程数据库名不同，需要修改 dump 文件中的数据库名
if [ "$LOCAL_DB_NAME" != "$DB_NAME" ]; then
    echo "  >> 替换数据库名: $LOCAL_DB_NAME → $DB_NAME"
    sed -i "s/\\\\connect \"$LOCAL_DB_NAME\"/\\\\connect \"$DB_NAME\"/g" /tmp/knowledge-base-dump.sql
    sed -i "s/DATABASE $LOCAL_DB_NAME/DATABASE $DB_NAME/g" /tmp/knowledge-base-dump.sql
    sed -i "s/connect $LOCAL_DB_NAME/connect $DB_NAME/g" /tmp/knowledge-base-dump.sql
fi

# 删除并重建数据库
echo "  >> 重建数据库..."
sudo -u postgres $PSQL -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
sudo -u postgres $PSQL -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
sudo -u postgres $PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres $PSQL -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";"

# 恢复数据
echo "  >> 恢复数据..."
PGPASSWORD="$DB_PASS" $PSQL -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
    -f /tmp/knowledge-base-dump.sql > /tmp/restore-output.log 2>&1 || true

# 统计错误数
ERROR_COUNT=$(grep -c "ERROR" /tmp/restore-output.log 2>/dev/null || echo "0")
echo "  恢复完成（${ERROR_COUNT} 个非致命错误）"
if [ "$ERROR_COUNT" -gt "0" ]; then
    echo "  前几条错误:"
    grep "ERROR" /tmp/restore-output.log | head -5
fi
rm -f /tmp/restore-output.log

# 修复权限
sudo -u postgres $PSQL -d "$DB_NAME" -c "
GRANT ALL ON SCHEMA public TO \"$DB_USER\";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$DB_USER\";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$DB_USER\";
"

# 清理
rm -f /tmp/knowledge-base-dump.sql

echo "  数据库恢复完成"
REMOTE_RESTORE

# ============ 4. 验证 ============
echo ""
echo "[4/4] 验证数据库..."

$SSH_CMD $SSH_TARGET bash -s "$(echo -n "$DB_NAME" | base64)" "$(echo -n "$DB_USER" | base64)" "$(echo -n "$DB_PASS" | base64)" << 'REMOTE_VERIFY'
DB_NAME="$(echo "$1" | base64 -d)"
DB_USER="$(echo "$2" | base64 -d)"
DB_PASS="$(echo "$3" | base64 -d)"

PSQL="$(command -v psql || echo /usr/pgsql-16/bin/psql)"
if [ -f /tmp/.pg_paths ]; then
    source /tmp/.pg_paths
fi

echo "  表统计:"
PGPASSWORD="$DB_PASS" $PSQL -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -c "
SELECT tablename AS \"表名\",
       (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.tablename) AS \"列数\"
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;
"

echo ""
echo "  数据行数:"
PGPASSWORD="$DB_PASS" $PSQL -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'articles' AS table_name, count(*) FROM articles
UNION ALL SELECT 'sources', count(*) FROM sources
UNION ALL SELECT 'article_chunks', count(*) FROM article_chunks
UNION ALL SELECT 'filter_rules', count(*) FROM filter_rules
UNION ALL SELECT 'proxy_nodes', count(*) FROM proxy_nodes;
"
REMOTE_VERIFY

# 清理本地临时文件
rm -f "$DUMP_FILE"

echo ""
echo "=========================================="
echo "  ✅ 数据库同步完成!"
echo "=========================================="
