/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const notesScript = fs.readFileSync(
  path.join(__dirname, '../public/js/notes.js'),
  'utf8'
);

const NotesModule = new Function(`${notesScript}; return Notes;`)();

describe('Notes module', () => {
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
});
