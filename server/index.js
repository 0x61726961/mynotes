const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);

app.use(express.json({ limit: '500kb' }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/assets', express.static(path.join(__dirname, '../assets')));

function isValidBoardId(id) {
  return typeof id === 'string' && /^[a-f0-9]{64}$/i.test(id);
}

function isValidNoteId(id) {
  return typeof id === 'string' && /^[a-f0-9-]{8,64}$/i.test(id);
}

function isValidPayload(payload) {
  if (typeof payload !== 'string' || payload.length > 500000) return false;
  try {
    const parsed = JSON.parse(payload);
    return parsed.iv && parsed.ct && 
           typeof parsed.iv === 'string' && 
           typeof parsed.ct === 'string';
  } catch {
    return false;
  }
}

app.post('/api/notes/list', (req, res) => {
  try {
    const { board_id } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    const notes = db.getNotes(board_id);
    res.json({ notes });
  } catch (err) {
    console.error('Error listing notes:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notes/create', (req, res) => {
  try {
    const { board_id, payload } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    if (!isValidPayload(payload)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    db.ensureBoard(board_id);
    
    const note = db.createNote(board_id, payload);
    res.json({ id: note.id });
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notes/update', (req, res) => {
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

app.post('/api/notes/delete', (req, res) => {
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`MyNotes server running on http://localhost:${PORT}`);
});
