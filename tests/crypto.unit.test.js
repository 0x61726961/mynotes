const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

const cryptoScript = fs.readFileSync(
  path.join(__dirname, '../public/js/crypto.js'),
  'utf8'
);

global.crypto = webcrypto;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
global.btoa = (value) => Buffer.from(value, 'binary').toString('base64');

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', { value: webcrypto });
}

const CryptoModule = new Function(`${cryptoScript}; return Crypto;`)();

describe('Crypto module', () => {
  test('deriveBoardId is stable and hex formatted', async () => {
    const idOne = await CryptoModule.deriveBoardId('passphrase');
    const idTwo = await CryptoModule.deriveBoardId('passphrase');

    expect(idOne).toBe(idTwo);
    expect(idOne).toMatch(/^[a-f0-9]{64}$/i);
  });

  test('encrypt/decrypt round trip', async () => {
    const key = await CryptoModule.deriveEncryptionKey('secret');
    const encrypted = await CryptoModule.encrypt(key, 'hello');
    const decrypted = await CryptoModule.decrypt(key, encrypted.iv, encrypted.ct);

    expect(decrypted).toBe('hello');
  });

  test('encryptPayload/decryptPayload round trip', async () => {
    const key = await CryptoModule.deriveEncryptionKey('secret');
    const payload = { text: 'note', color: 'yellow' };
    const encrypted = await CryptoModule.encryptPayload(key, payload);
    const decrypted = await CryptoModule.decryptPayload(key, encrypted);

    expect(decrypted).toEqual(payload);
  });

  test('tampered ciphertext fails to decrypt', async () => {
    const key = await CryptoModule.deriveEncryptionKey('secret');
    const encrypted = await CryptoModule.encrypt(key, 'hello');
    const tampered = encrypted.ct.slice(0, -1) + 'A';

    await expect(CryptoModule.decrypt(key, encrypted.iv, tampered)).rejects.toThrow();
  });

  test('base64 conversions round trip', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const base64 = CryptoModule.bufferToBase64(bytes.buffer);
    const roundTrip = new Uint8Array(CryptoModule.base64ToBuffer(base64));

    expect(Array.from(roundTrip)).toEqual(Array.from(bytes));
  });
});
