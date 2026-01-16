const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 6677;
const MAX_NOTES_PER_BOARD = 300;
const MAX_DB_BYTES = 2000000000;
const MAX_PAYLOAD_BYTES = 200000;
const LIST_PAGE_LIMIT = 100;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/mynotes.db');
const DELETED_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for dynamic note styling
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

function createApiLimiter(options) {
  return rateLimit({
    windowMs: 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    ...options
  });
}

const globalLimiter = createApiLimiter({ max: 200 });
const listLimiter = createApiLimiter({ max: 60 });
const updateLimiter = createApiLimiter({ max: 120 });
const createLimiter = createApiLimiter({ max: 20 });
const deleteLimiter = createApiLimiter({ max: 20 });

app.use(express.json({ limit: '200kb' }));
app.use(['/api', '/mynotes/api'], globalLimiter);

app.use(express.static(path.join(__dirname, '../public')));

app.use('/assets', express.static(path.join(__dirname, '../assets')));

app.get(['/health', '/mynotes/health'], (req, res) => {
  res.json({ ok: true });
});

const apiRouter = express.Router();

function isValidBoardId(id) {
  return typeof id === 'string' && /^[a-f0-9]{64}$/i.test(id);
}

function isValidNoteId(id) {
  return typeof id === 'string' && /^[a-f0-9-]{8,64}$/i.test(id);
}

function isValidPayload(payload) {
  if (typeof payload !== 'string' || payload.length > MAX_PAYLOAD_BYTES) return false;
  try {
    const parsed = JSON.parse(payload);
    return parsed.iv && parsed.ct && 
           typeof parsed.iv === 'string' && 
           typeof parsed.ct === 'string';
  } catch {
    return false;
  }
}

function getFileSize(filepath) {
  try {
    return fs.statSync(filepath).size;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

function getDatabaseSizeBytes() {
  return (
    getFileSize(DB_PATH) +
    getFileSize(`${DB_PATH}-wal`) +
    getFileSize(`${DB_PATH}-shm`)
  );
}

function cleanupDeletedNotes() {
  const cutoff = Date.now() - DELETED_RETENTION_MS;
  const removed = db.cleanupDeletedNotes(cutoff);
  if (removed > 0) {
    console.log(`Cleaned up ${removed} deleted notes.`);
  }
}

apiRouter.post('/notes/list', listLimiter, (req, res) => {
  try {
    const { board_id, limit, offset } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }

    const requestedLimit = limit ?? LIST_PAGE_LIMIT;
    const parsedLimit = Number(requestedLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'Invalid limit' });
    }

    const parsedOffset = Number(offset ?? 0);
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'Invalid offset' });
    }

    const safeLimit = Math.min(Math.floor(parsedLimit), LIST_PAGE_LIMIT);
    const safeOffset = Math.floor(parsedOffset);

    const notes = db.getNotesPaged(board_id, safeLimit, safeOffset);
    res.json({ notes });
  } catch (err) {
    console.error('Error listing notes:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

apiRouter.post('/notes/create', createLimiter, (req, res) => {
  try {
    const { board_id, payload } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    if (!isValidPayload(payload)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const dbSizeBytes = getDatabaseSizeBytes();
    if (dbSizeBytes >= MAX_DB_BYTES) {
      return res.status(507).json({ error: 'Database limit reached' });
    }

    db.ensureBoard(board_id);
    
    const noteCount = db.getNoteCount(board_id);
    if (noteCount >= MAX_NOTES_PER_BOARD) {
      return res.status(409).json({ error: 'Note limit exceeded' });
    }

    const note = db.createNote(board_id, payload);
    res.json({ id: note.id });

  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

apiRouter.post('/notes/update', updateLimiter, (req, res) => {
  try {
    const { board_id, id, payload, deleted } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    if (!isValidNoteId(id)) {
      return res.status(400).json({ error: 'Invalid note id' });
    }
    
    if (payload !== undefined && !isValidPayload(payload)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    const success = db.updateNote(board_id, id, payload, deleted);
    
    if (!success) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

apiRouter.post('/notes/delete', deleteLimiter, (req, res) => {
  try {
    const { board_id, id } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    if (!isValidNoteId(id)) {
      return res.status(400).json({ error: 'Invalid note id' });
    }
    
    const success = db.deleteNote(board_id, id);
    
    if (!success) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.use(['/api', '/mynotes/api'], apiRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
  try {
    cleanupDeletedNotes();
    setInterval(() => {
      try {
        cleanupDeletedNotes();
      } catch (err) {
        console.error('Failed to cleanup deleted notes:', err);
      }
    }, CLEANUP_INTERVAL_MS);
  } catch (err) {
    console.error('Failed to run initial deleted notes cleanup:', err);
  }

  app.listen(PORT, () => {
    console.log(`mynotes server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
