const Crypto = (() => {
  const SALT_ID = new TextEncoder().encode('mynotes-board-id-salt-v1');
  const SALT_KEY = new TextEncoder().encode('mynotes-encryption-key-salt-v1');
  
  const ITERATIONS = 150000;
  
  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  async function deriveKey(passphrase, salt, usage) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    if (usage === 'raw') {
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
  
  async function deriveBoardId(passphrase) {
    const derived = await deriveKey(passphrase, SALT_ID, 'raw');
    const hash = await crypto.subtle.digest('SHA-256', derived);
    return bufferToHex(hash);
  }
  
  async function deriveEncryptionKey(passphrase) {
    return await deriveKey(passphrase, SALT_KEY, 'aes');
  }
  
  async function encrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
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
  
  async function encryptPayload(key, payload) {
    const plaintext = JSON.stringify(payload);
    const encrypted = await encrypt(key, plaintext);
    return JSON.stringify(encrypted);
  }
  
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
