# mynotes Deployment Guide

## Prerequisites

- Node.js 18+ 
- npm or yarn
- A server with a domain name (for HTTPS)

## Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:6677
```

## Production Deployment

### 1. Server Setup

```bash
# Clone or copy project to server
cd /var/www/mynotes

# Install production dependencies
npm install --production

# Create data directory if needed
mkdir -p data
```

### 2. Environment Variables (Optional)

```bash
# Create .env file
PORT=6677
DB_PATH=/var/www/mynotes/data/mynotes.db
TRUST_PROXY=true # set true when running behind nginx/caddy
```

### 3. Process Manager (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server/index.js --name mynotes

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup
```

### 4. HTTPS with Caddy (Recommended)

Caddy automatically handles HTTPS certificates via Let's Encrypt.

```bash
# Install Caddy
sudo apt install -y caddy

# Edit Caddyfile
sudo nano /etc/caddy/Caddyfile
```

**Caddyfile:**
```
mynotes.yourdomain.com {
    @mynotes path /mynotes
    redir @mynotes /mynotes/

    handle_path /mynotes/api/* {
        reverse_proxy localhost:6677
    }

    handle_path /mynotes/* {
        reverse_proxy localhost:6677
    }
    
    # Security headers (optional, app already sets most via helmet)
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

```bash
# Reload Caddy
sudo systemctl reload caddy
```

### 5. HTTPS with nginx (Alternative)

```bash
# Install nginx and certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

**/etc/nginx/sites-available/mynotes:**
```nginx
server {
    listen 80;
    server_name mynotes.yourdomain.com;

    location = /mynotes {
        return 301 /mynotes/;
    }

    location /mynotes/api/ {
        proxy_pass http://localhost:6677/mynotes/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /mynotes/ {
        proxy_pass http://localhost:6677/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/mynotes /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d mynotes.yourdomain.com
```

If you host at `/mynotes/`, the API routes are served from `/mynotes/api/`. The health check is available at `/mynotes/health`.
```

### 6. Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to the Node server (keep it behind your proxy)
sudo ufw deny 6677/tcp
```

## Security Checklist

- [x] HTTPS enforced (via reverse proxy)
- [x] Rate limiting enabled (per-route limits)
- [x] Helmet security headers
- [x] JSON body size limited (200KB)
- [x] Input validation on all API endpoints
- [x] CSP via Helmet (inline styles allowed for note styling)
- [x] E2E encryption - server never sees plaintext
- [x] 300 notes per board cap
- [x] 2GB database size guardrail (db + wal + shm)
- [x] Soft-deleted notes purged after 24 hours

## Backup

The SQLite database stores only encrypted data. To backup:

```bash
# Stop the app first (optional, SQLite handles concurrent reads)
cp data/mynotes.db data/mynotes.db.backup
```

## Monitoring

```bash
# Health check
curl https://mynotes.yourdomain.com/mynotes/health

# View PM2 logs
pm2 logs mynotes

# Monitor
pm2 monit
```

## Troubleshooting

### "Cannot find module 'better-sqlite3'"

```bash
npm rebuild better-sqlite3
```

### Permission errors on database

```bash
chown -R www-data:www-data data/
chmod 755 data/
```

### Rate limit errors

Rate limits are configured per route in `server/index.js`. For higher traffic, adjust the per-route limiters:

```javascript
const listLimiter = createApiLimiter({ max: 60 });
const updateLimiter = createApiLimiter({ max: 120 });
const createLimiter = createApiLimiter({ max: 20 });
const deleteLimiter = createApiLimiter({ max: 20 });
```

If you're running behind a reverse proxy, set `TRUST_PROXY=true` so IP-based limits use the real client IP.
