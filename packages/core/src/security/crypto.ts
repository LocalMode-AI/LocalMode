/**
 * Encryption utilities using Web Crypto API.
 * Provides AES-GCM encryption for data at rest.
 */

/**
 * Encryption configuration.
 */
export interface EncryptionConfig {
  /** Enable encryption */
  enabled: boolean;
  /** Key derivation iterations (higher = more secure, slower) */
  iterations?: number;
}

/**
 * Encrypted data format.
 */
export interface EncryptedData {
  /** Base64-encoded encrypted data */
  ciphertext: string;
  /** Base64-encoded IV */
  iv: string;
  /** Key derivation salt */
  salt: string;
  /** Algorithm identifier */
  algorithm: 'AES-GCM';
  /** Version for future compatibility */
  version: 1;
}

/**
 * Default PBKDF2 iterations for key derivation.
 */
const DEFAULT_ITERATIONS = 100000;

/**
 * Check if Web Crypto API is available.
 */
export function isCryptoSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}

/**
 * Generate random bytes.
 */
function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive an encryption key from a passphrase using PBKDF2.
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  // Import passphrase as key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM.
 */
export async function encrypt(
  data: string | ArrayBuffer,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<EncryptedData> {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API not supported');
  }

  // Generate salt and IV
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt, iterations);

  // Convert data to ArrayBuffer if string
  let plaintext: ArrayBuffer;
  if (typeof data === 'string') {
    const encoder = new TextEncoder();
    plaintext = encoder.encode(data).buffer;
  } else {
    plaintext = data;
  }

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    algorithm: 'AES-GCM',
    version: 1,
  };
}

/**
 * Decrypt data using AES-GCM.
 */
export async function decrypt(
  encrypted: EncryptedData,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<ArrayBuffer> {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API not supported');
  }

  if (encrypted.algorithm !== 'AES-GCM') {
    throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`);
  }

  // Decode salt and IV
  const salt = new Uint8Array(base64ToArrayBuffer(encrypted.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(encrypted.iv));
  const ciphertext = base64ToArrayBuffer(encrypted.ciphertext);

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt, iterations);

  // Decrypt
  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Decryption failed: invalid passphrase or corrupted data');
  }
}

/**
 * Decrypt data as a string.
 */
export async function decryptString(
  encrypted: EncryptedData,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<string> {
  const plaintext = await decrypt(encrypted, passphrase, iterations);
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

/**
 * Encrypt a Float32Array (for vectors).
 */
export async function encryptVector(
  vector: Float32Array,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<EncryptedData> {
  return encrypt(vector.buffer as ArrayBuffer, passphrase, iterations);
}

/**
 * Decrypt a Float32Array (for vectors).
 */
export async function decryptVector(
  encrypted: EncryptedData,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<Float32Array> {
  const buffer = await decrypt(encrypted, passphrase, iterations);
  return new Float32Array(buffer);
}

/**
 * Encrypt a JSON-serializable object.
 */
export async function encryptJSON(
  data: unknown,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<EncryptedData> {
  const json = JSON.stringify(data);
  return encrypt(json, passphrase, iterations);
}

/**
 * Decrypt a JSON object.
 */
export async function decryptJSON<T = unknown>(
  encrypted: EncryptedData,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<T> {
  const json = await decryptString(encrypted, passphrase, iterations);
  return JSON.parse(json) as T;
}

/**
 * Hash a passphrase for verification (not for encryption key).
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Verify a passphrase against a stored hash.
 */
export async function verifyPassphrase(passphrase: string, hash: string): Promise<boolean> {
  const newHash = await hashPassphrase(passphrase);
  // Constant-time comparison to prevent timing attacks
  if (newHash.length !== hash.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < newHash.length; i++) {
    result |= newHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}
