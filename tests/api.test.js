const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const Database = require('better-sqlite3');

const dbPath = path.join(
  os.tmpdir(),
  `mynotes-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.DB_PATH = dbPath;

const app = require('../server/index');
const db = require('../server/db');

const boardId = 'a'.repeat(64);
const payload = JSON.stringify({ iv: 'iv', ct: 'ct' });
const updatedPayload = JSON.stringify({ iv: 'iv2', ct: 'ct2' });
const oversizedPayload = 'a'.repeat(200001);

afterAll(() => {
  db.close();
  [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
});

describe('Notes API', () => {
  test('serves the app shell', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="login-screen"');
    expect(response.text).toContain('js/app.js');
  });

  test('returns a healthy response', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const subpathResponse = await request(app).get('/mynotes/health');

    expect(subpathResponse.status).toBe(200);
    expect(subpathResponse.body.ok).toBe(true);
  });

  test('rejects invalid board ids on create', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .send({ board_id: 'invalid', payload });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid board_id');
  });

  test('rejects invalid payloads on create', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .send({ board_id: boardId, payload: { iv: 'iv', ct: 'ct' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  test('rejects oversized payloads on create', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .send({ board_id: boardId, payload: oversizedPayload });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  test('validates pagination inputs on list', async () => {
    const badLimit = await request(app)
      .post('/api/notes/list')
      .send({ board_id: boardId, limit: -1 });

    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error).toBe('Invalid limit');

    const badOffset = await request(app)
      .post('/api/notes/list')
      .send({ board_id: boardId, offset: -5 });

    expect(badOffset.status).toBe(400);
    expect(badOffset.body.error).toBe('Invalid offset');
  });

  test('creates, updates, lists, and deletes notes', async () => {
    const createResponse = await request(app)
      .post('/api/notes/create')
      .send({ board_id: boardId, payload });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.id).toBeDefined();

    const noteId = createResponse.body.id;

    const listResponse = await request(app)
      .post('/api/notes/list')
      .send({ board_id: boardId });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notes).toHaveLength(1);
    expect(listResponse.body.notes[0].id).toBe(noteId);
    expect(listResponse.body.notes[0].payload).toBe(payload);

    const updateResponse = await request(app)
      .post('/api/notes/update')
      .send({ board_id: boardId, id: noteId, payload: updatedPayload });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.ok).toBe(true);

    const listUpdated = await request(app)
      .post('/api/notes/list')
      .send({ board_id: boardId });

    expect(listUpdated.body.notes).toHaveLength(1);
    expect(listUpdated.body.notes[0].payload).toBe(updatedPayload);

    const deleteResponse = await request(app)
      .post('/api/notes/delete')
      .send({ board_id: boardId, id: noteId });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);

    const listAfterDelete = await request(app)
      .post('/api/notes/list')
      .send({ board_id: boardId });

    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body.notes).toHaveLength(0);
  });

  test('lists notes updated since a timestamp', async () => {
    const deltaBoardId = 'f'.repeat(64);

    const createOne = await request(app)
      .post('/api/notes/create')
      .send({ board_id: deltaBoardId, payload });

    expect(createOne.status).toBe(200);
    const noteOneId = createOne.body.id;

    const baseline = await request(app)
      .post('/api/notes/list')
      .send({ board_id: deltaBoardId });

    const baselineTime = baseline.body.server_time - 1;
    expect(Number.isFinite(baselineTime)).toBe(true);

    const createTwo = await request(app)
      .post('/api/notes/create')
      .send({ board_id: deltaBoardId, payload: updatedPayload });

    const noteTwoId = createTwo.body.id;

    const updateOne = await request(app)
      .post('/api/notes/update')
      .send({ board_id: deltaBoardId, id: noteOneId, payload: updatedPayload });

    expect(updateOne.status).toBe(200);

    const deltaList = await request(app)
      .post('/api/notes/list')
      .send({ board_id: deltaBoardId, updated_since: baselineTime });

    expect(deltaList.status).toBe(200);
    expect(deltaList.body.notes).toHaveLength(2);
    expect(deltaList.body.deleted).toEqual([]);

    const deleteTwo = await request(app)
      .post('/api/notes/delete')
      .send({ board_id: deltaBoardId, id: noteTwoId });

    expect(deleteTwo.status).toBe(200);

    const deltaAfterDelete = await request(app)
      .post('/api/notes/list')
      .send({ board_id: deltaBoardId, updated_since: baselineTime });

    expect(deltaAfterDelete.status).toBe(200);
    expect(deltaAfterDelete.body.deleted).toContain(noteTwoId);
    expect(deltaAfterDelete.body.notes.find((note) => note.id === noteTwoId)).toBeUndefined();
  });

  test('validates note ids on update', async () => {
    const response = await request(app)
      .post('/api/notes/update')
      .send({ board_id: boardId, id: 'bad', payload });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid note id');
  });

  test('returns not found for missing notes', async () => {
    const missingBoardId = 'c'.repeat(64);
    const missingNoteId = 'd'.repeat(16);

    const updateResponse = await request(app)
      .post('/api/notes/update')
      .send({ board_id: missingBoardId, id: missingNoteId, payload });

    expect(updateResponse.status).toBe(404);
    expect(updateResponse.body.error).toBe('Note not found');

    const deleteResponse = await request(app)
      .post('/api/notes/delete')
      .send({ board_id: missingBoardId, id: missingNoteId });

    expect(deleteResponse.status).toBe(404);
    expect(deleteResponse.body.error).toBe('Note not found');
  });

  test('enforces the note limit per board', async () => {
    const limitBoardId = 'b'.repeat(64);

    db.ensureBoard(limitBoardId);
    for (let i = 0; i < 300; i += 1) {
      db.createNote(limitBoardId, payload);
    }

    const response = await request(app)
      .post('/api/notes/create')
      .send({ board_id: limitBoardId, payload });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Note limit exceeded');
  });

  test('paginates note lists', async () => {
    const pagedBoardId = 'e'.repeat(64);

    await request(app)
      .post('/api/notes/create')
      .send({ board_id: pagedBoardId, payload });
    await request(app)
      .post('/api/notes/create')
      .send({ board_id: pagedBoardId, payload: updatedPayload });
    await request(app)
      .post('/api/notes/create')
      .send({ board_id: pagedBoardId, payload });

    const firstPage = await request(app)
      .post('/api/notes/list')
      .send({ board_id: pagedBoardId, limit: 2, offset: 0 });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.notes).toHaveLength(2);

    const secondPage = await request(app)
      .post('/api/notes/list')
      .send({ board_id: pagedBoardId, limit: 2, offset: 2 });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.notes).toHaveLength(1);
  });

  test('purges soft-deleted notes after retention window', () => {
    const cleanupBoardId = 'f'.repeat(64);

    db.ensureBoard(cleanupBoardId);
    const note = db.createNote(cleanupBoardId, payload);
    db.updateNote(cleanupBoardId, note.id, undefined, true);

    const testDb = new Database(dbPath);
    const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;
    testDb.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(oldTimestamp, note.id);

    const removed = db.cleanupDeletedNotes(Date.now() - 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);

    const row = testDb.prepare('SELECT COUNT(*) AS count FROM notes WHERE id = ?').get(note.id);
    expect(row.count).toBe(0);

    testDb.close();
  });
});
