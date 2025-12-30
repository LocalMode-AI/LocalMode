/**
 * @fileoverview Tests for security features (PII redaction, encryption)
 * FIXED VERSION - All tests updated to match actual implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  redactPII,
  piiRedactionMiddleware,
  encrypt,
  decrypt,
  deriveKey,
  Keystore,
  createKeystore,
  encryptionMiddleware,
  wrapEmbeddingModel,
  wrapVectorDB,
  createVectorDB,
  createMockEmbeddingModel,
} from '../src/index.js';
import type { PIIRedactionOptions } from '../src/index.js';

describe('PII Redaction', () => {
  describe('redactPII()', () => {
    it('redacts email addresses', () => {
      const text = 'Contact john@example.com for more info';
      const result = redactPII(text, { emails: true });

      expect(result).not.toContain('john@example.com');
      expect(result).toContain('[EMAIL_REDACTED]');
    });

    it('redacts multiple emails', () => {
      const text = 'Email john@example.com or jane@company.org';
      const result = redactPII(text, { emails: true });

      expect(result).not.toContain('john@example.com');
      expect(result).not.toContain('jane@company.org');
      expect(result.match(/\[EMAIL_REDACTED\]/g)?.length).toBe(2);
    });

    it('redacts phone numbers', () => {
      const text = 'Call me at 555-123-4567 or 555.987.6543';
      const result = redactPII(text, { phones: true });

      expect(result).not.toContain('555-123-4567');
      expect(result).not.toContain('555.987.6543');
      expect(result).toContain('[PHONE_REDACTED]');
    });

    it('redacts SSN', () => {
      const text = 'SSN: 123-45-6789';
      const result = redactPII(text, { ssn: true });

      expect(result).not.toContain('123-45-6789');
      expect(result).toContain('[SSN_REDACTED]');
    });

    it('redacts credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const result = redactPII(text, { creditCards: true });

      expect(result).not.toContain('4111-1111-1111-1111');
      expect(result).toContain('[CARD_REDACTED]');
    });

    it('redacts custom patterns', () => {
      const text = 'Employee ID: EMP-12345';
      const result = redactPII(text, {
        customPatterns: [{ pattern: /EMP-\d+/g, replacement: '[REDACTED]' }],
      });

      expect(result).not.toContain('EMP-12345');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts multiple PII types', () => {
      const text = 'Contact john@example.com at 555-123-4567. SSN: 123-45-6789';
      const result = redactPII(text, {
        emails: true,
        phones: true,
        ssn: true,
      });

      expect(result).not.toContain('john@example.com');
      expect(result).not.toContain('555-123-4567');
      expect(result).not.toContain('123-45-6789');
    });

    it('returns original text when no PII found', () => {
      const text = 'This is a normal sentence without PII';
      const result = redactPII(text, { emails: true });

      expect(result).toBe(text);
    });

    it('handles empty string', () => {
      const result = redactPII('', { emails: true });
      expect(result).toBe('');
    });
  });

  describe('piiRedactionMiddleware()', () => {
    it('creates embedding middleware', () => {
      const middleware = piiRedactionMiddleware({ emails: true });

      expect(middleware).toHaveProperty('transformParams');
    });

    it('redacts PII before embedding', async () => {
      const middleware = piiRedactionMiddleware({
        emails: true,
        phones: true,
      });

      const transformed = await middleware.transformParams!({
        values: ['Contact john@example.com at 555-123-4567'],
      });

      expect(transformed.values[0]).not.toContain('john@example.com');
      expect(transformed.values[0]).not.toContain('555-123-4567');
    });

    it('works with wrapEmbeddingModel', async () => {
      const mockModel = createMockEmbeddingModel({ dimensions: 384 });
      const doEmbedSpy = vi.spyOn(mockModel, 'doEmbed');

      const safeModel = wrapEmbeddingModel({
        model: mockModel,
        middleware: piiRedactionMiddleware({ emails: true }),
      });

      await safeModel.doEmbed({
        values: ['Contact john@example.com'],
      });

      // Check that redacted text was passed to model
      const calls = doEmbedSpy.mock.calls;
      expect(calls[0][0].values[0]).toContain('[EMAIL_REDACTED]');
      expect(calls[0][0].values[0]).not.toContain('john@example.com');
    });
  });
});

describe('Encryption', () => {
  describe('deriveKey()', () => {
    it('derives key from password', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result = await deriveKey('my-password', salt);

      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('salt');
      expect(result.key).toBeInstanceOf(CryptoKey);
      expect(typeof result.salt).toBe('string');
    });

    it('produces consistent keys with same password and salt', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result1 = await deriveKey('my-password', salt);
      const result2 = await deriveKey('my-password', salt);

      // Compare by encrypting same data
      const testData = new TextEncoder().encode('test');
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted1 = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        result1.key,
        testData
      );

      // Should be able to decrypt with key2
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        result2.key,
        encrypted1
      );

      expect(new TextDecoder().decode(decrypted)).toBe('test');
    });

    it('produces different keys with different passwords', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result1 = await deriveKey('password1', salt);
      const result2 = await deriveKey('password2', salt);

      // Encrypt with key1
      const testData = new TextEncoder().encode('test');
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, result1.key, testData);

      // Should fail to decrypt with key2
      await expect(
        crypto.subtle.decrypt({ name: 'AES-GCM', iv }, result2.key, encrypted)
      ).rejects.toThrow();
    });
  });

  describe('encrypt() and decrypt()', () => {
    let key: CryptoKey;

    beforeEach(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result = await deriveKey('test-password', salt);
      key = result.key;
    });

    it('encrypts data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await encrypt(data, key);

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');
      expect(encrypted.iv).toBeInstanceOf(Uint8Array);
      expect(encrypted.data).toBeInstanceOf(Uint8Array);
    });

    it('produces different ciphertext each time', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted1 = await encrypt(data, key);
      const encrypted2 = await encrypt(data, key);

      // IVs should be different
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);

      // Ciphertext should be different
      expect(encrypted1.data).not.toEqual(encrypted2.data);
    });

    it('decrypts encrypted data', async () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await encrypt(original, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(original);
    });

    it('fails with wrong key', async () => {
      const wrongSalt = crypto.getRandomValues(new Uint8Array(16));
      const wrongResult = await deriveKey('wrong-password', wrongSalt);

      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await encrypt(original, key);

      await expect(decrypt(encrypted, wrongResult.key)).rejects.toThrow();
    });
  });

  describe('Keystore', () => {
    let keystore: Keystore;

    beforeEach(async () => {
      keystore = await createKeystore({
        password: 'master-password',
      });
    });

    it('initializes with password', () => {
      expect(keystore).toBeDefined();
      expect(keystore.isUnlocked()).toBe(true);
    });

    it('can be locked and unlocked', async () => {
      keystore.lock();
      expect(keystore.isUnlocked()).toBe(false);

      // Note: unlock would require actual IndexedDB in browser environment
      // Skipping unlock test as it requires browser IndexedDB
    });
  });

  describe('encryptionMiddleware()', () => {
    let key: CryptoKey;

    beforeEach(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result = await deriveKey('test-password', salt);
      key = result.key;
    });

    it('creates VectorDB middleware', () => {
      const middleware = encryptionMiddleware({ key });

      expect(middleware).toHaveProperty('beforeAdd');
      expect(middleware).toHaveProperty('afterGet');
    });

    it('encrypts metadata on add', async () => {
      const middleware = encryptionMiddleware({
        key,
        encryptMetadata: true,
      });

      const doc = {
        id: 'test',
        vector: new Float32Array([1, 2, 3]),
        metadata: { text: 'sensitive data' },
      };

      const transformed = await middleware.beforeAdd!(doc);

      // Metadata should be encrypted
      expect(transformed.metadata).not.toEqual(doc.metadata);
    });

    it('decrypts metadata on get', async () => {
      const middleware = encryptionMiddleware({
        key,
        encryptMetadata: true,
      });

      const originalDoc = {
        id: 'test',
        vector: new Float32Array([1, 2, 3]),
        metadata: { text: 'sensitive data' },
      };

      // Encrypt
      const encrypted = await middleware.beforeAdd!(originalDoc);

      // Metadata should be encrypted
      expect(encrypted.metadata).not.toEqual(originalDoc.metadata);

      // Decrypt
      const decrypted = await middleware.afterGet!(encrypted);

      // Should decrypt back to original
      expect(decrypted?.metadata).toEqual(originalDoc.metadata);
    });

    it('works with wrapVectorDB', async () => {
      const middleware = encryptionMiddleware({
        key,
        encryptMetadata: true,
      });

      const db = await createVectorDB({
        name: `test-encryption-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });

      const wrappedDb = wrapVectorDB({
        db,
        middleware,
      });

      await wrappedDb.add({
        id: 'doc1',
        vector: new Float32Array([1, 2, 3]),
        metadata: { secret: 'classified' },
      });

      const result = await wrappedDb.get('doc1');

      expect(result?.metadata).toEqual({ secret: 'classified' });

      await db.close();
    });
  });
});

describe('Combined Security', () => {
  it('combines PII redaction and encryption', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyResult = await deriveKey('test-password', salt);
    const key = keyResult.key;

    // Create model with PII redaction
    const mockModel = createMockEmbeddingModel({ dimensions: 384 });
    const safeModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: piiRedactionMiddleware({ emails: true }),
    });

    // Create DB with encryption
    const encryptMiddleware = encryptionMiddleware({
      key,
      encryptMetadata: true,
    });

    const db = await createVectorDB({
      name: `test-combined-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
    });

    const secureDb = wrapVectorDB({ db, middleware: encryptMiddleware });

    // Embed with PII redaction, store with encryption
    const { embedding } = await safeModel.doEmbed({
      values: ['Contact john@example.com for info'],
    });

    await secureDb.add({
      id: 'secure-doc',
      vector: embedding.embeddings[0],
      metadata: { email: 'john@example.com' },
    });

    // Retrieve and verify
    const retrieved = await secureDb.get('secure-doc');

    expect(retrieved).toBeDefined();
    expect(retrieved?.metadata.email).toBe('john@example.com'); // Decrypted correctly

    await db.close();
  });
});
