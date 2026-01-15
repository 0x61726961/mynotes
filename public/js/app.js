/**
 * Main application module
 * Coordinates all modules and handles UI interactions
 */

const App = (() => {
  // DOM elements
  let loginScreen, boardScreen;
  let passphraseInput, passphraseForm, openBoardBtn, rememberRoomCheckbox;
  let textModal, imageModal, doodleModal, deleteModal;
  let loadingOverlay, loadingText, toastContainer;
  let doodleBrushButtons, doodleEraserBtn;
  let addFabContainer, addFabButton, addFabMenu;
  let confirmDeleteBtn, cancelDeleteBtn;
  let roomLabel;
  let backgroundCanvas;
  
  // State
  let currentBoardId = null;
  let encryptionKey = null;
  let selectedColor = 'yellow';
  let currentEditNoteId = null;
  let imageData = null;
  let pendingDraftNoteId = null;
  let pendingDeleteNoteId = null;
  let roomBackgroundController = null;
  
  // Debounce for saves
  let pendingSaveTimers = new Map();
  let pendingNoteUpdates = new Map();
  let pendingSaveCount = 0;
  
  // Refresh state
  let refreshInterval = null;
  let isRefreshing = false;
  let lastLocalChangeAt = 0;
  const REFRESH_INTERVAL_MS = 5000;
  const DEFAULT_ROOM = 'public';
  const REMEMBER_ROOM_KEY = 'mynotes.rememberRoom';
  const LAST_ROOM_KEY = 'mynotes.lastRoom';
  const TOAST_DURATION_MS = 2800;
  const TOAST_ANIMATION_MS = 200;
  
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
    rememberRoomCheckbox = document.getElementById('remember-room');
    textModal = document.getElementById('text-modal');
    imageModal = document.getElementById('image-modal');
    doodleModal = document.getElementById('doodle-modal');
    deleteModal = document.getElementById('delete-modal');
    loadingOverlay = document.getElementById('loading-overlay');
    loadingText = document.getElementById('loading-text');
    toastContainer = document.getElementById('toast-container');
    doodleBrushButtons = document.querySelectorAll('.doodle-tool-btn');
    doodleEraserBtn = document.getElementById('doodle-eraser');
    addFabContainer = document.getElementById('add-fab-container');
    addFabButton = document.getElementById('add-fab');
    addFabMenu = document.getElementById('add-fab-menu');
    confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    roomLabel = document.getElementById('room-label');
    backgroundCanvas = document.getElementById('room-bg');
    
    // Setup event listeners
    setupLoginEvents();
    applyRememberedRoom();
    attemptAutoJoin();
    setupFabEvents();
    setupToolbarEvents();
    setupModalEvents();
    
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
    
    rememberRoomCheckbox?.addEventListener('change', () => {
      if (rememberRoomCheckbox.checked) {
        persistRememberedRoom(getPassphraseValue());
      } else {
        clearRememberedRoom();
      }
    });
  }
  
  /**
   * Setup floating action button events
   */
  function setupFabEvents() {
    if (!addFabContainer || !addFabButton || !addFabMenu) return;

    addFabButton.addEventListener('click', () => {
      toggleAddFabMenu();
    });

    document.addEventListener('click', (e) => {
      if (!addFabContainer.contains(e.target)) {
        closeAddFabMenu();
      }
    });
  }

  function openAddFabMenu() {
    if (!addFabContainer || !addFabButton || !addFabMenu) return;
    addFabContainer.classList.add('open');
    addFabButton.setAttribute('aria-expanded', 'true');
    addFabMenu.setAttribute('aria-hidden', 'false');
  }

  function closeAddFabMenu() {
    if (!addFabContainer || !addFabButton || !addFabMenu) return;
    addFabContainer.classList.remove('open');
    addFabButton.setAttribute('aria-expanded', 'false');
    addFabMenu.setAttribute('aria-hidden', 'true');
  }

  function toggleAddFabMenu() {
    if (!addFabContainer) return;
    if (addFabContainer.classList.contains('open')) {
      closeAddFabMenu();
    } else {
      openAddFabMenu();
    }
  }

  /**
   * Setup toolbar events
   */
  function setupToolbarEvents() {
    document.getElementById('add-text-btn').addEventListener('click', async () => {
      closeAddFabMenu();
      const draftNote = await createDraftNote('text');
      if (draftNote) {
        openTextModal(draftNote);
      }
    });
    
    document.getElementById('add-image-btn').addEventListener('click', async () => {
      closeAddFabMenu();
      const draftNote = await createDraftNote('image');
      if (draftNote) {
        openImageModal(draftNote);
      }
    });
    
    document.getElementById('add-doodle-btn').addEventListener('click', async () => {
      closeAddFabMenu();
      const draftNote = await createDraftNote('doodle');
      if (draftNote) {
        openDoodleModal(draftNote);
      }
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
    document.getElementById('delete-text-btn').addEventListener('click', deleteCurrentNoteFromModal);
    
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
    document.getElementById('delete-image-btn').addEventListener('click', deleteCurrentNoteFromModal);
    
    // Doodle modal
    document.getElementById('doodle-clear').addEventListener('click', () => DoodleEditor.clear());
    document.getElementById('cancel-doodle-btn').addEventListener('click', closeDoodleModal);
    document.getElementById('save-doodle-btn').addEventListener('click', saveDoodleNote);
    document.getElementById('delete-doodle-btn').addEventListener('click', deleteCurrentNoteFromModal);

    confirmDeleteBtn?.addEventListener('click', confirmDeleteNote);
    cancelDeleteBtn?.addEventListener('click', closeDeleteModal);

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

    deleteModal?.addEventListener('click', (e) => {
      if (e.target === deleteModal) {
        closeDeleteModal();
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (deleteModal?.classList.contains('active')) {
          closeDeleteModal();
          return;
        }
        closeAllModals();
      }
    });
  }
  
  /**
   * Open board with passphrase
   */
  async function openBoard() {
    const passphrase = getPassphraseValue();
    persistRememberedRoom(passphrase);
    
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
      startRoomBackground(currentBoardId);
      setRoomLabel(passphrase);
      
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
      showToast('Failed to open board. Please try again.');
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

  function getNewNotePosition() {
    if (typeof Board.getViewportCenterPosition === 'function') {
      return Board.getViewportCenterPosition();
    }
    return null;
  }

  async function createDraftNote(type) {
    try {
      const position = getNewNotePosition();
      const color = Notes.randomColor();
      const data = type === 'text'
        ? { text: '' }
        : type === 'image'
          ? { img: null }
          : { doodle: null };

      markLocalChange();
      const note = await Notes.createNote(type, data, color, position);
      const noteEl = Notes.renderNote(note);
      Board.addNote(noteEl);
      pendingDraftNoteId = note.id;
      return note;
    } catch (err) {
      console.error('Failed to create draft note:', err);
      showToast('Failed to create note');
      return null;
    }
  }

  async function discardDraftNote() {
    if (!pendingDraftNoteId) return;
    const draftId = pendingDraftNoteId;
    pendingDraftNoteId = null;
    currentEditNoteId = null;

    try {
      markLocalChange();
      await Notes.deleteNote(draftId);
    } catch (err) {
      console.error('Failed to discard draft note:', err);
    } finally {
      Board.removeNote(draftId);
    }
  }

  async function deleteCurrentNoteFromModal() {
    const noteId = currentEditNoteId;
    if (!noteId) {
      closeAllModals();
      return;
    }

    openDeleteModal(noteId);
  }

  function openDeleteModal(noteId) {
    if (!deleteModal) return;
    pendingDeleteNoteId = noteId;
    deleteModal.classList.add('active');
  }

  function closeDeleteModal() {
    if (!deleteModal) return;
    deleteModal.classList.remove('active');
    pendingDeleteNoteId = null;
  }

  async function confirmDeleteNote() {
    if (!pendingDeleteNoteId) {
      closeDeleteModal();
      return;
    }

    const noteId = pendingDeleteNoteId;
    try {
      markLocalChange();
      await Notes.deleteNote(noteId);
      showToast('Note deleted', { variant: 'info' });
    } catch (err) {
      console.error('Failed to delete note:', err);
      showToast('Failed to delete note');
    } finally {
      Board.removeNote(noteId);
      if (pendingDraftNoteId === noteId) {
        pendingDraftNoteId = null;
      }
      currentEditNoteId = null;
      closeDeleteModal();
      closeAllModals();
    }
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
    const wasRemembering = rememberRoomCheckbox?.checked;
    const lastRoom = localStorage.getItem(LAST_ROOM_KEY) || '';

    currentBoardId = null;
    encryptionKey = null;
    Board.clearNotes();
    stopNotesRefresh();
    stopRoomBackground();
    
    clearAutoJoinPreference();
    boardScreen.classList.remove('active');
    loginScreen.classList.add('active');
    setRoomLabel('');

    if (rememberRoomCheckbox) {
      rememberRoomCheckbox.checked = Boolean(wasRemembering);
    }
    passphraseInput.value = wasRemembering ? lastRoom : '';
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
        showToast('Failed to save note position');
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
        showToast('Failed to save note rotation');
      }
    );
  }
  
  /**
   * Handle note click (edit only)
   */
  function handleNoteClick(noteId, clientX, clientY, type) {
    if (type !== 'edit') return;

    currentEditNoteId = noteId;

    const note = Notes.getNote(noteId);
    if (!note) return;

    if (note.payload.type === 'text') {
      openTextModal(note);
    } else if (note.payload.type === 'image') {
      openImageModal(note);
    } else if (note.payload.type === 'doodle') {
      openDoodleModal(note);
    }
  }
  
  function setModalDeleteButtonState(buttonId, isDraft) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.style.display = isDraft ? 'none' : '';
    button.disabled = isDraft;
  }

  /**
   * Open text note modal
   */
  function openTextModal(existingNote = null) {
    const textarea = document.getElementById('note-text');
    const isDraft = Boolean(pendingDraftNoteId && existingNote?.id === pendingDraftNoteId);
    setModalDeleteButtonState('delete-text-btn', isDraft);
    
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
    discardDraftNote();
  }
  
  /**
   * Save text note
   */
  async function saveTextNote() {
    const text = document.getElementById('note-text').value.trim();
    if (!text) {
      showToast('Please enter some text', { variant: 'info' });
      return;
    }

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
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
          Board.setupNoteInteractions(newEl);
        }
      } else {
        // Create new note
        markLocalChange();
        const position = getNewNotePosition();
        const note = await Notes.createNote('text', { text }, selectedColor, position);
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      }

      if (isDraft) {
        pendingDraftNoteId = null;
      }
      
      closeTextModal();
    } catch (err) {
      console.error('Failed to save note:', err);
      showToast('Failed to save note');
    }
  }
  
  /**
   * Open image modal
   */
  function openImageModal(existingNote = null) {
    imageData = null;
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const saveButton = document.getElementById('save-image-btn');
    const isDraft = Boolean(pendingDraftNoteId && existingNote?.id === pendingDraftNoteId);
    setModalDeleteButtonState('delete-image-btn', isDraft);

    imageInput.value = '';
    imagePreview.classList.remove('has-image');
    saveButton.disabled = true;

    if (existingNote) {
      currentEditNoteId = existingNote.id;
      selectColor(existingNote.payload.color);
      if (existingNote.payload.img) {
        imageData = existingNote.payload.img;
        ImageProcessor.renderToCanvas(imagePreview, imageData);
        imagePreview.classList.add('has-image');
        saveButton.disabled = false;
      }
    } else {
      currentEditNoteId = null;
      selectColor(Notes.randomColor());
    }

    imageModal.classList.add('active');
  }
  
  /**
   * Close image modal
   */
  function closeImageModal() {
    imageModal.classList.remove('active');
    imageData = null;
    currentEditNoteId = null;
    discardDraftNote();
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
      showToast('Failed to process image');
    }
  }
  
  /**
   * Save image note
   */
  async function saveImageNote() {
    if (!imageData) return;

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
    try {
      if (currentEditNoteId) {
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, { img: imageData, color: selectedColor });
        const note = Notes.getNote(currentEditNoteId);
        const oldEl = Board.getNoteElement(currentEditNoteId);
        if (oldEl && note) {
          const newEl = Notes.renderNote(note);
          oldEl.replaceWith(newEl);
          Board.setupNoteInteractions(newEl);
        }
      } else {
        markLocalChange();
        const position = getNewNotePosition();
        const note = await Notes.createNote('image', { img: imageData }, selectedColor, position);
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      }

      if (isDraft) {
        pendingDraftNoteId = null;
      }

      closeImageModal();
    } catch (err) {
      console.error('Failed to save image note:', err);
      showToast('Failed to save image note');
    }
  }
  
  /**
   * Open doodle modal
   */
  function openDoodleModal(existingNote = null) {
    DoodleEditor.clear();
    DoodleEditor.resetTools();
    updateDoodleToolUI();

    const isDraft = Boolean(pendingDraftNoteId && existingNote?.id === pendingDraftNoteId);
    setModalDeleteButtonState('delete-doodle-btn', isDraft);

    if (existingNote) {
      currentEditNoteId = existingNote.id;
      selectColor(existingNote.payload.color);
      if (existingNote.payload.doodle) {
        DoodleEditor.setData(existingNote.payload.doodle);
      }
    } else {
      currentEditNoteId = null;
      selectColor(Notes.randomColor());
    }

    doodleModal.classList.add('active');
  }
  
  /**
   * Close doodle modal
   */
  function closeDoodleModal() {
    doodleModal.classList.remove('active');
    currentEditNoteId = null;
    discardDraftNote();
  }

  /**
   * Save doodle note
   */
  async function saveDoodleNote() {
    if (DoodleEditor.isEmpty()) {
      showToast('Please draw something first', { variant: 'info' });
      return;
    }

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
    try {
      const doodleData = DoodleEditor.getData();
      if (currentEditNoteId) {
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, { doodle: doodleData, color: selectedColor });
        const note = Notes.getNote(currentEditNoteId);
        const oldEl = Board.getNoteElement(currentEditNoteId);
        if (oldEl && note) {
          const newEl = Notes.renderNote(note);
          oldEl.replaceWith(newEl);
          Board.setupNoteInteractions(newEl);
        }
      } else {
        markLocalChange();
        const position = getNewNotePosition();
        const note = await Notes.createNote('doodle', { doodle: doodleData }, selectedColor, position);
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      }

      if (isDraft) {
        pendingDraftNoteId = null;
      }

      closeDoodleModal();
    } catch (err) {
      console.error('Failed to save doodle note:', err);
      showToast('Failed to save doodle note');
    }
  }
  
  /**
   * Close all modals
   */
  function closeAllModals() {
    closeTextModal();
    closeImageModal();
    closeDoodleModal();
    closeDeleteModal();
  }
  
  /**
   * Select color in current modal
   */
  function updateDoodleToolUI() {
    const currentSize = DoodleEditor.getBrushSize();
    const erasing = DoodleEditor.isEraserEnabled();

    doodleBrushButtons.forEach(btn => {
      const size = Number.parseInt(btn.dataset.brush, 10);
      const isActive = size === currentSize;
      btn.classList.toggle('active', isActive);
    });

    doodleEraserBtn.classList.toggle('active', erasing);
  }

  function getPassphraseValue() {
    const entered = passphraseInput.value.trim();
    return entered || DEFAULT_ROOM;
  }

  function applyRememberedRoom() {
    try {
      const remember = localStorage.getItem(REMEMBER_ROOM_KEY) === 'true';
      if (rememberRoomCheckbox) {
        rememberRoomCheckbox.checked = remember;
      }

      if (remember) {
        const lastRoom = localStorage.getItem(LAST_ROOM_KEY);
        passphraseInput.value = lastRoom || '';
      } else {
        passphraseInput.value = '';
      }
    } catch (err) {
      console.warn('Unable to load remembered room:', err);
    }
  }

  function attemptAutoJoin() {
    const shouldRemember = rememberRoomCheckbox?.checked;
    const passphrase = passphraseInput.value.trim();
    if (!shouldRemember || !passphrase) return;
    openBoard();
  }

  function persistRememberedRoom(passphrase) {
    if (!rememberRoomCheckbox?.checked) {
      clearRememberedRoom();
      return;
    }

    try {
      localStorage.setItem(REMEMBER_ROOM_KEY, 'true');
      localStorage.setItem(LAST_ROOM_KEY, passphrase);
    } catch (err) {
      console.warn('Unable to save remembered room:', err);
    }
  }

  function clearRememberedRoom() {
    try {
      localStorage.removeItem(REMEMBER_ROOM_KEY);
      localStorage.removeItem(LAST_ROOM_KEY);
    } catch (err) {
      console.warn('Unable to clear remembered room:', err);
    }
  }

  function clearAutoJoinPreference() {
    try {
      localStorage.removeItem(REMEMBER_ROOM_KEY);
    } catch (err) {
      console.warn('Unable to clear auto-join preference:', err);
    }
  }

  function selectColor(color) {
    selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === color);
    });
  }

  function setRoomLabel(passphrase) {
    if (!roomLabel) return;
    const label = passphrase ? `${passphrase}` : '[UNKNOWN AREA]';
    roomLabel.textContent = label;
    roomLabel.setAttribute('title', label);
    roomLabel.classList.toggle('is-hidden', !label);
  }

  function startRoomBackground(seedString) {
    if (!backgroundCanvas || !window.RoomBackground?.startRoomBackground || !seedString) return;
    stopRoomBackground();
    try {
      roomBackgroundController = window.RoomBackground.startRoomBackground({
        canvas: backgroundCanvas,
        seedString
      });
      document.body.classList.add('room-bg-active');
    } catch (err) {
      console.warn('Failed to start room background:', err);
      document.body.classList.remove('room-bg-active');
      roomBackgroundController = null;
    }
  }

  function stopRoomBackground() {
    if (roomBackgroundController?.stop) {
      roomBackgroundController.stop();
    }
    roomBackgroundController = null;
    document.body.classList.remove('room-bg-active');
  }
  
  function showToast(message, options = {}) {
    if (!toastContainer) return;
    const { variant = 'error', duration = TOAST_DURATION_MS } = options;
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const removeToast = () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), TOAST_ANIMATION_MS);
    };

    setTimeout(removeToast, duration);
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
