const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(
  os.tmpdir(),
  `mynotes-db-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.DB_PATH = dbPath;

const db = require('../server/db');

const boardId = 'b'.repeat(64);
const payload = JSON.stringify({ iv: 'iv', ct: 'ct' });

function openRawDb() {
  return new Database(dbPath);
}

afterAll(() => {
  db.close();
  [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
});

describe('Database unit behavior', () => {
  test('ensureBoard creates a board once', () => {
    db.ensureBoard(boardId);
    db.ensureBoard(boardId);

    const rawDb = openRawDb();
    const row = rawDb.prepare('SELECT COUNT(*) AS count FROM boards WHERE id = ?').get(boardId);
    rawDb.close();

    expect(row.count).toBe(1);
  });

  test('getNoteCount excludes deleted notes', () => {
    db.ensureBoard(boardId);
    const note = db.createNote(boardId, payload);

    expect(db.getNoteCount(boardId)).toBe(1);

    db.deleteNote(boardId, note.id);

    expect(db.getNoteCount(boardId)).toBe(0);
  });

  test('updateNote can toggle deleted and update payload', () => {
    db.ensureBoard(boardId);
    const note = db.createNote(boardId, payload);
    const updatedPayload = JSON.stringify({ iv: 'iv2', ct: 'ct2' });

    const success = db.updateNote(boardId, note.id, updatedPayload, true);
    expect(success).toBe(true);

    const rawDb = openRawDb();
    const row = rawDb
      .prepare('SELECT payload, deleted FROM notes WHERE id = ?')
      .get(note.id);
    rawDb.close();

    expect(row.payload).toBe(updatedPayload);
    expect(row.deleted).toBe(1);
  });

  test('cleanupDeletedNotes removes old soft-deleted records', () => {
    db.ensureBoard(boardId);
    const note = db.createNote(boardId, payload);
    db.updateNote(boardId, note.id, undefined, true);

    const rawDb = openRawDb();
    const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;
    rawDb.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(oldTimestamp, note.id);
    rawDb.close();

    const removed = db.cleanupDeletedNotes(Date.now() - 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
  });
});
