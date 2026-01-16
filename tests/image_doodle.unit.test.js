/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

global.crypto = webcrypto;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const cryptoScript = fs.readFileSync(
  path.join(__dirname, '../public/js/crypto.js'),
  'utf8'
);
const imageScript = fs.readFileSync(
  path.join(__dirname, '../public/js/image.js'),
  'utf8'
);
const doodleScript = fs.readFileSync(
  path.join(__dirname, '../public/js/doodle.js'),
  'utf8'
);

const CryptoModule = new Function(`${cryptoScript}; return Crypto;`)();
const ImageProcessor = new Function('Crypto', `${imageScript}; return ImageProcessor;`)(CryptoModule);
const DoodleEditor = new Function(
  'Crypto',
  'ImageProcessor',
  `${doodleScript}; return DoodleEditor;`
)(CryptoModule, ImageProcessor);

global.Crypto = CryptoModule;
global.ImageProcessor = ImageProcessor;
global.DoodleEditor = DoodleEditor;

describe('Image processing helpers', () => {
  test('packBits/unpackBits round trip', () => {
    const bits = new Uint8Array([1, 0, 1, 1, 0, 0, 1, 0, 1, 0]);
    const packed = ImageProcessor.packBits(bits);
    const unpacked = ImageProcessor.unpackBits(packed, bits.length);

    expect(Array.from(unpacked)).toEqual(Array.from(bits));
  });
});

describe('Doodle editor data handling', () => {
  function createMockCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn()
    };
    canvas.getContext = jest.fn(() => ctx);
    canvas.addEventListener = jest.fn();
    return canvas;
  }

  test('getData/setData round trip', () => {
    const canvas = createMockCanvas();
    DoodleEditor.init(canvas);

    const size = DoodleEditor.GRID_SIZE * DoodleEditor.GRID_SIZE;
    const bits = new Uint8Array(size);
    bits[0] = 1;
    bits[63] = 1;

    const packed = ImageProcessor.packBits(bits);
    const base64 = CryptoModule.bufferToBase64(packed.buffer);

    DoodleEditor.setData({ w: DoodleEditor.GRID_SIZE, h: DoodleEditor.GRID_SIZE, data: base64 });
    const roundTrip = DoodleEditor.getData();

    expect(roundTrip.data).toBe(base64);
  });

  test('isEmpty reflects grid state', () => {
    const canvas = createMockCanvas();
    DoodleEditor.init(canvas);
    DoodleEditor.clear();

    expect(DoodleEditor.isEmpty()).toBe(true);

    const bits = new Uint8Array(DoodleEditor.GRID_SIZE * DoodleEditor.GRID_SIZE);
    bits[10] = 1;
    const packed = ImageProcessor.packBits(bits);
    const base64 = CryptoModule.bufferToBase64(packed.buffer);
    DoodleEditor.setData({ w: DoodleEditor.GRID_SIZE, h: DoodleEditor.GRID_SIZE, data: base64 });

    expect(DoodleEditor.isEmpty()).toBe(false);
  });
});
