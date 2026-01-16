const App = (() => {
  let loginScreen, boardScreen;
  let passphraseInput, passphraseForm, openBoardBtn, rememberRoomCheckbox;
  let textModal, imageModal, doodleModal, deleteModal;
  let loadingOverlay, loadingText, toastContainer;
  let doodleBrushButtons, doodleEraserBtn;
  let addFabContainer, addFabButton, addFabMenu;
  let confirmDeleteBtn, cancelDeleteBtn;
  let roomLabel;
  let backgroundCanvas;
  
  let currentBoardId = null;
  let encryptionKey = null;
  let selectedColor = 'yellow';
  let currentEditNoteId = null;
  let imageData = null;
  let pendingDraftNoteId = null;
  let pendingDeleteNoteId = null;
  let roomBackgroundController = null;
  
  let pendingSaveTimers = new Map();
  let pendingNoteUpdates = new Map();
  let pendingSaveCount = 0;
  
  let refreshInterval = null;
  let isRefreshing = false;
  let lastLocalChangeAt = 0;
  const STRINGS = window.AppStrings || {};
  const REFRESH_INTERVAL_MS = 5000;
  const DEFAULT_ROOM = resolveString(STRINGS.login?.passphrasePlaceholder, 'public');
  const REMEMBER_ROOM_KEY = 'mynotes.rememberRoom';
  const LAST_ROOM_KEY = 'mynotes.lastRoom';
  const TOAST_DURATION_MS = 2800;
  const TOAST_ANIMATION_MS = 200;
  
  function resolveString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function getNoteErrorMessage(err, fallback) {
    if (err?.status === 409 || err?.serverError === 'Note limit exceeded') {
      return resolveString(STRINGS.toasts?.noteLimitExceeded, 'Note limit exceeded.');
    }
    if (err?.status === 507 || err?.serverError === 'Database limit reached') {
      return resolveString(STRINGS.toasts?.databaseLimitReached, 'Storage limit reached.');
    }
    if (err?.status === 400 && err?.serverError === 'Invalid payload') {
      return resolveString(STRINGS.toasts?.payloadTooLarge, 'Note is too large.');
    }
    return fallback;
  }

  function setTextById(id, text) {
    const el = document.getElementById(id);
    if (el && typeof text === 'string') {
      el.textContent = text;
    }
  }

  function setHtmlById(id, html) {
    const el = document.getElementById(id);
    if (el && typeof html === 'string') {
      el.innerHTML = html;
    }
  }

  function setAttrById(id, attr, value) {
    const el = document.getElementById(id);
    if (el && typeof value === 'string') {
      el.setAttribute(attr, value);
    }
  }

  function setAttr(el, attr, value) {
    if (el && typeof value === 'string') {
      el.setAttribute(attr, value);
    }
  }

  function applyStrings() {
    const { meta, login, board, modals, loading } = STRINGS;

    if (meta?.title) {
      document.title = meta.title;
    }

    setTextById('app-title', login?.title);
    setAttrById('passphrase', 'placeholder', login?.passphrasePlaceholder);
    setAttrById(
      'passphrase',
      'aria-label',
      resolveString(login?.passphrasePlaceholder, 'Room passphrase')
    );
    setTextById('remember-room-label', login?.rememberRoom);
    setTextById('open-board-btn', login?.openBoard);
    setHtmlById('passphrase-hint', login?.hintHtml);

    setTextById('logout-btn', board?.leaveBoardText);
    setAttrById('logout-btn', 'title', board?.leaveBoardTitle);
    setAttrById('logout-btn', 'aria-label', board?.leaveBoardLabel);

    setTextById('add-fab', board?.addButtonText);
    setAttrById('add-fab', 'title', board?.addButtonTitle);
    setAttrById('add-fab', 'aria-label', board?.addButtonLabel);

    setTextById('add-text-btn', board?.addTextText);
    setAttrById('add-text-btn', 'title', board?.addTextTitle);
    setAttrById('add-text-btn', 'aria-label', board?.addTextLabel);

    setTextById('add-image-btn', board?.addImageText);
    setAttrById('add-image-btn', 'title', board?.addImageTitle);
    setAttrById('add-image-btn', 'aria-label', board?.addImageLabel);

    setTextById('add-doodle-btn', board?.addDoodleText);
    setAttrById('add-doodle-btn', 'title', board?.addDoodleTitle);
    setAttrById('add-doodle-btn', 'aria-label', board?.addDoodleLabel);

    setTextById('text-modal-title', modals?.text?.title);
    setAttrById('note-text', 'placeholder', modals?.text?.placeholder);
    setTextById('delete-text-btn', modals?.text?.delete);
    setTextById('cancel-text-btn', modals?.text?.cancel);
    setTextById('save-text-btn', modals?.text?.save);

    setTextById('image-modal-title', modals?.image?.title);
    setHtmlById('image-drop-text', modals?.image?.dropZone);
    setTextById('delete-image-btn', modals?.image?.delete);
    setTextById('cancel-image-btn', modals?.image?.cancel);
    setTextById('save-image-btn', modals?.image?.save);

    setTextById('doodle-modal-title', modals?.doodle?.title);
    setTextById('delete-doodle-btn', modals?.doodle?.delete);
    setTextById('cancel-doodle-btn', modals?.doodle?.cancel);
    setTextById('save-doodle-btn', modals?.doodle?.save);
    setTextById('doodle-eraser', modals?.doodle?.eraser);
    setTextById('doodle-clear', modals?.doodle?.clear);

    const brushLabels = modals?.doodle?.brushLabels || {};
    setAttr(document.querySelector('.doodle-tool-btn[data-brush="1"]'), 'aria-label', brushLabels.pencil);
    setAttr(document.querySelector('.doodle-tool-btn[data-brush="2"]'), 'aria-label', brushLabels.pen);
    setAttr(document.querySelector('.doodle-tool-btn[data-brush="3"]'), 'aria-label', brushLabels.marker);

    setTextById('delete-modal-title', modals?.deleteConfirm?.title);
    setTextById('cancel-delete-btn', modals?.deleteConfirm?.cancel);
    setTextById('confirm-delete-btn', modals?.deleteConfirm?.confirm);

    setTextById('loading-text', loading?.derivingKey);
  }

  function init() {
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
    
    applyStrings();

    setupLoginEvents();
    applyRememberedRoom();
    attemptAutoJoin();
    setupFabEvents();
    setupToolbarEvents();
    setupModalEvents();
    
    DoodleEditor.init(document.getElementById('doodle-canvas'));
    
    Board.init({
      onNoteMove: handleNoteMove,
      onNoteRotate: handleNoteRotate,
      onNoteClick: handleNoteClick
    });
    
    console.log('mynotes initialized');
  }
  
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

    if (addFabButton.dataset.closedTitle === undefined) {
      addFabButton.dataset.closedTitle = addFabButton.getAttribute('title') || '';
    }

    addFabButton.removeAttribute('title');

    addFabContainer.classList.add('open');
    addFabButton.setAttribute('aria-expanded', 'true');
    addFabMenu.setAttribute('aria-hidden', 'false');
  }

  function closeAddFabMenu() {
    if (!addFabContainer || !addFabButton || !addFabMenu) return;

    addFabContainer.classList.remove('open');
    addFabButton.setAttribute('aria-expanded', 'false');
    addFabMenu.setAttribute('aria-hidden', 'true');

    const title = addFabButton.dataset.closedTitle;
    if (typeof title === 'string' && title.length > 0) {
      addFabButton.setAttribute('title', title);
    }
  }

  function toggleAddFabMenu() {
    if (!addFabContainer) return;
    if (addFabContainer.classList.contains('open')) {
      closeAddFabMenu();
    } else {
      openAddFabMenu();
    }
  }

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
  
  function setupModalEvents() {
    document.getElementById('cancel-text-btn').addEventListener('click', closeTextModal);
    document.getElementById('save-text-btn').addEventListener('click', saveTextNote);
    document.getElementById('delete-text-btn').addEventListener('click', deleteCurrentNoteFromModal);
    
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
    
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectColor(btn.dataset.color);
      });
    });
    
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
  
  async function openBoard() {
    const passphrase = getPassphraseValue();
    persistRememberedRoom(passphrase);
    
    showLoading(resolveString(STRINGS.loading?.derivingKey, 'Deriving encryption key...'));
    
    try {
      currentBoardId = await Crypto.deriveBoardId(passphrase);
      encryptionKey = await Crypto.deriveEncryptionKey(passphrase);
      
      Notes.init(currentBoardId, encryptionKey);
      
      showLoading(resolveString(STRINGS.loading?.loadingNotes, 'Loading notes...'));
      
      const notes = await Notes.loadNotes();
      
      loginScreen.classList.remove('active');
      boardScreen.classList.add('active');
      startRoomBackground(currentBoardId);
      setRoomLabel(passphrase);
      
      const orderedNotes = sortNotesForStacking(notes);
      Board.clearNotes();
      orderedNotes.forEach(note => {
        const noteEl = Notes.renderNote(note);
        Board.addNote(noteEl);
      });
      
      Board.centerBoard();
      
      hideLoading();
      
      passphraseInput.value = '';
      
      startNotesRefresh();
      
    } catch (err) {
      console.error('Failed to open board:', err);
      hideLoading();
      showToast(resolveString(STRINGS.toasts?.openBoardFail, 'Failed to open board. Please try again.'));
    }
  }
  
  async function refreshBoard() {
    if (isRefreshing || !currentBoardId || pendingSaveCount > 0 || pendingSaveTimers.size > 0) return;
    if (Board.getRotatingNoteId()) return;
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
  
  function startNotesRefresh() {
    stopNotesRefresh();
    refreshInterval = setInterval(refreshBoard, REFRESH_INTERVAL_MS);
  }
  
  function stopNotesRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function isAnyModalOpen() {
    return [textModal, imageModal, doodleModal, deleteModal].some(
      modal => modal?.classList.contains('active')
    );
  }

  function pauseNotesRefreshForModal() {
    stopNotesRefresh();
  }

  function resumeNotesRefreshIfReady() {
    if (!currentBoardId || !boardScreen?.classList.contains('active')) return;
    if (isAnyModalOpen()) return;
    startNotesRefresh();
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
      const note = await Notes.createNote(type, data, color, position, { draft: true });
      const noteEl = Notes.renderNote(note);
      Board.addNote(noteEl);
      pendingDraftNoteId = note.id;
      return note;
    } catch (err) {
      console.error('Failed to create draft note:', err);
      showToast(getNoteErrorMessage(err, resolveString(STRINGS.toasts?.createNoteFail, 'Failed to create note')));
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
    pauseNotesRefreshForModal();
  }

  function closeDeleteModal() {
    if (!deleteModal) return;
    deleteModal.classList.remove('active');
    pendingDeleteNoteId = null;
    resumeNotesRefreshIfReady();
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
      showToast(resolveString(STRINGS.toasts?.noteDeleted, 'Note deleted'), { variant: 'info' });
    } catch (err) {
      console.error('Failed to delete note:', err);
      showToast(resolveString(STRINGS.toasts?.deleteNoteFail, 'Failed to delete note'));
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

  function clearPendingSaves() {
    pendingSaveTimers.forEach((timerId) => clearTimeout(timerId));
    pendingSaveTimers.clear();
    pendingNoteUpdates.clear();
    pendingSaveCount = 0;
  }
  
  function logout() {
    const wasRemembering = rememberRoomCheckbox?.checked;
    const lastRoom = localStorage.getItem(LAST_ROOM_KEY) || '';

    currentBoardId = null;
    encryptionKey = null;
    pendingDraftNoteId = null;
    pendingDeleteNoteId = null;
    currentEditNoteId = null;
    clearPendingSaves();
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
  
  function handleNoteMove(noteId, x, y) {
    queueNoteSave(
      noteId,
      { x, y, rot: getRotationForNote(noteId) },
      (err) => {
        console.error('Failed to save note position:', err);
        showToast(
          getNoteErrorMessage(
            err,
            resolveString(STRINGS.toasts?.saveNotePositionFail, 'Failed to save note position')
          )
        );
      }
    );
  }
  
  function handleNoteRotate(noteId, rotation) {
    queueNoteSave(
      noteId,
      { rot: rotation },
      (err) => {
        console.error('Failed to save note rotation:', err);
        showToast(
          getNoteErrorMessage(
            err,
            resolveString(STRINGS.toasts?.saveNoteRotationFail, 'Failed to save note rotation')
          )
        );
      }
    );
  }
  
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
    pauseNotesRefreshForModal();
    textarea.focus();
  }
  
  function closeTextModal() {
    textModal.classList.remove('active');
    currentEditNoteId = null;
    discardDraftNote();
    resumeNotesRefreshIfReady();
  }
  
  async function saveTextNote() {
    const text = document.getElementById('note-text').value.trim();
    if (!text) {
      showToast(resolveString(STRINGS.toasts?.enterText, 'Please enter some text'), { variant: 'info' });
      return;
    }

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
    try {
      if (currentEditNoteId) {
        const updates = {
          text,
          color: selectedColor,
          ...(isDraft ? { draft: false } : {})
        };
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, updates);
        
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
      showToast(getNoteErrorMessage(err, resolveString(STRINGS.toasts?.saveNoteFail, 'Failed to save note')));
    }
  }
  
  function openImageModal(existingNote = null) {
    imageData = null;
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const imageDropZone = document.getElementById('image-drop-zone');
    const saveButton = document.getElementById('save-image-btn');
    const isDraft = Boolean(pendingDraftNoteId && existingNote?.id === pendingDraftNoteId);
    setModalDeleteButtonState('delete-image-btn', isDraft);

    imageInput.value = '';
    imagePreview.classList.remove('has-image');
    imageDropZone?.classList.remove('has-image');
    saveButton.disabled = true;

    if (existingNote) {
      currentEditNoteId = existingNote.id;
      selectColor(existingNote.payload.color);
      if (existingNote.payload.img) {
        imageData = existingNote.payload.img;
        ImageProcessor.renderToCanvas(imagePreview, imageData);
        imagePreview.classList.add('has-image');
        imageDropZone?.classList.add('has-image');
        saveButton.disabled = false;
      }
    } else {
      currentEditNoteId = null;
      selectColor(Notes.randomColor());
    }

    imageModal.classList.add('active');
    pauseNotesRefreshForModal();
  }
  
  function closeImageModal() {
    imageModal.classList.remove('active');
    imageData = null;
    currentEditNoteId = null;
    document.getElementById('image-drop-zone')?.classList.remove('has-image');
    discardDraftNote();
    resumeNotesRefreshIfReady();
  }
  
  async function processImageFile(file) {
    try {
      showLoading(resolveString(STRINGS.loading?.processingImage, 'Processing image...'));
      imageData = await ImageProcessor.processImage(file);
      
      const preview = document.getElementById('image-preview');
      const dropZone = document.getElementById('image-drop-zone');
      ImageProcessor.renderToCanvas(preview, imageData);
      preview.classList.add('has-image');
      dropZone?.classList.add('has-image');
      document.getElementById('save-image-btn').disabled = false;
      
      hideLoading();
    } catch (err) {
      console.error('Failed to process image:', err);
      hideLoading();
      showToast(resolveString(STRINGS.toasts?.processImageFail, 'Failed to process image'));
    }
  }
  
  async function saveImageNote() {
    if (!imageData) return;

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
    try {
      if (currentEditNoteId) {
        const updates = {
          img: imageData,
          color: selectedColor,
          ...(isDraft ? { draft: false } : {})
        };
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, updates);
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
      showToast(getNoteErrorMessage(err, resolveString(STRINGS.toasts?.saveImageFail, 'Failed to save image note')));
    }
  }
  
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
    pauseNotesRefreshForModal();
  }
  
  function closeDoodleModal() {
    doodleModal.classList.remove('active');
    currentEditNoteId = null;
    discardDraftNote();
    resumeNotesRefreshIfReady();
  }

  async function saveDoodleNote() {
    if (DoodleEditor.isEmpty()) {
      showToast(resolveString(STRINGS.toasts?.drawSomething, 'Please draw something first'), { variant: 'info' });
      return;
    }

    const isDraft = pendingDraftNoteId && currentEditNoteId === pendingDraftNoteId;
    
    try {
      const doodleData = DoodleEditor.getData();

      if (currentEditNoteId && !Notes.getNote(currentEditNoteId)) {
        console.warn('Missing doodle draft note in cache; recreating note.');
        if (pendingDraftNoteId === currentEditNoteId) {
          pendingDraftNoteId = null;
        }
        Board.removeNote(currentEditNoteId);
        currentEditNoteId = null;
      }

      if (currentEditNoteId) {
        const updates = {
          doodle: doodleData,
          color: selectedColor,
          ...(isDraft ? { draft: false } : {})
        };
        markLocalChange();
        await runNoteUpdate(currentEditNoteId, updates);
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
      showToast(getNoteErrorMessage(err, resolveString(STRINGS.toasts?.saveDoodleFail, 'Failed to save doodle note')));
    }
  }
  
  function closeAllModals() {
    closeTextModal();
    closeImageModal();
    closeDoodleModal();
    closeDeleteModal();
  }
  
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
    const label = passphrase ? `${passphrase}` : resolveString(STRINGS.board?.roomUnknown, '[UNKNOWN AREA]');
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

  function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.add('active');
  }
  
  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }
  
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
