/**
 * Main application module
 * Coordinates all modules and handles UI interactions
 */

const App = (() => {
  // DOM elements
  let loginScreen, boardScreen;
  let passphraseInput, passphraseForm, openBoardBtn, togglePasswordBtn;
  let textModal, imageModal, doodleModal;
  let contextMenu;
  let loadingOverlay, loadingText;
  let doodleBrushButtons, doodleEraserBtn;
  
  // State
  let currentBoardId = null;
  let encryptionKey = null;
  let selectedColor = 'yellow';
  let currentEditNoteId = null;
  let imageData = null;
  
  // Debounce for saves
  let pendingSaveTimers = new Map();
  let pendingNoteUpdates = new Map();
  let pendingSaveCount = 0;
  
  // Refresh state
  let refreshInterval = null;
  let isRefreshing = false;
  let lastLocalChangeAt = 0;
  const REFRESH_INTERVAL_MS = 5000;
  
  /**
   * Initialize the application
   */
  function init() {
    // Get DOM elements
    loginScreen = document.getElementById('login-screen');
    boardScreen = document.getElementById('board-screen');
    passphraseInput = document.getElementById('passphrase');
    passphraseForm = document.getElementById('passphrase-form');
    openBoardBtn = document.getElementById('open-board-btn');
    togglePasswordBtn = document.getElementById('toggle-password');
    textModal = document.getElementById('text-modal');
    imageModal = document.getElementById('image-modal');
    doodleModal = document.getElementById('doodle-modal');
    contextMenu = document.getElementById('note-context-menu');
    loadingOverlay = document.getElementById('loading-overlay');
    loadingText = document.getElementById('loading-text');
    doodleBrushButtons = document.querySelectorAll('.doodle-tool-btn');
    doodleEraserBtn = document.getElementById('doodle-eraser');
    
    // Setup event listeners
    setupLoginEvents();
    setupToolbarEvents();
    setupModalEvents();
    setupContextMenu();
    
    // Initialize doodle editor
    DoodleEditor.init(document.getElementById('doodle-canvas'));
    
    // Initialize board with callbacks
    Board.init({
      onNoteMove: handleNoteMove,
      onNoteRotate: handleNoteRotate,
      onNoteClick: handleNoteClick
    });
    
    console.log('MyNotes initialized');
  }
  
  /**
   * Setup login screen events
   */
  function setupLoginEvents() {
    passphraseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await openBoard();
    });
    
    togglePasswordBtn.addEventListener('click', () => {
      const type = passphraseInput.type === 'password' ? 'text' : 'password';
      passphraseInput.type = type;
      togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }
  
  /**
   * Setup toolbar events
   */
  function setupToolbarEvents() {
    document.getElementById('add-text-btn').addEventListener('click', () => {
      openTextModal();
    });
    
    document.getElementById('add-image-btn').addEventListener('click', () => {
      openImageModal();
    });
    
    document.getElementById('add-doodle-btn').addEventListener('click', () => {
      openDoodleModal();
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
      logout();
    });
  }
  
  /**
   * Setup modal events
   */
  function setupModalEvents() {
    // Text modal
    document.getElementById('cancel-text-btn').addEventListener('click', closeTextModal);
    document.getElementById('save-text-btn').addEventListener('click', saveTextNote);
    
    // Image modal
    const imageDropZone = document.getElementById('image-drop-zone');
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    
    imageDropZone.addEventListener('click', () => imageInput.click());
    imageDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      imageDropZone.classList.add('dragover');
    });
    imageDropZone.addEventListener('dragleave', () => {
      imageDropZone.classList.remove('dragover');
    });
    imageDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      imageDropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        await processImageFile(file);
      }
    });
    
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await processImageFile(file);
      }
    });
    
    document.getElementById('cancel-image-btn').addEventListener('click', closeImageModal);
    document.getElementById('save-image-btn').addEventListener('click', saveImageNote);
    
    // Doodle modal
    document.getElementById('doodle-clear').addEventListener('click', () => DoodleEditor.clear());
    document.getElementById('cancel-doodle-btn').addEventListener('click', closeDoodleModal);
    document.getElementById('save-doodle-btn').addEventListener('click', saveDoodleNote);

    doodleBrushButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const size = Number.parseInt(btn.dataset.brush, 10);
        if (!Number.isNaN(size)) {
          DoodleEditor.setBrushSize(size);
          updateDoodleToolUI();
        }
      });
    });

    doodleEraserBtn.addEventListener('click', () => {
      DoodleEditor.setEraser(!DoodleEditor.isEraserEnabled());
      updateDoodleToolUI();
    });
    
    // Color pickers
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectColor(btn.dataset.color);
      });
    });
    
    // Close modals on background click
    [textModal, imageModal, doodleModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeAllModals();
        }
      });
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
        closeContextMenu();
      }
    });
  }
  
  /**
   * Setup context menu
   */
  function setupContextMenu() {
    contextMenu.querySelectorAll('.context-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleContextAction(action);
        closeContextMenu();
      });
    });
    
    // Close on any click outside
    document.addEventListener('click', (e) => {
      if (!contextMenu.contains(e.target)) {
        closeContextMenu();
      }
    });
  }
  
  /**
   * Open board with passphrase
   */
  async function openBoard() {
    const passphrase = passphraseInput.value.trim();
    if (!passphrase) {
      alert('Please enter a passphrase');
      return;
    }
    
    showLoading('Deriving encryption key...');
    
    try {
      // Derive board ID and encryption key
      currentBoardId = await Crypto.deriveBoardId(passphrase);
      encryptionKey = await Crypto.deriveEncryptionKey(passphrase);
      
      // Initialize notes module
      Notes.init(currentBoardId, encryptionKey);
      
      showLoading('Loading notes...');
      
      // Load notes from server
      const notes = await Notes.loadNotes();
      
      // Switch to board screen
      loginScreen.classList.remove('active');
      boardScreen.classList.add('active');
      
      // Clear and render notes
      const orderedNotes = sortNotesForStacking(notes);
      Board.clearNotes();
      orderedNotes.forEach(note => {
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      });
      
      // Center board
      Board.centerBoard();
      
      hideLoading();
      
      // Clear passphrase from input (security)
      passphraseInput.value = '';
      
      startNotesRefresh();
      
    } catch (err) {
      console.error('Failed to open board:', err);
      hideLoading();
      alert('Failed to open board. Please try again.');
    }
  }
  
  /**
   * Refresh notes from server
   */
  async function refreshBoard() {
    if (isRefreshing || !currentBoardId || pendingSaveCount > 0 || pendingSaveTimers.size > 0) return;
    const refreshStartedAt = Date.now();
    isRefreshing = true;
    
    try {
      const notes = await Notes.loadNotes({ resetCache: true });
      if (lastLocalChangeAt > refreshStartedAt) return;
      
      const orderedNotes = sortNotesForStacking(notes);
      const draggingNoteId = Board.getDraggingNoteId();
      Board.clearNotes(draggingNoteId ? { skipNoteId: draggingNoteId } : undefined);
      orderedNotes.forEach(note => {
        if (draggingNoteId && note.id === draggingNoteId) return;
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      });
    } catch (err) {
      console.error('Failed to refresh notes:', err);
    } finally {
      isRefreshing = false;
    }
  }
  
  /**
   * Start periodic refresh
   */
  function startNotesRefresh() {
    stopNotesRefresh();
    refreshInterval = setInterval(refreshBoard, REFRESH_INTERVAL_MS);
  }
  
  /**
   * Stop periodic refresh
   */
  function stopNotesRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
  
  function markLocalChange() {
    lastLocalChangeAt = Date.now();
  }

  function sortNotesForStacking(notes) {
    return [...notes].sort((a, b) => {
      const aStack = a.stackIndex ?? 0;
      const bStack = b.stackIndex ?? 0;
      if (aStack !== bStack) return aStack - bStack;
      const aTime = a.updatedAt ?? a.createdAt ?? a.payload?.created_at ?? 0;
      const bTime = b.updatedAt ?? b.createdAt ?? b.payload?.created_at ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return (a.id || '').localeCompare(b.id || '');
    });
  }

  function getRotationForNote(noteId) {
    const el = Board.getNoteElement(noteId);
    if (el?.dataset?.rot !== undefined) {
      const parsed = parseFloat(el.dataset.rot);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const note = Notes.getNote(noteId);
    return note?.payload?.rot ?? 0;
  }
  
  /**
   * Run a note update with refresh protection
   * @param {string} noteId
   * @param {object} updates
   */
  async function runNoteUpdate(noteId, updates) {
    pendingSaveCount += 1;
    try {
      await Notes.updateNote(noteId, updates);
    } finally {
      pendingSaveCount = Math.max(0, pendingSaveCount - 1);
    }
  }

  function queueNoteSave(noteId, updates, onError) {
    markLocalChange();
    const existingUpdates = pendingNoteUpdates.get(noteId) || {};
    pendingNoteUpdates.set(noteId, { ...existingUpdates, ...updates });

    const existingTimer = pendingSaveTimers.get(noteId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timerId = setTimeout(async () => {
      pendingSaveTimers.delete(noteId);
      const pendingUpdates = pendingNoteUpdates.get(noteId);
      pendingNoteUpdates.delete(noteId);
      if (!pendingUpdates) return;
      try {
        await runNoteUpdate(noteId, pendingUpdates);
      } catch (err) {
        onError?.(err);
      }
    }, 500);

    pendingSaveTimers.set(noteId, timerId);
  }
  
  /**
   * Logout and return to login screen
   */
  function logout() {
    currentBoardId = null;
    encryptionKey = null;
    Board.clearNotes();
    stopNotesRefresh();
    
    boardScreen.classList.remove('active');
    loginScreen.classList.add('active');
  }
  
  /**
   * Handle note position change
   */
  function handleNoteMove(noteId, x, y) {
    queueNoteSave(
      noteId,
      { x, y, rot: getRotationForNote(noteId) },
      (err) => {
        console.error('Failed to save note position:', err);
      }
    );
  }
  
  /**
   * Handle note rotation change
   */
  function handleNoteRotate(noteId, rotation) {
    queueNoteSave(
      noteId,
      { rot: rotation },
      (err) => {
        console.error('Failed to save note rotation:', err);
      }
    );
  }
  
  /**
   * Handle note click (context menu or edit)
   */
  function handleNoteClick(noteId, clientX, clientY, type) {
    currentEditNoteId = noteId;
    
    if (type === 'context') {
      showContextMenu(clientX, clientY);
    } else if (type === 'edit') {
      // Open edit modal based on note type
      const note = Notes.getNote(noteId);
      if (note && note.payload.type === 'text') {
        openTextModal(note);
      }
    }
  }
  
  /**
   * Show context menu
   */
  function showContextMenu(x, y) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('active');
  }
  
  /**
   * Close context menu
   */
  function closeContextMenu() {
    contextMenu.classList.remove('active');
    currentEditNoteId = null;
  }
  
  /**
   * Handle context menu action
   */
  async function handleContextAction(action) {
    const noteId = currentEditNoteId;
    if (!noteId) return;
    
    const note = Notes.getNote(noteId);
    if (!note) return;
    
    switch (action) {
      case 'edit':
        if (note.payload.type === 'text') {
          openTextModal(note);
        }
        break;
        
      case 'rotate':
        // Rotate by 5 degrees
        const newRot = (note.payload.rot + 5) % 360;
        const el = Board.getNoteElement(noteId);
        if (el) {
          Notes.updateNotePosition(el, note.payload.x, note.payload.y, newRot);
          markLocalChange();
          await runNoteUpdate(noteId, { rot: newRot });
        }
        break;
        
      case 'delete':
        if (confirm('Delete this note?')) {
          markLocalChange();
          await Notes.deleteNote(noteId);
          Board.removeNote(noteId);
        }
        break;
    }
  }
  
  /**
   * Open text note modal
   */
  function openTextModal(existingNote = null) {
    const textarea = document.getElementById('note-text');
    
    if (existingNote) {
      textarea.value = existingNote.payload.text || '';
      currentEditNoteId = existingNote.id;
      selectColor(existingNote.payload.color);
    } else {
      textarea.value = '';
      currentEditNoteId = null;
      selectColor(Notes.randomColor());
    }
    
    textModal.classList.add('active');
    textarea.focus();
  }
  
  /**
   * Close text modal
   */
  function closeTextModal() {
    textModal.classList.remove('active');
    currentEditNoteId = null;
  }
  
  /**
   * Save text note
   */
  async function saveTextNote() {
    const text = document.getElementById('note-text').value.trim();
    if (!text) {
      alert('Please enter some text');
      return;
    }
    
    try {
      if (currentEditNoteId) {
        // Update existing note
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, { text, color: selectedColor });
        
        // Re-render note
        const note = Notes.getNote(currentEditNoteId);
        const oldEl = Board.getNoteElement(currentEditNoteId);
        if (oldEl && note) {
          const newEl = Notes.renderNote(note);
          oldEl.replaceWith(newEl);
          Board.setupNoteDragging(newEl);
        }
      } else {
        // Create new note
        markLocalChange();
        const note = await Notes.createNote('text', { text }, selectedColor);
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      }
      
      closeTextModal();
    } catch (err) {
      console.error('Failed to save note:', err);
      alert('Failed to save note');
    }
  }
  
  /**
   * Open image modal
   */
  function openImageModal() {
    imageData = null;
    document.getElementById('image-input').value = '';
    document.getElementById('image-preview').classList.remove('has-image');
    document.getElementById('save-image-btn').disabled = true;
    selectColor(Notes.randomColor());
    imageModal.classList.add('active');
  }
  
  /**
   * Close image modal
   */
  function closeImageModal() {
    imageModal.classList.remove('active');
    imageData = null;
  }
  
  /**
   * Process uploaded image file
   */
  async function processImageFile(file) {
    try {
      showLoading('Processing image...');
      imageData = await ImageProcessor.processImage(file);
      
      // Show preview
      const preview = document.getElementById('image-preview');
      ImageProcessor.renderToCanvas(preview, imageData);
      preview.classList.add('has-image');
      document.getElementById('save-image-btn').disabled = false;
      
      hideLoading();
    } catch (err) {
      console.error('Failed to process image:', err);
      hideLoading();
      alert('Failed to process image');
    }
  }
  
  /**
   * Save image note
   */
  async function saveImageNote() {
    if (!imageData) return;
    
    try {
      markLocalChange();
      const note = await Notes.createNote('image', { img: imageData }, selectedColor);
      const noteEl = Notes.renderNote(note);
      Board.addNote(noteEl);
      closeImageModal();
    } catch (err) {
      console.error('Failed to save image note:', err);
      alert('Failed to save image note');
    }
  }
  
  /**
   * Open doodle modal
   */
  function openDoodleModal() {
    DoodleEditor.clear();
    DoodleEditor.resetTools();
    updateDoodleToolUI();
    selectColor(Notes.randomColor());
    doodleModal.classList.add('active');
  }
  
  /**
   * Close doodle modal
   */
  function closeDoodleModal() {
    doodleModal.classList.remove('active');
  }
  
  /**
   * Save doodle note
   */
  async function saveDoodleNote() {
    if (DoodleEditor.isEmpty()) {
      alert('Please draw something first');
      return;
    }
    
    try {
      const doodleData = DoodleEditor.getData();
      markLocalChange();
      const note = await Notes.createNote('doodle', { doodle: doodleData }, selectedColor);
      const noteEl = Notes.renderNote(note);
      Board.addNote(noteEl);
      closeDoodleModal();
    } catch (err) {
      console.error('Failed to save doodle note:', err);
      alert('Failed to save doodle note');
    }
  }
  
  /**
   * Close all modals
   */
  function closeAllModals() {
    closeTextModal();
    closeImageModal();
    closeDoodleModal();
  }
  
  /**
   * Select color in current modal
   */
  function updateDoodleToolUI() {
    const currentSize = DoodleEditor.getBrushSize();
    const erasing = DoodleEditor.isEraserEnabled();

    doodleBrushButtons.forEach(btn => {
      const size = Number.parseInt(btn.dataset.brush, 10);
      const isActive = !erasing && size === currentSize;
      btn.classList.toggle('active', isActive);
    });

    doodleEraserBtn.classList.toggle('active', erasing);
  }

  function selectColor(color) {
    selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === color);
    });
  }
  
  /**
   * Show loading overlay
   */
  function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.add('active');
  }
  
  /**
   * Hide loading overlay
   */
  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }
  
  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  return {
    openBoard,
    logout
  };
})();
