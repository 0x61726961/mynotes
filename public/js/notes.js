/**
 * Notes module - Note data management and rendering
 */

const Notes = (() => {
  const NOTE_SIZE = 180;
  const BOARD_WIDTH = 2400;
  const BOARD_HEIGHT = 1600;
  
  const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'lavender'];
  const COLOR_VARIANTS = ['', 'v1', 'v2'];
  
  // In-memory cache of decrypted notes
  let notesCache = new Map();
  let encryptionKey = null;
  let boardId = null;
  let stackCounter = 0;
  
  /**
   * Initialize notes module with crypto keys
   * @param {string} bid - Board ID
   * @param {CryptoKey} key - Encryption key
   */
  function init(bid, key) {
    boardId = bid;
    encryptionKey = key;
    notesCache.clear();
    stackCounter = 0;
  }
  
  /**
   * Generate random rotation between -4 and +4 degrees
   * @returns {number}
   */
  function randomRotation() {
    return (Math.random() - 0.5) * 8;
  }
  
  /**
   * Get random color variant for visual interest
   * @returns {string}
   */
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
  
  /**
   * Get a random base note color
   * @returns {string}
   */
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
  
  /**
   * Create a new note payload object
   * @param {string} type - 'text', 'image', or 'doodle'
   * @param {object} data - Type-specific data
   * @param {string} color - Note color
   * @returns {object} Note payload
   */
  function createPayload(type, data, color, position) {
    // Random position near center of board
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
      done: false
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
  
  /**
   * Load notes from server
   * @param {object} options
   * @param {boolean} [options.resetCache=true] - Clear cache before loading
   * @returns {Promise<Array>} Array of decrypted notes
   */
  async function loadNotes(options = {}) {
    const { resetCache = true } = options;
    const response = await fetch('/api/notes/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to load notes');
    }
    
    const { notes } = await response.json();
    
    if (resetCache) {
      notesCache.clear();
      stackCounter = 0;
    }
    
    // Decrypt all notes
    const decrypted = [];
    for (const note of notes) {
      try {
        const payload = await Crypto.decryptPayload(encryptionKey, note.payload);
        // Skip done notes
        if (payload.done) continue;

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
        // Skip corrupted notes
      }
    }
    
    return applyStackOrder(decrypted);
  }
  
  /**
   * Create a new note on server
   * @param {string} type
   * @param {object} data
   * @param {string} color
   * @returns {Promise<object>} Created note with ID
   */
  async function createNote(type, data, color, position) {
    const payload = createPayload(type, data, color, position);
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
      throw new Error('Failed to create note');
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
  
  /**
   * Update a note on server
   * @param {string} id - Note ID
   * @param {object} updates - Partial payload updates
   * @returns {Promise<void>}
   */
  async function updateNote(id, updates) {
    const note = notesCache.get(id);
    if (!note) throw new Error('Note not found in cache');

    note.updatedAt = Date.now();
    
    // Merge updates into payload
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
      throw new Error('Failed to update note');
    }
  }
  
  /**
   * Delete a note
   * @param {string} id
   * @returns {Promise<void>}
   */
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
      throw new Error('Failed to delete note');
    }
    
    notesCache.delete(id);
  }
  
  /**
   * Get a note from cache
   * @param {string} id
   * @returns {object|null}
   */
  function getNote(id) {
    return notesCache.get(id) || null;
  }

  /**
   * Update cached rotation for a note
   * @param {string} id
   * @param {number} rot
   */
  function setNoteRotation(id, rot) {
    const note = notesCache.get(id);
    if (!note) return;
    note.payload.rot = rot;
  }

  /**
   * Mark a note as recently touched for stacking order
   * @param {string} id
   * @returns {number|null} Stack index
   */
  function touchNote(id) {
    const note = notesCache.get(id);
    if (!note) return null;
    note.updatedAt = Date.now();
    stackCounter += 1;
    note.stackIndex = stackCounter;
    return note.stackIndex;
  }
  
  /**
   * Render a note DOM element
   * @param {object} note
   * @returns {HTMLElement}
   */
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

    // Content area
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
  
  /**
   * Update note element position and rotation
   * @param {HTMLElement} el
   * @param {number} x
   * @param {number} y
   * @param {number} rot
   */
  function updateNotePosition(el, x, y, rot) {
    el.dataset.rot = rot;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--note-rot', `${rot}deg`);
  }
  
  /**
   * Clamp position within board bounds
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}}
   */
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
