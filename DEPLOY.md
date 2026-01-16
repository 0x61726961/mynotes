# mynotes Deploy

## Requirements

- Node.js 18+
- A domain + HTTPS

## Install

```bash
cd /var/www/mynotes
npm install --production
mkdir -p data
```

## Run

Use any process manager (pm2, systemd, etc.) and start:

```bash
node server/index.js
```

## nginx Config

```nginx
server {
    listen 80;
    server_name mynotes.yourdomain.com;

    location / {
        proxy_pass http://localhost:6677/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
