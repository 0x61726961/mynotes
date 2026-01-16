const ImageProcessor = (() => {
  const MAX_SIZE = 256;
  const IMAGE_LEVELS = 4;
  const GRAPHITE_COLOR = { r: 34, g: 32, b: 28 };
  const GRAPHITE_CSS = `rgb(${GRAPHITE_COLOR.r}, ${GRAPHITE_COLOR.g}, ${GRAPHITE_COLOR.b})`;
  
  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      
      if (source instanceof File) {
        img.src = URL.createObjectURL(source);
      } else {
        img.src = source;
      }
    });
  }
  
  function resizeImage(img) {
    let width = img.width;
    let height = img.height;
    
    if (width > MAX_SIZE || height > MAX_SIZE) {
      const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    
    return { canvas, width, height };
  }
  
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    
    for (let i = 0; i < gray.length; i++) {
      const idx = i * 4;
      gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
    
    return gray;
  }
  
  function floydSteinbergDither(gray, width, height) {
    const errors = new Float32Array(gray);
    const output = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = errors[idx];
        const newPixel = oldPixel < 128 ? 0 : 255;
        output[idx] = newPixel === 255 ? 1 : 0;
        
        const error = oldPixel - newPixel;
        
        if (x + 1 < width) {
          errors[idx + 1] += error * 7 / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            errors[idx + width - 1] += error * 3 / 16;
          }
          errors[idx + width] += error * 5 / 16;
          if (x + 1 < width) {
            errors[idx + width + 1] += error * 1 / 16;
          }
        }
      }
    }
    
    return output;
  }
  
  function bayerDither(gray, width, height) {
    const bayer = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];
    
    const output = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const threshold = (bayer[y % 4][x % 4] + 0.5) * 16;
        output[idx] = gray[idx] > threshold ? 1 : 0;
      }
    }
    
    return output;
  }
  
  function packBits(bits) {
    const byteCount = Math.ceil(bits.length / 8);
    const packed = new Uint8Array(byteCount);
    
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) {
        packed[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
      }
    }
    
    return packed;
  }
  
  function unpackBits(packed, bitCount) {
    const bits = new Uint8Array(bitCount);
    
    for (let i = 0; i < bitCount; i++) {
      bits[i] = (packed[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
    }
    
    return bits;
  }
  
  function quantizeGrayscale(gray, width, height, levels) {
    const output = new Uint8Array(gray.length);
    const maxIndex = levels - 1;
    const bayer = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const threshold = (bayer[y % 4][x % 4] + 0.5) / 16 - 0.5;
        const normalized = gray[idx] / 255;
        const nudged = Math.min(1, Math.max(0, normalized + threshold / levels));
        const quantized = Math.round(nudged * maxIndex) / maxIndex;
        output[idx] = Math.round(quantized * 255);
      }
    }

    return output;
  }

  async function processImage(file) {
    const img = await loadImage(file);
    const { canvas, width, height } = resizeImage(img);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    
    const gray = toGrayscale(imageData);
    const quantized = quantizeGrayscale(gray, width, height, IMAGE_LEVELS);
    
    return {
      w: width,
      h: height,
      data: Crypto.bufferToBase64(quantized.buffer)
    };
  }
  
  function renderToCanvas(canvas, imgData) {
    const rawW = Number.isFinite(imgData?.w) ? imgData.w : MAX_SIZE;
    const rawH = Number.isFinite(imgData?.h) ? imgData.h : MAX_SIZE;
    const safeW = Math.max(1, Math.min(MAX_SIZE, Math.floor(rawW)));
    const safeH = Math.max(1, Math.min(MAX_SIZE, Math.floor(rawH)));
    const data = typeof imgData?.data === 'string' ? imgData.data : '';

    canvas.width = safeW;
    canvas.height = safeH;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(safeW, safeH);
    
    const gray = new Uint8Array(Crypto.base64ToBuffer(data));
    const { r, g, b } = GRAPHITE_COLOR;
    
    for (let i = 0; i < safeW * safeH; i++) {
      const idx = i * 4;
      const value = gray[i] ?? 255;
      const alpha = 255 - value;
      imageData.data[idx] = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
      imageData.data[idx + 3] = alpha;
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  function createPreviewCanvas(imgData) {
    const canvas = document.createElement('canvas');
    renderToCanvas(canvas, imgData);
    return canvas;
  }
  
  return {
    loadImage,
    processImage,
    renderToCanvas,
    createPreviewCanvas,
    packBits,
    unpackBits,
    GRAPHITE_COLOR,
    GRAPHITE_CSS
  };
})();
