const Board = (() => {
  const DRAG_Z_INDEX = Number.MAX_SAFE_INTEGER;
  const ROTATION_EDGE_SIZE = 12;
  const ROTATION_OUTSIDE_SIZE = 24;
  let viewport = null;
  let corkboard = null;
  let panOffset = { x: 0, y: 0 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panRafId = null;
  let pendingPanPoint = null;
  
  let draggedNote = null;
  let dragOffset = { x: 0, y: 0 };
  let isDragging = false;
  let dragRafId = null;
  let pendingDragPoint = null;
  
  let isRotating = false;
  let rotatingNote = null;
  let rotateStart = 0;
  let rotationAccumulated = 0;
  let initialRotation = 0;
  let rotationRafId = null;
  let pendingRotationPoint = null;
  
  let onNoteMove = null;
  let onNoteRotate = null;
  let onNoteClick = null;
  
  function init(callbacks = {}) {
    viewport = document.getElementById('board-viewport');
    corkboard = document.getElementById('corkboard');
    
    onNoteMove = callbacks.onNoteMove || (() => {});
    onNoteRotate = callbacks.onNoteRotate || (() => {});
    onNoteClick = callbacks.onNoteClick || (() => {});
    
    centerBoard();
    
    viewport.addEventListener('mousedown', handlePanStart);
    viewport.addEventListener('mousemove', handlePanMove);
    viewport.addEventListener('mouseup', handlePanEnd);
    viewport.addEventListener('mouseleave', handlePanEnd);
    
    viewport.addEventListener('touchstart', handleTouchPanStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchPanMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchPanEnd);
    
    window.addEventListener('resize', centerBoard);
  }
  
  function centerBoard() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    
    panOffset.x = (vw - Notes.BOARD_WIDTH) / 2;
    panOffset.y = (vh - Notes.BOARD_HEIGHT) / 2;
    
    updateBoardPosition();
  }
  
  function updateBoardPosition() {
    corkboard.style.transform = `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`;
  }
  
  function clampPanOffset() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const bw = Notes.BOARD_WIDTH;
    const bh = Notes.BOARD_HEIGHT;
    
    // Keep at least 100px of board visible
    const minVisible = 100;
    
    panOffset.x = Math.max(minVisible - bw, Math.min(vw - minVisible, panOffset.x));
    panOffset.y = Math.max(minVisible - bh, Math.min(vh - minVisible, panOffset.y));
  }

  function getViewportCenterPosition() {
    if (!viewport || !corkboard) {
      return Notes.clampPosition(
        Notes.BOARD_WIDTH / 2 - Notes.NOTE_SIZE / 2,
        Notes.BOARD_HEIGHT / 2 - Notes.NOTE_SIZE / 2
      );
    }

    const viewportRect = viewport.getBoundingClientRect();
    const boardRect = corkboard.getBoundingClientRect();
    const centerX = viewportRect.left + viewportRect.width / 2;
    const centerY = viewportRect.top + viewportRect.height / 2;
    const x = centerX - boardRect.left - Notes.NOTE_SIZE / 2;
    const y = centerY - boardRect.top - Notes.NOTE_SIZE / 2;

    return Notes.clampPosition(x, y);
  }
  
  function handlePanStart(e) {
    if (e.target !== corkboard && e.target !== viewport) return;

    const rotationTarget = findRotationNoteAtPoint(e.clientX, e.clientY);
    if (rotationTarget) {
      startRotation(e, rotationTarget);
      return;
    }
    
    isPanning = true;
    panStart.x = e.clientX - panOffset.x;
    panStart.y = e.clientY - panOffset.y;
    viewport.classList.add('dragging');
  }
  
  function handlePanMove(e) {
    if (!isPanning) return;
    pendingPanPoint = { x: e.clientX, y: e.clientY };
    if (panRafId) return;
    panRafId = requestAnimationFrame(applyPanMove);
  }
  
  function applyPanMove() {
    if (!pendingPanPoint) {
      panRafId = null;
      return;
    }
    
    panOffset.x = pendingPanPoint.x - panStart.x;
    panOffset.y = pendingPanPoint.y - panStart.y;
    
    clampPanOffset();
    updateBoardPosition();
    panRafId = null;
  }
  
  function handlePanEnd() {
    isPanning = false;
    pendingPanPoint = null;
    if (panRafId) {
      cancelAnimationFrame(panRafId);
      panRafId = null;
    }
    viewport.classList.remove('dragging');
  }
  
  function handleTouchPanStart(e) {
    if (e.touches.length !== 1) return;
    if (e.target !== corkboard && e.target !== viewport) return;

    const touch = e.touches[0];
    const rotationTarget = findRotationNoteAtPoint(touch.clientX, touch.clientY);
    if (rotationTarget) {
      e.preventDefault();
      startRotation(e, rotationTarget);
      return;
    }
    
    e.preventDefault();
    isPanning = true;
    panStart.x = touch.clientX - panOffset.x;
    panStart.y = touch.clientY - panOffset.y;
  }
  
  function handleTouchPanMove(e) {
    if (!isPanning || e.touches.length !== 1) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    pendingPanPoint = { x: touch.clientX, y: touch.clientY };
    if (panRafId) return;
    panRafId = requestAnimationFrame(applyPanMove);
  }
  
  function handleTouchPanEnd() {
    isPanning = false;
    pendingPanPoint = null;
    if (panRafId) {
      cancelAnimationFrame(panRafId);
      panRafId = null;
    }
  }
  
  function setupNoteDragging(noteEl) {
    noteEl.addEventListener('mousedown', handleNoteMouseDown);
    noteEl.addEventListener('touchstart', handleNoteTouchStart, { passive: false });
  }

  function setupNoteInteractions(noteEl) {
    setupNoteDragging(noteEl);

    noteEl.addEventListener('dblclick', (e) => {
      bringNoteToFront(noteEl);
      onNoteClick(noteEl.dataset.noteId, e.clientX, e.clientY, 'edit');
    });
  }

  function isRotationEdge(noteEl, clientX, clientY) {
    const rect = noteEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = -(getNoteRotation(noteEl) * Math.PI) / 180;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);

    const halfWidth = noteEl.offsetWidth / 2;
    const halfHeight = noteEl.offsetHeight / 2;

    if (
      Math.abs(localX) > halfWidth + ROTATION_OUTSIDE_SIZE ||
      Math.abs(localY) > halfHeight + ROTATION_OUTSIDE_SIZE
    ) {
      return false;
    }

    if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfHeight) {
      return true;
    }

    return (
      halfWidth - Math.abs(localX) <= ROTATION_EDGE_SIZE ||
      halfHeight - Math.abs(localY) <= ROTATION_EDGE_SIZE
    );
  }

  function findRotationNoteAtPoint(clientX, clientY) {
    const notes = Array.from(corkboard.querySelectorAll('.sticky-note'));
    let candidate = null;
    let topZIndex = -Infinity;

    notes.forEach((noteEl) => {
      if (!isRotationEdge(noteEl, clientX, clientY)) return;
      const zIndex = Number.parseFloat(noteEl.style.zIndex) || 0;
      if (zIndex >= topZIndex) {
        topZIndex = zIndex;
        candidate = noteEl;
      }
    });

    return candidate;
  }
  
  function handleNoteMouseDown(e) {
    if (e.button !== 0) return;
    const noteEl = e.currentTarget;

    if (isRotationEdge(noteEl, e.clientX, e.clientY)) {
      startRotation(e, noteEl);
      return;
    }
    
    startNoteDrag(e, noteEl, e.clientX, e.clientY);
    
    document.addEventListener('mousemove', handleNoteDrag);
    document.addEventListener('mouseup', handleNoteUp);
  }
  
  function handleNoteTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    
    const noteEl = e.currentTarget;
    const touch = e.touches[0];

    if (isRotationEdge(noteEl, touch.clientX, touch.clientY)) {
      startRotation(e, noteEl);
      return;
    }
    
    startNoteDrag(e, noteEl, touch.clientX, touch.clientY);
    
    document.addEventListener('touchmove', handleNoteTouchMove, { passive: false });
    document.addEventListener('touchend', handleNoteTouchEnd);
  }
  
  function startNoteDrag(e, noteEl, clientX, clientY) {
    isDragging = true;
    draggedNote = noteEl;

    liftNoteForDrag(noteEl);
    
    const rect = noteEl.getBoundingClientRect();
    const boardRect = corkboard.getBoundingClientRect();
    
    const noteX = parseFloat(noteEl.style.left);
    const noteY = parseFloat(noteEl.style.top);
    
    dragOffset.x = clientX - boardRect.left - noteX;
    dragOffset.y = clientY - boardRect.top - noteY;
    
    noteEl.classList.add('dragging');
  }
  
  function handleNoteDrag(e) {
    if (!isDragging || !draggedNote) return;
    pendingDragPoint = { x: e.clientX, y: e.clientY };
    if (dragRafId) return;
    dragRafId = requestAnimationFrame(applyDragMove);
  }
  
  function handleNoteTouchMove(e) {
    if (!isDragging || !draggedNote || e.touches.length !== 1) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    pendingDragPoint = { x: touch.clientX, y: touch.clientY };
    if (dragRafId) return;
    dragRafId = requestAnimationFrame(applyDragMove);
  }
  
  function applyDragMove() {
    if (!pendingDragPoint || !draggedNote) {
      dragRafId = null;
      return;
    }
    moveNoteTo(pendingDragPoint.x, pendingDragPoint.y);
    dragRafId = null;
  }
  
  function moveNoteTo(clientX, clientY) {
    const boardRect = corkboard.getBoundingClientRect();
    
    let x = clientX - boardRect.left - dragOffset.x;
    let y = clientY - boardRect.top - dragOffset.y;
    
    const clamped = Notes.clampPosition(x, y);
    
    const rot = getNoteRotation(draggedNote);
    
    Notes.updateNotePosition(draggedNote, clamped.x, clamped.y, rot);
  }
  
  function handleNoteUp(e) {
    finishNoteDrag();
    document.removeEventListener('mousemove', handleNoteDrag);
    document.removeEventListener('mouseup', handleNoteUp);
  }
  
  function handleNoteTouchEnd() {
    finishNoteDrag();
    document.removeEventListener('touchmove', handleNoteTouchMove);
    document.removeEventListener('touchend', handleNoteTouchEnd);
  }
  
  function finishNoteDrag() {
    if (!isDragging || !draggedNote) return;
    
    if (pendingDragPoint) {
      moveNoteTo(pendingDragPoint.x, pendingDragPoint.y);
      pendingDragPoint = null;
    }
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }
    
    const noteId = draggedNote.dataset.noteId;
    const x = parseFloat(draggedNote.style.left);
    const y = parseFloat(draggedNote.style.top);
    
    const releasedNote = draggedNote;

    releasedNote.classList.remove('dragging');
    releasedNote.classList.add('dropping');
    bringNoteToFront(releasedNote);
    
    setTimeout(() => {
      releasedNote.classList.remove('dropping');
    }, 300);
    
    onNoteMove(noteId, x, y);
    
    isDragging = false;
    draggedNote = null;
  }
  
  function startRotation(e, noteEl) {
    e.preventDefault();
    e.stopPropagation();
    
    isRotating = true;
    rotatingNote = noteEl;
    noteEl.classList.add('rotating');

    liftNoteForDrag(noteEl);
    
    const rect = noteEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    
    rotateStart = Math.atan2(clientY - centerY, clientX - centerX);
    rotationAccumulated = 0;
    
    const note = Notes.getNote(noteEl.dataset.noteId);
    initialRotation = note ? note.payload.rot : 0;
    
    document.addEventListener('mousemove', handleRotationMove);
    document.addEventListener('mouseup', handleRotationEnd);
    document.addEventListener('touchmove', handleRotationTouchMove, { passive: false });
    document.addEventListener('touchend', handleRotationEnd);
  }
  
  function handleRotationMove(e) {
    if (!isRotating || !rotatingNote) return;
    pendingRotationPoint = { x: e.clientX, y: e.clientY };
    if (rotationRafId) return;
    rotationRafId = requestAnimationFrame(applyRotationMove);
  }
  
  function handleRotationTouchMove(e) {
    if (!isRotating || !rotatingNote || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    pendingRotationPoint = { x: touch.clientX, y: touch.clientY };
    if (rotationRafId) return;
    rotationRafId = requestAnimationFrame(applyRotationMove);
  }
  
  function applyRotationMove() {
    if (!pendingRotationPoint || !rotatingNote) {
      rotationRafId = null;
      return;
    }
    rotateNoteTo(pendingRotationPoint.x, pendingRotationPoint.y);
    rotationRafId = null;
  }
  
  function rotateNoteTo(clientX, clientY) {
    const rect = rotatingNote.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    let deltaAngle = angle - rotateStart;

    if (deltaAngle > Math.PI) {
      deltaAngle -= Math.PI * 2;
    } else if (deltaAngle < -Math.PI) {
      deltaAngle += Math.PI * 2;
    }

    rotationAccumulated += deltaAngle;
    rotateStart = angle;

    const newRotation = initialRotation + rotationAccumulated * (180 / Math.PI);
    
    const x = parseFloat(rotatingNote.style.left);
    const y = parseFloat(rotatingNote.style.top);
    
    Notes.updateNotePosition(rotatingNote, x, y, newRotation);
    Notes.setNoteRotation(rotatingNote.dataset.noteId, newRotation);
  }

  function getNoteRotation(noteEl) {
    if (noteEl?.dataset?.rot !== undefined) {
      const parsed = parseFloat(noteEl.dataset.rot);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const transform = noteEl?.style?.transform || '';
    const match = transform.match(/rotate\(([-\d.]+)deg\)/);
    return match ? parseFloat(match[1]) : 0;
  }

  function bringNoteToFront(noteEl) {
    if (!noteEl) return;
    const noteId = noteEl.dataset.noteId;
    const stackIndex = Notes.touchNote(noteId);
    if (stackIndex) {
      noteEl.style.zIndex = stackIndex;
    }
  }

  function liftNoteForDrag(noteEl) {
    if (!noteEl) return;
    noteEl.style.zIndex = DRAG_Z_INDEX;
  }
  
  function handleRotationEnd() {
    if (!isRotating || !rotatingNote) return;
    
    if (pendingRotationPoint) {
      rotateNoteTo(pendingRotationPoint.x, pendingRotationPoint.y);
      pendingRotationPoint = null;
    }
    if (rotationRafId) {
      cancelAnimationFrame(rotationRafId);
      rotationRafId = null;
    }
    
    const noteId = rotatingNote.dataset.noteId;
    const rotation = getNoteRotation(rotatingNote);

    bringNoteToFront(rotatingNote);
    rotatingNote.classList.remove('rotating');
    
    onNoteRotate(noteId, rotation);
    
    isRotating = false;
    rotatingNote = null;
    
    document.removeEventListener('mousemove', handleRotationMove);
    document.removeEventListener('mouseup', handleRotationEnd);
    document.removeEventListener('touchmove', handleRotationTouchMove);
    document.removeEventListener('touchend', handleRotationEnd);
  }
  
  function addNote(noteEl) {
    corkboard.appendChild(noteEl);
    setupNoteInteractions(noteEl);
  }
  
  function removeNote(noteId) {
    const el = corkboard.querySelector(`[data-note-id="${noteId}"]`);
    if (el) {
      el.remove();
    }
  }
  
  function clearNotes(options = {}) {
    const { skipNoteId = null } = options;
    const notes = corkboard.querySelectorAll('.sticky-note');
    notes.forEach(el => {
      if (skipNoteId && el.dataset.noteId === skipNoteId) return;
      el.remove();
    });
  }

  function getDraggingNoteId() {
    if (!isDragging || !draggedNote) return null;
    return draggedNote.dataset.noteId;
  }

  function getRotatingNoteId() {
    if (!isRotating || !rotatingNote) return null;
    return rotatingNote.dataset.noteId;
  }
  
  function getNoteElement(noteId) {
    return corkboard.querySelector(`[data-note-id="${noteId}"]`);
  }
  
  return {
    init,
    centerBoard,
    addNote,
    removeNote,
    clearNotes,
    getNoteElement,
    getDraggingNoteId,
    getRotatingNoteId,
    setupNoteDragging,
    setupNoteInteractions,
    getViewportCenterPosition
  };
})();
