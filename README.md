#  mynotes hashtag #mynotes

little notes app I wanted to make for myself. the rest of this shit is vibecoded who gaf

## Features

- **End-to-End Encryption**: Your notes are encrypted in your browser before being sent to the server. The server only stores ciphertext.
- **Passphrase-Based Access**: Access boards by passphrase. Share the passphrase to collaborate.
- **Sticky Notes**: Create text notes on a virtual corkboard
- **Images**: Upload images that are converted to compact grayscale data to save space
- **Doodles**: Draw 64x64 pixel doodles
- **Drag & Drop**: Position notes anywhere on the 2400x1600 corkboard
- **Rotation**: Slight random rotation for a natural look, adjustable per note
- **Colors**: Yellow, pink, blue, green, orange, and lavender sticky notes
- **Mobile Friendly**: Works on touch devices

## How It Works

1. Enter a passphrase to open a board
2. The passphrase is used to derive:
   - A **board ID** (SHA-256 hash of PBKDF2 output)
   - An **encryption key** (AES-256-GCM via PBKDF2)
3. The passphrase **never leaves your browser**
4. Notes are encrypted client-side before being sent to the server
5. Anyone with the same passphrase can decrypt and view the board

## Security

- **PBKDF2** with 150,000 iterations for key derivation
- **AES-256-GCM** for symmetric encryption
- **Random 12-byte IV** per note
- Server stores only opaque board IDs and encrypted payloads
- No accounts, no cookies, no tracking
- Server-side guardrails: 300 notes per board, 200KB payload cap, 2GB database cap
- Soft-deleted notes are purged after 24 hours

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Crypto**: Web Crypto API (native browser)

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Open http://localhost:6677
```

## Project Structure

```
mynotes/
├── server/
│   ├── index.js      # Express server + API routes
│   └── db.js         # SQLite database layer
├── public/
│   ├── index.html    # Main HTML
│   ├── css/
│   │   └── style.css # All styles
│   └── js/
│       ├── app.js    # Main application logic
│       ├── board.js  # Board panning + note dragging
│       ├── crypto.js # PBKDF2 + AES-GCM helpers
│       ├── doodle.js # 64x64 doodle editor
│       ├── image.js  # Image processing
│       ├── notes.js  # Note data management
│       ├── room-bg.js # Animated board background
│       └── strings.js # UI copy config
├── data/             # SQLite database directory
├── package.json
├── DEPLOY.md         # Deployment guide
└── README.md
```

## API Endpoints

All endpoints accept JSON and require a valid `board_id` (64-char hex string).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notes/list` | List notes for a board (supports `limit`, `offset`) |
| POST | `/api/notes/create` | Create a new note |
| POST | `/api/notes/update` | Update a note |
| POST | `/api/notes/delete` | Soft-delete a note |

If you host the app under a subpath (e.g. `/mynotes/`), the API endpoints are available under `/mynotes/api/notes/*`.

## Deployment

See [DEPLOY.md](DEPLOY.md) for full deployment instructions including HTTPS setup with Caddy or nginx.

## License

MIT
