#!/usr/bin/env node
/*
  Seed a room with lots of notes for manual testing.

  Usage:
    node scripts/seed_board.js --room "test" --count 250

  Notes:
  - Default mode is direct DB seeding (fast, bypasses API rate limits).
  - Optional API mode exists but will hit rate limits unless throttled.
  - Generates valid encrypted note payloads using the same crypto as the browser.

  Examples:
    # Fast DB seeding (recommended)
    node scripts/seed_board.js --room "loadtest" --count 250

    # API seeding (slow due to rate limits unless you lower count)
    node scripts/seed_board.js --room "loadtest" --count 10 --mode api

    # Update lots of notes quickly (forces a large delta for paging tests)
    node scripts/seed_board.js --room "loadtest" --count 250 --mode update
*/

const http = require('http');
const https = require('https');
const { TextEncoder, TextDecoder } = require('util');
const nodeCrypto = require('crypto');
const fs = require('fs');
const path = require('path');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
// In Node, WebCrypto lives under crypto.webcrypto
global.crypto = nodeCrypto.webcrypto;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requestJson(urlString, body) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (err) {
            return reject(
              new Error(`Failed to parse JSON response (${res.statusCode}): ${data.slice(0, 200)}`)
            );
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = parsed?.error || `HTTP ${res.statusCode}`;
            const error = new Error(message);
            error.status = res.statusCode;
            error.body = parsed;
            return reject(error);
          }
          resolve(parsed);
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function loadBrowserCryptoModule() {
  const cryptoScript = fs.readFileSync(
    path.join(__dirname, '../public/js/crypto.js'),
    'utf8'
  );
  // crypto.js defines `const Crypto = (() => { ... })();`
  return new Function(`${cryptoScript}; return Crypto;`)();
}

function buildPayload(index, total) {
  // Keep payloads small and valid.
  return {
    type: 'text',
    text: `Seed note #${index + 1}`,
    x: (index * 17) % 2200,
    y: (index * 23) % 1400,
    rot: 0,
    color: 'yellow',
    created_at: Date.now() - (total - index) * 5
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry(fn, options = {}) {
  const { retries = 10, delayMs = 25 } = options;
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = String(err?.message || '');
      const isLocked = message.toLowerCase().includes('database is locked');
      if (!isLocked || attempt === retries) {
        throw err;
      }
      await sleep(delayMs);
    }
  }

  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv);

  const room = typeof args.room === 'string' ? args.room : 'loadtest';
  const requestedCount = Number.isFinite(Number(args.count))
    ? Math.max(1, Math.floor(Number(args.count)))
    : 250;
  const mode = typeof args.mode === 'string' ? args.mode : 'db';
  const origin = typeof args.origin === 'string' ? args.origin : 'http://localhost:6677';

  // Support deployments under /mynotes
  const apiBase = typeof args.apiBase === 'string'
    ? args.apiBase
    : (typeof args.subpath === 'string' && args.subpath.length > 0 ? `/${args.subpath.replace(/^\/+/, '').replace(/\/+$/, '')}/api` : '/api');

  const Crypto = loadBrowserCryptoModule();

  const boardId = await Crypto.deriveBoardId(room);
  const key = await Crypto.deriveEncryptionKey(room);

  if (mode === 'api') {
    const count = requestedCount;
    console.log(`Seeding room "${room}" with ${count} notes via API...`);
    console.log(`Server: ${origin}${apiBase}`);

    for (let i = 0; i < count; i += 1) {
      const payload = buildPayload(i, count);
      const encryptedPayload = await Crypto.encryptPayload(key, payload);

      await requestJson(`${origin}${apiBase}/notes/create`, {
        board_id: boardId,
        payload: encryptedPayload
      });

      if ((i + 1) % 25 === 0 || i === count - 1) {
        process.stdout.write(`  created ${i + 1}/${count}\n`);
      }
    }

    console.log('Done. Open the app and join this room to verify paging + refresh behavior.');
    console.log(`Room: ${room}`);
    return;
  }

  if (mode !== 'db' && mode !== 'update') {
    throw new Error(`Unknown --mode ${mode}. Use --mode db, --mode update, or --mode api.`);
  }

  const db = require('../server/db');
  const MAX_NOTES_PER_BOARD = 300;

  try {
    await withDbRetry(async () => db.ensureBoard(boardId));

    if (mode === 'update') {
      const allNotes = await withDbRetry(async () => db.getNotes(boardId));
      const count = Math.min(requestedCount, allNotes.length);

      console.log(`Updating ${count}/${allNotes.length} notes in room "${room}" via DB...`);
      console.log(`DB board id: ${boardId}`);

      if (count <= 0) {
        console.log('No notes to update. Seed first with --mode db.');
        return;
      }

      const batchTag = Date.now();

      for (let i = 0; i < count; i += 1) {
        const note = allNotes[i];
        let payload = null;
        try {
          payload = await Crypto.decryptPayload(key, note.payload);
        } catch (err) {
          // If we can't decrypt for some reason, just skip.
          continue;
        }

        if (payload && typeof payload === 'object') {
          payload.seed_updated_at = batchTag;
          if (payload.type === 'text') {
            payload.text = `Updated #${i + 1} (${batchTag})`;
          } else {
            // For non-text notes, tweak rotation slightly so it's a real change.
            payload.rot = (Number(payload.rot) || 0) + 0.25;
          }
        } else {
          payload = { type: 'text', text: `Updated #${i + 1} (${batchTag})` };
        }

        const encryptedPayload = await Crypto.encryptPayload(key, payload);
        await withDbRetry(async () => db.updateNote(boardId, note.id, encryptedPayload));

        if ((i + 1) % 25 === 0 || i === count - 1) {
          process.stdout.write(`  updated ${i + 1}/${count}\n`);
        }
      }

      console.log('Done. Clients should receive a large delta (and page it) on the next poll.');
      console.log(`Room: ${room}`);
      return;
    }

    // mode === 'db'
    const existing = await withDbRetry(async () => db.getNoteCount(boardId));
    const count = Math.min(requestedCount, Math.max(0, MAX_NOTES_PER_BOARD - existing));

    console.log(`Seeding room "${room}" with ${count} notes via DB...`);
    console.log(`DB board id: ${boardId}`);

    if (count <= 0) {
      console.log(
        `Board already has ${existing} notes (limit ${MAX_NOTES_PER_BOARD}). Nothing to seed.`
      );
      return;
    }

    for (let i = 0; i < count; i += 1) {
      const payload = buildPayload(i, count);
      const encryptedPayload = await Crypto.encryptPayload(key, payload);
      await withDbRetry(async () => db.createNote(boardId, encryptedPayload));

      if ((i + 1) % 25 === 0 || i === count - 1) {
        process.stdout.write(`  created ${i + 1}/${count}\n`);
      }
    }

    console.log('Done. Start (or refresh) the server and open the app to verify paging + refresh behavior.');
    console.log(`Room: ${room}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
