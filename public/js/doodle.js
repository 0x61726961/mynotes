/**
 * Doodle editor module
 * 64x64 pixel grid with touch/click drawing
 */

const DoodleEditor = (() => {
  const GRID_SIZE = 64;
  const DISPLAY_SIZE = 256; // Display canvas size
  const PIXEL_SIZE = DISPLAY_SIZE / GRID_SIZE; // 4px per grid cell
  
  let canvas = null;
  let ctx = null;
  let grid = null;
  let isDrawing = false;
  let lastCell = null;
  let brushSize = 1;
  let isErasing = false;
  
  /**
   * Initialize doodle editor on a canvas element
   * @param {HTMLCanvasElement} canvasElement
   */
  function init(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    
    // Ensure canvas is correct size
    canvas.width = DISPLAY_SIZE;
    canvas.height = DISPLAY_SIZE;
    
    // Initialize empty grid
    clear();
    resetTools();
    
    // Event listeners
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', handleLeave);
    window.addEventListener('mouseup', handleEnd);
    
    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd);
  }
  
  /**
   * Clear the grid
   */
  function clear() {
    grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    render();
  }

  function resetTools() {
    brushSize = 1;
    isErasing = false;
  }
  
  /**
   * Get grid coordinates from canvas pixel coordinates
   * @param {number} x - Canvas X
   * @param {number} y - Canvas Y
   * @returns {{gx: number, gy: number}}
   */
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
  
  /**
   * Toggle a pixel and render
   * @param {number} gx - Grid X
   * @param {number} gy - Grid Y
   */
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
  
  /**
   * Set a pixel (draw mode)
   * @param {number} gx
   * @param {number} gy
   * @param {number} value - 0 or 1
   */
  function setPixel(gx, gy, value) {
    const idx = gy * GRID_SIZE + gx;
    if (grid[idx] !== value) {
      grid[idx] = value;
      renderPixel(gx, gy);
    }
  }
  
  /**
   * Render entire grid
   */
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
    
    // Draw grid lines (subtle)
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
  
  /**
   * Render a single pixel (for performance during drawing)
   * @param {number} gx
   * @param {number} gy
   */
  function renderPixel(gx, gy) {
    const value = grid[gy * GRID_SIZE + gx];
    ctx.fillStyle = value ? ImageProcessor.GRAPHITE_CSS : '#ffffff';
    ctx.fillRect(gx * PIXEL_SIZE, gy * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
  }
  
  // Event handlers
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
      // Draw line from last cell to current cell
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
  
  /**
   * Get doodle data as packed format
   * @returns {{w: number, h: number, data: string}}
   */
  function getData() {
    const packed = ImageProcessor.packBits(grid);
    return {
      w: GRID_SIZE,
      h: GRID_SIZE,
      data: Crypto.bufferToBase64(packed.buffer)
    };
  }
  
  /**
   * Load doodle data from packed format
   * @param {{w: number, h: number, data: string}} data
   */
  function setData(data) {
    if (data.w !== GRID_SIZE || data.h !== GRID_SIZE) {
      console.warn('Doodle size mismatch');
      return;
    }
    
    const packed = new Uint8Array(Crypto.base64ToBuffer(data.data));
    grid = ImageProcessor.unpackBits(packed, GRID_SIZE * GRID_SIZE);
    render();
  }
  
  /**
   * Check if doodle is empty
   * @returns {boolean}
   */
  function isEmpty() {
    return !grid.some(bit => bit === 1);
  }
  
  /**
   * Create a preview canvas from doodle data
   * @param {{w: number, h: number, data: string}} doodleData
   * @returns {HTMLCanvasElement}
   */
  function createPreviewCanvas(doodleData) {
    const canvas = document.createElement('canvas');
    canvas.width = doodleData.w;
    canvas.height = doodleData.h;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(doodleData.w, doodleData.h);
    
    const packed = new Uint8Array(Crypto.base64ToBuffer(doodleData.data));
    const bits = ImageProcessor.unpackBits(packed, doodleData.w * doodleData.h);
    
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
