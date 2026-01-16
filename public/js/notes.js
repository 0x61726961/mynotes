const Notes = (() => {
  const NOTE_SIZE = 180;
  const BOARD_WIDTH = 2400;
  const BOARD_HEIGHT = 1600;
  
  const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'lavender'];
  const COLOR_VARIANTS = ['', 'v1', 'v2'];
  const PAGE_LIMIT = 100;
  
  let notesCache = new Map();
  let encryptionKey = null;
  let boardId = null;
  let stackCounter = 0;
  
  function init(bid, key) {
    boardId = bid;
    encryptionKey = key;
    notesCache.clear();
    stackCounter = 0;
  }
  
  function randomRotation() {
    return (Math.random() - 0.5) * 8;
  }
  
  function randomVariant() {
    return COLOR_VARIANTS[Math.floor(Math.random() * COLOR_VARIANTS.length)];
  }

  function variantFromId(noteId) {
    let hash = 0;
    const id = String(noteId || '');
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % COLOR_VARIANTS.length;
    return COLOR_VARIANTS[index];
  }

  function getVariant(noteId, payload) {
    if (payload?.variant && COLOR_VARIANTS.includes(payload.variant)) {
      return payload.variant;
    }
    return variantFromId(noteId);
  }
  
  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function compareNotesForStacking(a, b) {
    const aTime = a.updatedAt ?? a.createdAt ?? a.payload?.created_at ?? 0;
    const bTime = b.updatedAt ?? b.createdAt ?? b.payload?.created_at ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a.id || '').localeCompare(b.id || '');
  }

  function applyStackOrder(notes) {
    const ordered = [...notes].sort(compareNotesForStacking);
    ordered.forEach((note, index) => {
      note.stackIndex = index + 1;
      stackCounter = Math.max(stackCounter, note.stackIndex);
    });
    return ordered;
  }
  
  async function buildRequestError(response, fallbackMessage) {
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    const errorMessage = data?.error || fallbackMessage;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.serverError = data?.error;
    return error;
  }

  function createPayload(type, data, color, position, options = {}) {
    let x = BOARD_WIDTH / 2 - NOTE_SIZE / 2 + (Math.random() - 0.5) * 400;
    let y = BOARD_HEIGHT / 2 - NOTE_SIZE / 2 + (Math.random() - 0.5) * 300;

    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      x = position.x;
      y = position.y;
    }

    const clamped = clampPosition(x, y);

    const payload = {
      type,
      x: clamped.x,
      y: clamped.y,
      rot: randomRotation(),
      color: color || randomColor(),
      created_at: Date.now(),
      done: false,
      draft: Boolean(options.draft)
    };
    
    if (type === 'text') {
      payload.text = data.text || '';
    } else if (type === 'image') {
      payload.img = data.img;
    } else if (type === 'doodle') {
      payload.doodle = data.doodle;
    }
    
    return payload;
  }
  
  async function fetchNotesPage(offset = 0) {
    const response = await fetch('/api/notes/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardId, limit: PAGE_LIMIT, offset })
    });
    
    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to load notes');
    }

    const data = await response.json();
    return Array.isArray(data?.notes) ? data.notes : [];
  }

  async function loadNotes(options = {}) {
    const { resetCache = true } = options;
    
    if (resetCache) {
      notesCache.clear();
      stackCounter = 0;
    }
    
    const decrypted = [];
    let offset = 0;

    while (true) {
      const notes = await fetchNotesPage(offset);
      if (notes.length === 0) {
        break;
      }

      for (const note of notes) {
        try {
          const payload = await Crypto.decryptPayload(encryptionKey, note.payload);
          if (payload.done) continue;

          if (payload.draft) {
            try {
              await deleteNote(note.id);
            } catch (err) {
              console.warn('Failed to delete draft note:', note.id, err);
            }
            continue;
          }

          const createdAt = Number.isFinite(note.created_at)
            ? note.created_at
            : payload.created_at;
          const updatedAt = Number.isFinite(note.updated_at)
            ? note.updated_at
            : createdAt;
          
          const decryptedNote = {
            id: note.id,
            payload,
            createdAt,
            updatedAt,
            variant: getVariant(note.id, payload)
          };
          notesCache.set(note.id, decryptedNote);
          decrypted.push(decryptedNote);
        } catch (err) {
          console.warn('Failed to decrypt note:', note.id, err);
        }
      }

      offset += notes.length;
      if (notes.length < PAGE_LIMIT) {
        break;
      }
    }
    
    return applyStackOrder(decrypted);
  }
  
  async function createNote(type, data, color, position, options = {}) {
    const payload = createPayload(type, data, color, position, options);
    const encryptedPayload = await Crypto.encryptPayload(encryptionKey, payload);
    
    const response = await fetch('/api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        payload: encryptedPayload
      })
    });
    
    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to create note');
    }
    
    const { id } = await response.json();
    
    const note = {
      id,
      payload,
      createdAt: payload.created_at,
      updatedAt: payload.created_at,
      stackIndex: stackCounter + 1,
      variant: getVariant(id, payload)
    };
    stackCounter = note.stackIndex;
    notesCache.set(id, note);
    
    return note;
  }
  
  async function updateNote(id, updates) {
    const note = notesCache.get(id);
    if (!note) throw new Error('Note not found in cache');

    note.updatedAt = Date.now();
    
    Object.assign(note.payload, updates);
    
    const encryptedPayload = await Crypto.encryptPayload(encryptionKey, note.payload);
    
    const response = await fetch('/api/notes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        id,
        payload: encryptedPayload
      })
    });
    
    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to update note');
    }
  }
  
  async function deleteNote(id) {
    const response = await fetch('/api/notes/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        id
      })
    });
    
    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to delete note');
    }
    
    notesCache.delete(id);
  }
  
  function getNote(id) {
    return notesCache.get(id) || null;
  }

  function setNoteRotation(id, rot) {
    const note = notesCache.get(id);
    if (!note) return;
    note.payload.rot = rot;
  }

  function touchNote(id) {
    const note = notesCache.get(id);
    if (!note) return null;
    note.updatedAt = Date.now();
    stackCounter += 1;
    note.stackIndex = stackCounter;
    return note.stackIndex;
  }
  
  function renderNote(note) {
    const { id, payload, variant } = note;
    const { type, x, y, rot, color, text, img, doodle } = payload;
    
    const el = document.createElement('div');
    el.className = 'sticky-note';
    el.dataset.noteId = id;
    el.dataset.rot = rot;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = note.stackIndex ?? 0;
    el.style.setProperty('--note-rot', `${rot}deg`);
    
    const shadow = document.createElement('div');
    shadow.className = 'note-shadow';

    const shadowInner = document.createElement('div');
    shadowInner.className = 'note-shadow-inner';
    shadow.appendChild(shadowInner);

    const body = document.createElement('div');
    body.className = `note-body ${color} ${variant}`;

    const content = document.createElement('div');
    content.className = 'note-content';
    
    if (type === 'text') {
      content.classList.add('text-content');
      content.textContent = text;
    } else if (type === 'image' && img) {
      const canvas = ImageProcessor.createPreviewCanvas(img);
      content.appendChild(canvas);
    } else if (type === 'doodle' && doodle) {
      const canvas = DoodleEditor.createPreviewCanvas(doodle);
      content.appendChild(canvas);
    }
    
    body.appendChild(content);
    el.appendChild(shadow);
    el.appendChild(body);

    return el;
  }
  
  function updateNotePosition(el, x, y, rot) {
    el.dataset.rot = rot;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--note-rot', `${rot}deg`);
  }
  
  function clampPosition(x, y) {
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH - NOTE_SIZE, x)),
      y: Math.max(0, Math.min(BOARD_HEIGHT - NOTE_SIZE, y))
    };
  }
  
  return {
    NOTE_SIZE,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    COLORS,
    init,
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    getNote,
    setNoteRotation,
    touchNote,
    renderNote,
    updateNotePosition,
    clampPosition,
    randomColor,
    randomRotation
  };
})();
