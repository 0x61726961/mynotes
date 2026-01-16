const Notes = (() => {
  const NOTE_SIZE = 180;
  const BOARD_WIDTH = 2400;
  const BOARD_HEIGHT = 1600;
  
  const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'lavender'];
  const COLOR_VARIANTS = ['', 'v1', 'v2'];
  const PAGE_LIMIT = 100;
  const REQUEST_TIMEOUT_MS = 15000;
  const API_BASE = (() => {
    const path = window.location.pathname || '';
    return path.startsWith('/mynotes') ? '/mynotes/api' : '/api';
  })();
  
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

  function sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      payload = {};
    }

    if (!COLORS.includes(payload.color)) {
      payload.color = COLORS[0];
    }

    const validTypes = ['text', 'image', 'doodle'];
    if (!validTypes.includes(payload.type)) {
      payload.type = 'text';
    }

    if (payload.type === 'text') {
      payload.text = typeof payload.text === 'string' ? payload.text : '';
    } else if (payload.type === 'image') {
      payload.img = payload.img ?? null;
    } else if (payload.type === 'doodle') {
      payload.doodle = payload.doodle ?? null;
    }

    return payload;
  }

  function isEmptyDraft(payload) {
    if (!payload || typeof payload !== 'object') return true;
    if (payload.type === 'text') return !payload.text;
    if (payload.type === 'image') return !payload.img;
    if (payload.type === 'doodle') return !payload.doodle;
    return true;
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
    const response = await fetch(`${API_BASE}/notes/list`, {
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
        const encryptedPayloadLength = typeof note.payload === 'string' ? note.payload.length : null;
        try {
          let payload = await Crypto.decryptPayload(encryptionKey, note.payload);
          payload = sanitizePayload(payload);

          if (payload.type === 'image') {
            const imgSize = typeof payload.img?.data === 'string' ? payload.img.data.length : 0;
            console.info('[Notes] load image note', {
              id: note.id,
              draft: Boolean(payload.draft),
              hasImg: Boolean(payload.img?.data),
              imgSize
            });
          }

          if (payload.draft && isEmptyDraft(payload)) {
            console.warn('[Notes] deleting empty draft note', {
              id: note.id,
              type: payload.type
            });
            try {
              await deleteNote(note.id);
            } catch (err) {
              console.warn('Failed to delete draft note:', note.id, err);
            }
            continue;
          }

          if (payload.draft) {
            payload.draft = false;
          }

          const safeX = Number.isFinite(payload.x)
            ? payload.x
            : BOARD_WIDTH / 2 - NOTE_SIZE / 2;
          const safeY = Number.isFinite(payload.y)
            ? payload.y
            : BOARD_HEIGHT / 2 - NOTE_SIZE / 2;
          const clamped = clampPosition(safeX, safeY);
          payload.x = clamped.x;
          payload.y = clamped.y;

          payload.rot = Number.isFinite(payload.rot) ? payload.rot : 0;

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
          console.warn('Failed to decrypt note:', note.id, {
            error: err,
            encryptedPayloadLength
          });
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
    const payloadSize = typeof encryptedPayload === 'string' ? encryptedPayload.length : 0;
    const body = JSON.stringify({
      board_id: boardId,
      payload: encryptedPayload
    });
    const bodySize = body.length;

    console.info('[Notes] create payload', { type, payloadSize, bodySize });

    let response;
    try {
      response = await fetchWithTimeout(`${API_BASE}/notes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }, { action: 'create', type, payloadSize, bodySize });
    } catch (err) {
      console.warn('[Notes] create fetch failed', { type, payloadSize, bodySize, error: err });
      throw err;
    }

    if (!response.ok) {
      console.warn('[Notes] create failed', { status: response.status, type, payloadSize, bodySize });
      throw await buildRequestError(response, 'Failed to create note');
    }

    console.info('[Notes] create ok', { status: response.status, type, payloadSize, bodySize });
    
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
    const payloadSize = typeof encryptedPayload === 'string' ? encryptedPayload.length : 0;
    const body = JSON.stringify({
      board_id: boardId,
      id,
      payload: encryptedPayload
    });
    const bodySize = body.length;
    const type = note.payload?.type || 'unknown';

    console.info('[Notes] update payload', { id, type, payloadSize, bodySize });

    let response;
    try {
      response = await fetchWithTimeout(`${API_BASE}/notes/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }, { action: 'update', id, type, payloadSize, bodySize });
    } catch (err) {
      console.warn('[Notes] update fetch failed', { id, type, payloadSize, bodySize, error: err });
      throw err;
    }
    
    if (!response.ok) {
      console.warn('[Notes] update failed', { status: response.status, id, type, payloadSize, bodySize });
      throw await buildRequestError(response, 'Failed to update note');
    }

    console.info('[Notes] update ok', { status: response.status, id, type, payloadSize, bodySize });
  }
  
  async function deleteNote(id) {
    const response = await fetch(`${API_BASE}/notes/delete`, {
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
  
  function fetchWithTimeout(url, options, context) {
    if (typeof AbortController === 'undefined') {
      return fetch(url, options);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const requestOptions = { ...options, signal: controller.signal };

    return fetch(url, requestOptions)
      .catch((err) => {
        if (err?.name === 'AbortError') {
          console.warn('[Notes] request timed out', { ...context, timeoutMs: REQUEST_TIMEOUT_MS });
        }
        throw err;
      })
      .finally(() => clearTimeout(timeoutId));
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
