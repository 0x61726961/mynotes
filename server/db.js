const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/mynotes.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER DEFAULT 0,
    FOREIGN KEY (board_id) REFERENCES boards(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_notes_board_id ON notes(board_id);
  CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);
`);

const stmts = {
  getBoard: db.prepare('SELECT * FROM boards WHERE id = ?'),
  createBoard: db.prepare('INSERT INTO boards (id, created_at) VALUES (?, ?)'),
  getNotes: db.prepare('SELECT id, payload, created_at, updated_at FROM notes WHERE board_id = ? AND deleted = 0'),
  getNotesPaged: db.prepare('SELECT id, payload, created_at, updated_at FROM notes WHERE board_id = ? AND deleted = 0 ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?'),
  getNote: db.prepare('SELECT * FROM notes WHERE id = ? AND board_id = ?'),
  getNoteCount: db.prepare('SELECT COUNT(*) AS count FROM notes WHERE board_id = ? AND deleted = 0'),
  deleteOldDeleted: db.prepare('DELETE FROM notes WHERE deleted = 1 AND updated_at < ?'),
  createNote: db.prepare('INSERT INTO notes (id, board_id, payload, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)'),
  updateNote: db.prepare('UPDATE notes SET payload = ?, updated_at = ? WHERE id = ? AND board_id = ?'),
  softDeleteNote: db.prepare('UPDATE notes SET deleted = 1, updated_at = ? WHERE id = ? AND board_id = ?'),
  setDeleted: db.prepare('UPDATE notes SET deleted = ?, updated_at = ? WHERE id = ? AND board_id = ?'),
};

function generateNoteId() {
  return crypto.randomBytes(16).toString('hex');
}

function ensureBoard(boardId) {
  const existing = stmts.getBoard.get(boardId);
  if (!existing) {
    stmts.createBoard.run(boardId, Date.now());
  }
}

function getNotes(boardId) {
  return stmts.getNotes.all(boardId);
}

function getNotesPaged(boardId, limit, offset) {
  return stmts.getNotesPaged.all(boardId, limit, offset);
}

function getNoteCount(boardId) {
  const row = stmts.getNoteCount.get(boardId);
  return row ? row.count : 0;
}

function cleanupDeletedNotes(cutoffTimestamp) {
  const result = stmts.deleteOldDeleted.run(cutoffTimestamp);
  return result.changes || 0;
}

function createNote(boardId, payload) {
  const id = generateNoteId();
  const now = Date.now();
  stmts.createNote.run(id, boardId, payload, now, now);
  return { id, board_id: boardId, payload, created_at: now, updated_at: now };
}

function updateNote(boardId, noteId, payload, deleted) {
  const existing = stmts.getNote.get(noteId, boardId);
  if (!existing) return false;
  
  const now = Date.now();
  
  if (deleted !== undefined) {
    stmts.setDeleted.run(deleted ? 1 : 0, now, noteId, boardId);
  }
  
  if (payload !== undefined) {
    stmts.updateNote.run(payload, now, noteId, boardId);
  }
  
  return true;
}

function deleteNote(boardId, noteId) {
  const existing = stmts.getNote.get(noteId, boardId);
  if (!existing) return false;
  
  stmts.softDeleteNote.run(Date.now(), noteId, boardId);
  return true;
}

function close() {
  db.close();
}

module.exports = {
  ensureBoard,
  getNotes,
  getNotesPaged,
  getNoteCount,
  cleanupDeletedNotes,
  createNote,
  updateNote,
  deleteNote,
  close,
};
