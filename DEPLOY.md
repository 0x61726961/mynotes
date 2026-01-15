# MyNotes Deployment Guide

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

# Server runs on http://localhost:3000
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
PORT=3000
DB_PATH=/var/www/mynotes/data/mynotes.db
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
    reverse_proxy localhost:3000
    
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

    location / {
        proxy_pass http://localhost:3000;
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

### 6. Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Security Checklist

- [x] HTTPS enforced (via reverse proxy)
- [x] Rate limiting enabled (100 req/min/IP)
- [x] Helmet security headers
- [x] JSON body size limited (500KB)
- [x] Input validation on all API endpoints
- [x] No inline scripts (CSP-friendly)
- [x] E2E encryption - server never sees plaintext

## Backup

The SQLite database stores only encrypted data. To backup:

```bash
# Stop the app first (optional, SQLite handles concurrent reads)
cp data/mynotes.db data/mynotes.db.backup
```

## Monitoring

```bash
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

The default is 100 requests per minute per IP. For higher traffic, adjust in `server/index.js`:

```javascript
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200, // increase limit
  ...
});
```
