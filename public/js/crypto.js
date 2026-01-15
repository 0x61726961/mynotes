/**
 * Crypto module - Web Crypto API helpers for E2E encryption
 * Uses PBKDF2 + AES-GCM 256-bit
 */

const Crypto = (() => {
  // Global salts - not secret, used to separate ID derivation from key derivation
  const SALT_ID = new TextEncoder().encode('mynotes-board-id-salt-v1');
  const SALT_KEY = new TextEncoder().encode('mynotes-encryption-key-salt-v1');
  
  // PBKDF2 iterations (150k as specified)
  const ITERATIONS = 150000;
  
  /**
   * Convert ArrayBuffer to hex string
   */
  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * Convert ArrayBuffer to Base64 string
   */
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  /**
   * Convert Base64 string to ArrayBuffer
   */
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  /**
   * Derive a key from passphrase using PBKDF2
   * @param {string} passphrase - User passphrase
   * @param {Uint8Array} salt - Salt for derivation
   * @param {string} usage - 'raw' for hashing or 'aes' for encryption key
   * @returns {Promise<CryptoKey|ArrayBuffer>}
   */
  async function deriveKey(passphrase, salt, usage) {
    // Import passphrase as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    if (usage === 'raw') {
      // Derive raw bits for hashing
      return await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );
    } else {
      // Derive AES-GCM key
      return await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }
  }
  
  /**
   * Derive board ID from passphrase
   * board_id = SHA-256(PBKDF2(passphrase, SALT_ID))
   * @param {string} passphrase
   * @returns {Promise<string>} Hex string (64 chars)
   */
  async function deriveBoardId(passphrase) {
    const derived = await deriveKey(passphrase, SALT_ID, 'raw');
    const hash = await crypto.subtle.digest('SHA-256', derived);
    return bufferToHex(hash);
  }
  
  /**
   * Derive encryption key from passphrase
   * @param {string} passphrase
   * @returns {Promise<CryptoKey>}
   */
  async function deriveEncryptionKey(passphrase) {
    return await deriveKey(passphrase, SALT_KEY, 'aes');
  }
  
  /**
   * Encrypt plaintext using AES-GCM
   * @param {CryptoKey} key - Encryption key
   * @param {string} plaintext - Data to encrypt (JSON string)
   * @returns {Promise<{iv: string, ct: string}>} Base64 encoded IV and ciphertext
   */
  async function encrypt(key, plaintext) {
    // Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    
    return {
      iv: bufferToBase64(iv),
      ct: bufferToBase64(ciphertext)
    };
  }
  
  /**
   * Decrypt ciphertext using AES-GCM
   * @param {CryptoKey} key - Encryption key
   * @param {string} ivBase64 - Base64 encoded IV
   * @param {string} ctBase64 - Base64 encoded ciphertext
   * @returns {Promise<string>} Decrypted plaintext
   */
  async function decrypt(key, ivBase64, ctBase64) {
    const iv = new Uint8Array(base64ToBuffer(ivBase64));
    const ciphertext = base64ToBuffer(ctBase64);
    
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  }
  
  /**
   * Encrypt a note payload object
   * @param {CryptoKey} key
   * @param {object} payload - Note data object
   * @returns {Promise<string>} JSON string with {iv, ct}
   */
  async function encryptPayload(key, payload) {
    const plaintext = JSON.stringify(payload);
    const encrypted = await encrypt(key, plaintext);
    return JSON.stringify(encrypted);
  }
  
  /**
   * Decrypt a note payload
   * @param {CryptoKey} key
   * @param {string} encryptedPayload - JSON string with {iv, ct}
   * @returns {Promise<object>} Decrypted note data object
   */
  async function decryptPayload(key, encryptedPayload) {
    const { iv, ct } = JSON.parse(encryptedPayload);
    const plaintext = await decrypt(key, iv, ct);
    return JSON.parse(plaintext);
  }
  
  return {
    deriveBoardId,
    deriveEncryptionKey,
    encrypt,
    decrypt,
    encryptPayload,
    decryptPayload,
    bufferToBase64,
    base64ToBuffer
  };
})();
