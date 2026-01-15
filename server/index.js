const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers (CSP-friendly)
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

// Rate limiting per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Parse JSON with size limit
app.use(express.json({ limit: '500kb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Validate board_id format (hex string, 64 chars for SHA-256)
function isValidBoardId(id) {
  return typeof id === 'string' && /^[a-f0-9]{64}$/i.test(id);
}

// Validate note id format (UUID-like or hex)
function isValidNoteId(id) {
  return typeof id === 'string' && /^[a-f0-9-]{8,64}$/i.test(id);
}

// Validate payload (base64 JSON with iv and ct)
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

// API: List notes for a board
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

// API: Create a note
app.post('/api/notes/create', (req, res) => {
  try {
    const { board_id, payload } = req.body;
    
    if (!isValidBoardId(board_id)) {
      return res.status(400).json({ error: 'Invalid board_id' });
    }
    
    if (!isValidPayload(payload)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    // Ensure board exists
    db.ensureBoard(board_id);
    
    // Create note
    const note = db.createNote(board_id, payload);
    res.json({ id: note.id });
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Update a note
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

// API: Delete a note (soft delete)
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

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`MyNotes server running on http://localhost:${PORT}`);
});
