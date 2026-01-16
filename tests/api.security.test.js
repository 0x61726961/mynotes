const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const dbPath = path.join(
  os.tmpdir(),
  `mynotes-security-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.DB_PATH = dbPath;

const app = require('../server/index');
const db = require('../server/db');

const validBoardId = 'a'.repeat(64);
const uppercaseBoardId = 'A'.repeat(64);
const payload = JSON.stringify({ iv: 'iv', ct: 'ct' });

afterAll(() => {
  db.close();
  [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
});

describe('Notes API security validations', () => {
  test('rejects malformed JSON payloads', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .set('Content-Type', 'application/json')
      .send('{"board_id":"' + validBoardId + '","payload":')
      .expect(400);

    expect(response.status).toBe(400);
  });

  test('accepts uppercase board ids', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .send({ board_id: uppercaseBoardId, payload });

    expect(response.status).toBe(200);
    expect(response.body.id).toBeDefined();
  });

  test('rejects payloads missing iv/ct fields', async () => {
    const missingIv = await request(app)
      .post('/api/notes/create')
      .send({ board_id: validBoardId, payload: JSON.stringify({ ct: 'ct' }) });

    expect(missingIv.status).toBe(400);
    expect(missingIv.body.error).toBe('Invalid payload');

    const missingCt = await request(app)
      .post('/api/notes/create')
      .send({ board_id: validBoardId, payload: JSON.stringify({ iv: 'iv' }) });

    expect(missingCt.status).toBe(400);
    expect(missingCt.body.error).toBe('Invalid payload');
  });

  test('rejects payloads with non-string iv/ct', async () => {
    const response = await request(app)
      .post('/api/notes/create')
      .send({
        board_id: validBoardId,
        payload: JSON.stringify({ iv: 123, ct: true })
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  test('rejects non-numeric limit/offset values', async () => {
    const badLimit = await request(app)
      .post('/api/notes/list')
      .send({ board_id: validBoardId, limit: 'not-a-number' });

    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error).toBe('Invalid limit');

    const badOffset = await request(app)
      .post('/api/notes/list')
      .send({ board_id: validBoardId, offset: 'nope' });

    expect(badOffset.status).toBe(400);
    expect(badOffset.body.error).toBe('Invalid offset');

    const badUpdatedSince = await request(app)
      .post('/api/notes/list')
      .send({ board_id: validBoardId, updated_since: 'nope' });

    expect(badUpdatedSince.status).toBe(400);
    expect(badUpdatedSince.body.error).toBe('Invalid updated_since');
  });

  test('soft deletes notes via update deleted flag', async () => {
    const createResponse = await request(app)
      .post('/api/notes/create')
      .send({ board_id: validBoardId, payload });

    const noteId = createResponse.body.id;

    const deleteResponse = await request(app)
      .post('/api/notes/update')
      .send({ board_id: validBoardId, id: noteId, deleted: true });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);

    const listResponse = await request(app)
      .post('/api/notes/list')
      .send({ board_id: validBoardId });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notes).toHaveLength(0);
  });

  test('rejects short note ids', async () => {
    const response = await request(app)
      .post('/api/notes/update')
      .send({ board_id: validBoardId, id: '1234567', payload });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid note id');
  });
});
