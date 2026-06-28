# 公网部署安全指南

## 核心原则

**管理面板和控制台绝不能直接暴露在公网**。使用反向代理隔离，仅转发游戏 API 和 CDN 资源。

## 1. 反向代理（nginx 推荐）

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书（Let's Encrypt 免费）
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # ── 速率限制 ──
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
    limit_req_zone $binary_remote_addr zone=diagnostics:10m rate=1r/s;
    client_max_body_size 64k;

    # ── 游戏 API → Fastify ──
    location /api/index.php/ {
        limit_req zone=api burst=30 nodelay;
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    # ── CN CDN 静态资源 ──
    location /patch/cn/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
    }

    # ── 诊断端点（严格限速） ──
    location /crash {
        limit_req zone=diagnostics burst=2;
        proxy_pass http://127.0.0.1:8001;
    }
    location /debug {
        limit_req zone=diagnostics burst=2;
        proxy_pass http://127.0.0.1:8001;
    }

    # ── 管理面板（内网 only + 密码保护） ──
    location / {
        # 仅允许内网或 VPN，替换为实际网段
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow <YOUR_LAN_SUBNET>;

        deny all;

        auth_basic "Admin Panel";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
    }
}
```

### 创建密码文件

```bash
sudo apt install apache2-utils  # 或 httpd-tools
sudo htpasswd -c /etc/nginx/.htpasswd admin
# 输入密码
```

## 2. `.env` 配置

```bash
# 服务仅监听本地（nginx 代为暴露）
CN_LISTEN_HOST="127.0.0.1"
CN_LISTEN_PORT="8001"
LISTEN_HOST="127.0.0.1"
SESSION_HOST="127.0.0.1"

# CDN 地址用公网域名
CDN_BASE_URL="https://your-domain.com/patch/cn"

# 联机 TCP 公网地址
SESSION_PUBLIC_HOST="your-domain.com"
```

## 3. 防火墙（iptables）

```bash
# 只允许 nginx → Fastify（本地回环）
sudo iptables -A INPUT -p tcp --dport 8001 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8001 -j DROP

# 只允许已建立的 TCP 会话连接（游戏客户端 → nginx:8003）
sudo iptables -A INPUT -p tcp --dport 8003 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8003 -j DROP

# SSH
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# 已建立连接的响应包
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 默认拒绝
sudo iptables -P INPUT DROP
```

## 4. 服务端安全加固清单

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | CN 会话 token 使用随机数（非自增 ID） | ✅ `tool.ts` |
| 2 | `contentsGuide.ts` 验证 session | ✅ `contentsGuide.ts` |
| 3 | `/crash` `/debug` 速率限制 | ✅ `cn-server.ts` |
| 4 | 请求体大小限制 64KB | ✅ `cn-server.ts` |
| 5 | 生产环境用 `CN_LISTEN_HOST=127.0.0.1` | 见 `.env` |
| 6 | nginx 反向代理（443 + SSL） | 见上方 |
| 7 | 管理面板 IP 白名单 + HTTP Basic Auth | 见上方 |
| 8 | 防火墙只允许 22/443 | 见上方 |

## 5. 已知局限性

| 项目 | 风险 | 缓解 |
|------|------|------|
| Web 管理面板无应用层认证 | 内网用户可操作 | nginx `allow` IP + `auth_basic` |
| TCP 联机无 TLS | 明文传输 | 未来可加 TLS 层 |
| 支付端点无真实验证 | 本地支付绕过 | 设计如此（自建服），不对外 |
| 日志不脱敏 | 可能记录设备 ID | crash 截断至 2000 字符 |

## 6. 检查服务器暴露面

```bash
# 查看监听端口
ss -tlnp | grep 800

# 测试公网可达性（从外部机器）
curl -s -o /dev/null -w "%{http_code}" http://<SERVER_IP>:8001/

# 预期：公网直接访问返回 000（被防火墙拦截）
# 只有通过 nginx 的路径可达
```
