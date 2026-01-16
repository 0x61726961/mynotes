/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const notesScript = fs.readFileSync(
  path.join(__dirname, '../public/js/notes.js'),
  'utf8'
);

const NotesModule = new Function(`${notesScript}; return Notes;`)();

describe('Notes module', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    global.Crypto = {
      decryptPayload: jest.fn(async (key, payload) => JSON.parse(payload))
    };
  });

  test('clampPosition enforces board bounds', () => {
    const clamped = NotesModule.clampPosition(-20, 99999);

    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(NotesModule.BOARD_HEIGHT - NotesModule.NOTE_SIZE);
  });

  test('randomRotation is deterministic with mocked Math.random', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    expect(NotesModule.randomRotation()).toBe(0);

    Math.random = originalRandom;
  });

  test('randomColor picks from available colors', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    expect(NotesModule.randomColor()).toBe(NotesModule.COLORS[0]);

    Math.random = originalRandom;
  });

  test('renderNote creates a text note element', () => {
    const note = {
      id: 'note-1',
      payload: {
        type: 'text',
        x: 10,
        y: 20,
        rot: 3,
        color: 'yellow',
        text: 'hello'
      },
      variant: 'v1',
      stackIndex: 2
    };

    const element = NotesModule.renderNote(note);

    expect(element.classList.contains('sticky-note')).toBe(true);
    expect(element.dataset.noteId).toBe('note-1');
    expect(element.style.left).toBe('10px');
    expect(element.style.top).toBe('20px');
    expect(element.style.zIndex).toBe('2');

    const body = element.querySelector('.note-body');
    expect(body.className).toContain('yellow');
    expect(body.className).toContain('v1');
    expect(element.textContent).toContain('hello');
  });

  test('loadNotes merges delta updates and deletions', async () => {
    const boardId = 'a'.repeat(64);
    NotesModule.init(boardId, 'key');

    const firstPayload = {
      type: 'text',
      text: 'first',
      x: 10,
      y: 20,
      rot: 0,
      color: 'yellow',
      created_at: 100
    };
    const secondPayload = {
      type: 'text',
      text: 'second',
      x: 30,
      y: 40,
      rot: 0,
      color: 'yellow',
      created_at: 120
    };

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notes: [
            {
              id: 'note-1',
              payload: JSON.stringify(firstPayload),
              created_at: 100,
              updated_at: 100
            },
            {
              id: 'note-2',
              payload: JSON.stringify(secondPayload),
              created_at: 120,
              updated_at: 120
            }
          ],
          deleted: [],
          server_time: 1000
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notes: [
            {
              id: 'note-1',
              payload: JSON.stringify({
                ...firstPayload,
                text: 'updated'
              }),
              created_at: 100,
              updated_at: 200
            }
          ],
          deleted: ['note-2'],
          server_time: 1200
        })
      });

    await NotesModule.loadNotes({ resetCache: true });

    expect(NotesModule.getNote('note-1').payload.text).toBe('first');
    expect(NotesModule.getNote('note-2')).not.toBeNull();
    expect(NotesModule.getLastServerTime()).toBe(1000);

    const notes = await NotesModule.loadNotes({
      resetCache: false,
      updatedSince: NotesModule.getLastServerTime()
    });

    expect(NotesModule.getNote('note-1').payload.text).toBe('updated');
    expect(NotesModule.getNote('note-2')).toBeNull();
    expect(NotesModule.getLastServerTime()).toBe(1200);
    expect(notes.map((note) => note.id)).toEqual(['note-1']);

    const secondCallBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(secondCallBody.updated_since).toBe(1000);
  });
});
