# mynotes hashtag #mynotes

Client-side encrypted collaborative sticky note board. Post some notes for yourself or post with pals! No snooping without the exact room name!

## Quick Start

```bash
npm install
npm start
# open http://localhost:6677
```

## Security

- PBKDF2 (150k iterations) + AES-256-GCM in the browser
- Server stores only encrypted payloads + opaque board IDs
- No accounts, no cookies, no tracking

## Deployment

[DEPLOY.md](DEPLOY.md).

## License

MIT
