/**
 * Image processing module
 * Handles resizing, 1-bit dithering, and bit-packing for E2E-safe image storage
 */

const ImageProcessor = (() => {
  const MAX_SIZE = 256;
  
  /**
   * Load an image from file or URL
   * @param {File|string} source - File object or URL
   * @returns {Promise<HTMLImageElement>}
   */
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
  
  /**
   * Resize image to fit within MAX_SIZE maintaining aspect ratio
   * @param {HTMLImageElement} img
   * @returns {{canvas: HTMLCanvasElement, width: number, height: number}}
   */
  function resizeImage(img) {
    let width = img.width;
    let height = img.height;
    
    // Scale down if needed
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
  
  /**
   * Convert image to grayscale
   * @param {ImageData} imageData
   * @returns {Uint8Array} Grayscale values 0-255
   */
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    
    for (let i = 0; i < gray.length; i++) {
      const idx = i * 4;
      // Luminosity method
      gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
    
    return gray;
  }
  
  /**
   * Apply Floyd-Steinberg dithering to grayscale image
   * @param {Uint8Array} gray - Grayscale values
   * @param {number} width
   * @param {number} height
   * @returns {Uint8Array} 1-bit values (0 or 1)
   */
  function floydSteinbergDither(gray, width, height) {
    // Work with float array for error diffusion
    const errors = new Float32Array(gray);
    const output = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = errors[idx];
        const newPixel = oldPixel < 128 ? 0 : 255;
        output[idx] = newPixel === 255 ? 1 : 0;
        
        const error = oldPixel - newPixel;
        
        // Distribute error to neighbors
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
  
  /**
   * Apply ordered (Bayer) dithering - alternative, faster method
   * @param {Uint8Array} gray
   * @param {number} width
   * @param {number} height
   * @returns {Uint8Array} 1-bit values
   */
  function bayerDither(gray, width, height) {
    // 4x4 Bayer matrix
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
  
  /**
   * Pack 1-bit array into bytes
   * @param {Uint8Array} bits - Array of 0s and 1s
   * @returns {Uint8Array} Packed bytes
   */
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
  
  /**
   * Unpack bytes into 1-bit array
   * @param {Uint8Array} packed - Packed bytes
   * @param {number} bitCount - Total number of bits
   * @returns {Uint8Array} Array of 0s and 1s
   */
  function unpackBits(packed, bitCount) {
    const bits = new Uint8Array(bitCount);
    
    for (let i = 0; i < bitCount; i++) {
      bits[i] = (packed[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
    }
    
    return bits;
  }
  
  /**
   * Process an image file: resize, dither, and pack
   * @param {File} file - Image file
   * @returns {Promise<{w: number, h: number, data: string}>} Width, height, base64 packed data
   */
  async function processImage(file) {
    const img = await loadImage(file);
    const { canvas, width, height } = resizeImage(img);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    
    const gray = toGrayscale(imageData);
    const dithered = floydSteinbergDither(gray, width, height);
    const packed = packBits(dithered);
    
    return {
      w: width,
      h: height,
      data: Crypto.bufferToBase64(packed.buffer)
    };
  }
  
  /**
   * Render packed 1-bit image data to canvas
   * @param {HTMLCanvasElement} canvas
   * @param {{w: number, h: number, data: string}} imgData
   */
  function renderToCanvas(canvas, imgData) {
    const { w, h, data } = imgData;
    canvas.width = w;
    canvas.height = h;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    
    const packed = new Uint8Array(Crypto.base64ToBuffer(data));
    const bits = unpackBits(packed, w * h);
    
    for (let i = 0; i < bits.length; i++) {
      const idx = i * 4;
      const value = bits[i] ? 255 : 0;
      imageData.data[idx] = value;     // R
      imageData.data[idx + 1] = value; // G
      imageData.data[idx + 2] = value; // B
      imageData.data[idx + 3] = 255;   // A
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Create preview canvas from image data
   * @param {{w: number, h: number, data: string}} imgData
   * @returns {HTMLCanvasElement}
   */
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
    unpackBits
  };
})();
