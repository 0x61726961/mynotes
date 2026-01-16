const DoodleEditor = (() => {
  const GRID_SIZE = 64;
  const DISPLAY_SIZE = 256;
  const PIXEL_SIZE = DISPLAY_SIZE / GRID_SIZE;
  
  let canvas = null;
  let ctx = null;
  let grid = null;
  let isDrawing = false;
  let lastCell = null;
  let brushSize = 1;
  let isErasing = false;
  
  function init(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    
    canvas.width = DISPLAY_SIZE;
    canvas.height = DISPLAY_SIZE;
    
    clear();
    resetTools();
    
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', handleLeave);
    window.addEventListener('mouseup', handleEnd);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd);
  }
  
  function clear() {
    grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    render();
  }

  function resetTools() {
    brushSize = 1;
    isErasing = false;
  }
  
  function getGridCoords(x, y) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const canvasX = (x - rect.left) * scaleX;
    const canvasY = (y - rect.top) * scaleY;
    
    const gx = Math.floor(canvasX / PIXEL_SIZE);
    const gy = Math.floor(canvasY / PIXEL_SIZE);
    
    return {
      gx: Math.max(0, Math.min(GRID_SIZE - 1, gx)),
      gy: Math.max(0, Math.min(GRID_SIZE - 1, gy))
    };
  }
  
  function togglePixel(gx, gy) {
    const idx = gy * GRID_SIZE + gx;
    grid[idx] = grid[idx] ? 0 : 1;
    renderPixel(gx, gy);
  }

  function getBrushOffsets(size) {
    if (size === 2) {
      return [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
    }

    if (size >= 3) {
      const offsets = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          offsets.push([dx, dy]);
        }
      }
      return offsets;
    }

    return [[0, 0]];
  }

  function getDrawValue() {
    return isErasing ? 0 : 1;
  }

  function applyBrush(gx, gy, value) {
    const offsets = getBrushOffsets(brushSize);
    offsets.forEach(([dx, dy]) => {
      const x = gx + dx;
      const y = gy + dy;
      if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;
      setPixel(x, y, value);
    });
  }
  
  function setPixel(gx, gy, value) {
    const idx = gy * GRID_SIZE + gx;
    if (grid[idx] !== value) {
      grid[idx] = value;
      renderPixel(gx, gy);
    }
  }
  
  function render() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    
    ctx.fillStyle = ImageProcessor.GRAPHITE_CSS;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y * GRID_SIZE + x]) {
          ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
    }
    
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i * PIXEL_SIZE, 0);
      ctx.lineTo(i * PIXEL_SIZE, DISPLAY_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * PIXEL_SIZE);
      ctx.lineTo(DISPLAY_SIZE, i * PIXEL_SIZE);
      ctx.stroke();
    }
  }
  
  function renderPixel(gx, gy) {
    const value = grid[gy * GRID_SIZE + gx];
    ctx.fillStyle = value ? ImageProcessor.GRAPHITE_CSS : '#ffffff';
    ctx.fillRect(gx * PIXEL_SIZE, gy * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
  }
  
  function handleStart(e) {
    isDrawing = true;
    const { gx, gy } = getGridCoords(e.clientX, e.clientY);
    applyBrush(gx, gy, getDrawValue());
    lastCell = { gx, gy };
  }
  
  function handleMove(e) {
    if (!isDrawing) return;
    
    const { gx, gy } = getGridCoords(e.clientX, e.clientY);
    
    if (!lastCell) {
      applyBrush(gx, gy, getDrawValue());
      lastCell = { gx, gy };
      return;
    }
    
    if (gx !== lastCell.gx || gy !== lastCell.gy) {
      drawLine(lastCell.gx, lastCell.gy, gx, gy, getDrawValue());
      lastCell = { gx, gy };
    }
  }
  
  function handleLeave() {
    if (isDrawing) {
      lastCell = null;
    }
  }
  
  function handleEnd() {
    isDrawing = false;
    lastCell = null;
  }
  
  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    isDrawing = true;
    const { gx, gy } = getGridCoords(touch.clientX, touch.clientY);
    applyBrush(gx, gy, getDrawValue());
    lastCell = { gx, gy };
  }
  
  function handleTouchMove(e) {
    e.preventDefault();
    if (!isDrawing) return;
    
    const touch = e.touches[0];
    const { gx, gy } = getGridCoords(touch.clientX, touch.clientY);
    
    if (!lastCell) {
      applyBrush(gx, gy, getDrawValue());
      lastCell = { gx, gy };
      return;
    }
    
    if (gx !== lastCell.gx || gy !== lastCell.gy) {
      drawLine(lastCell.gx, lastCell.gy, gx, gy, getDrawValue());
      lastCell = { gx, gy };
    }
  }
  
  /**
   * Draw a line using Bresenham's algorithm
   */
  function drawLine(x0, y0, x1, y1, value) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      applyBrush(x0, y0, value);
      
      if (x0 === x1 && y0 === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  
  function getData() {
    const packed = ImageProcessor.packBits(grid);
    return {
      w: GRID_SIZE,
      h: GRID_SIZE,
      data: Crypto.bufferToBase64(packed.buffer)
    };
  }
  
  function setData(data) {
    if (data.w !== GRID_SIZE || data.h !== GRID_SIZE) {
      console.warn('Doodle size mismatch');
      return;
    }
    
    const packed = new Uint8Array(Crypto.base64ToBuffer(data.data));
    grid = ImageProcessor.unpackBits(packed, GRID_SIZE * GRID_SIZE);
    render();
  }
  
  function isEmpty() {
    return !grid.some(bit => bit === 1);
  }
  
  function createPreviewCanvas(doodleData) {
    const rawW = Number.isFinite(doodleData?.w) ? doodleData.w : GRID_SIZE;
    const rawH = Number.isFinite(doodleData?.h) ? doodleData.h : GRID_SIZE;
    const safeW = Math.max(1, Math.min(GRID_SIZE, Math.floor(rawW)));
    const safeH = Math.max(1, Math.min(GRID_SIZE, Math.floor(rawH)));
    const data = typeof doodleData?.data === 'string' ? doodleData.data : '';

    const canvas = document.createElement('canvas');
    canvas.width = safeW;
    canvas.height = safeH;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(safeW, safeH);
    
    const packed = new Uint8Array(Crypto.base64ToBuffer(data));
    const bits = ImageProcessor.unpackBits(packed, safeW * safeH);
    
    for (let i = 0; i < bits.length; i++) {
      const idx = i * 4;
      if (bits[i]) {
        imageData.data[idx] = ImageProcessor.GRAPHITE_COLOR.r;
        imageData.data[idx + 1] = ImageProcessor.GRAPHITE_COLOR.g;
        imageData.data[idx + 2] = ImageProcessor.GRAPHITE_COLOR.b;
        imageData.data[idx + 3] = 255;
      } else {
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 0;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  function setBrushSize(size) {
    brushSize = size;
    isErasing = false;
  }

  function setEraser(enabled) {
    isErasing = enabled;
  }

  function getBrushSize() {
    return brushSize;
  }

  function isEraserEnabled() {
    return isErasing;
  }

  return {
    init,
    clear,
    resetTools,
    setBrushSize,
    setEraser,
    getBrushSize,
    isEraserEnabled,
    getData,
    setData,
    isEmpty,
    createPreviewCanvas,
    GRID_SIZE
  };
})();
