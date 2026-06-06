#!/bin/bash
# 在服务器上安装 sing-box 并配置 hysteria2 代理
# 使用方式: 在服务器上执行 bash /opt/knowledge-base/deploy/proxy-setup.sh
set -e

echo ">>> 安装 sing-box..."

# 安装 sing-box
if ! command -v sing-box &>/dev/null; then
    # 添加官方仓库
    curl -fsSL https://sing-box.app/gpg.key -o /etc/pki/rpm-gpg/RPM-GPG-KEY-sagernet
    cat > /etc/yum.repos.d/sagernet.repo << 'EOF'
[sagernet]
name=sagernet
baseurl=https://deb.sagernet.org/rpm/
enabled=1
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-sagernet
EOF
    dnf install -y sing-box 2>/dev/null || {
        # 如果仓库安装失败，直接下载二进制
        echo ">>> 仓库安装失败，下载二进制..."
        SINGBOX_VER="1.11.4"
        cd /tmp
        wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VER}/sing-box-${SINGBOX_VER}-linux-amd64.tar.gz" || \
        wget -q "https://ghfast.top/https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VER}/sing-box-${SINGBOX_VER}-linux-amd64.tar.gz"
        tar xzf "sing-box-${SINGBOX_VER}-linux-amd64.tar.gz"
        cp "sing-box-${SINGBOX_VER}-linux-amd64/sing-box" /usr/local/bin/
        chmod +x /usr/local/bin/sing-box
        rm -rf /tmp/sing-box-*
    }
fi

echo "  sing-box: $(sing-box version | head -1)"

# 写入配置
mkdir -p /etc/sing-box
cat > /etc/sing-box/config.json << 'EOF'
{
  "log": {
    "level": "warn",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "127.0.0.1",
      "listen_port": 10808
    }
  ],
  "outbounds": [
    {
      "type": "hysteria2",
      "tag": "proxy",
      "server": "89.208.253.149",
      "server_port": 7853,
      "up_mbps": 100,
      "down_mbps": 100,
      "password": "aaa",
      "tls": {
        "enabled": true,
        "server_name": "store.steampowered.com",
        "insecure": true
      }
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "rules": [
      {
        "ip_is_private": true,
        "outbound": "direct"
      }
    ],
    "final": "proxy"
  }
}
EOF

# 创建 systemd 服务
cat > /etc/systemd/system/sing-box.service << 'EOF'
[Unit]
Description=sing-box service
Documentation=https://sing-box.sagernet.org
After=network.target nss-lookup.target

[Service]
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=on-failure
RestartSec=10s
LimitNOFILE=infinity

[Install]
WantedBy=multi-user.target
EOF

# 如果 sing-box 装在 /usr/bin 则修正路径
if [ -x /usr/bin/sing-box ] && [ ! -x /usr/local/bin/sing-box ]; then
    sed -i 's|/usr/local/bin/sing-box|/usr/bin/sing-box|g' /etc/systemd/system/sing-box.service
fi

# 启动服务
systemctl daemon-reload
systemctl enable sing-box
systemctl restart sing-box

sleep 2

# 验证
if systemctl is-active --quiet sing-box; then
    echo ">>> sing-box 启动成功"
    echo ">>> 测试代理连通性..."
    curl -x http://127.0.0.1:10808 -s -o /dev/null -w "HTTP %{http_code}" https://www.google.com && echo " ✅" || echo " ❌ 连接失败"
else
    echo ">>> sing-box 启动失败，查看日志:"
    journalctl -u sing-box --no-pager -n 20
    exit 1
fi

# 配置 knowledge-base 使用代理
if ! grep -q "DOWNLOAD_PROXY" /opt/knowledge-base/.env 2>/dev/null; then
    echo "" >> /opt/knowledge-base/.env
    echo "DOWNLOAD_PROXY=http://127.0.0.1:10808" >> /opt/knowledge-base/.env
    echo ">>> 已添加 DOWNLOAD_PROXY 到 .env"
elif ! grep -q "DOWNLOAD_PROXY=http://127.0.0.1:10808" /opt/knowledge-base/.env; then
    sed -i 's|^DOWNLOAD_PROXY=.*|DOWNLOAD_PROXY=http://127.0.0.1:10808|' /opt/knowledge-base/.env
    echo ">>> 已更新 DOWNLOAD_PROXY"
fi

# 重启应用
pm2 restart knowledge-base 2>/dev/null || true

echo ""
echo "=========================================="
echo "  ✅ 代理配置完成!"
echo "  代理地址: http://127.0.0.1:10808"
echo "  协议: hysteria2"
echo "=========================================="
