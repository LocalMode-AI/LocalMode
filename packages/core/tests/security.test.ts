/**
 * @fileoverview Tests for security features (PII redaction, encryption)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  redactPII,
  piiRedactionMiddleware,
  encrypt,
  decrypt,
  decryptString,
  encryptJSON,
  decryptJSON,
  encryptVector,
  decryptVector,
  deriveKey,
  encryptionMiddleware,
  ValidationError,
  wrapEmbeddingModel,
  wrapVectorDB,
  createVectorDB,
  createMockEmbeddingModel,
} from '../src/index.js';

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

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        result1.key,
        testData
      );

      // Should fail to decrypt with key2
      await expect(
        crypto.subtle.decrypt({ name: 'AES-GCM', iv }, result2.key, encrypted)
      ).rejects.toThrow();
    });
  });

  describe('encrypt() and decrypt()', () => {
    // A low iteration count keeps PBKDF2 fast; the default is covered once below.
    const ITERATIONS = 1000;

    it('round-trips a string with the default iteration count', async () => {
      const encrypted = await encrypt('attack at dawn', 'passphrase');

      expect(encrypted.algorithm).toBe('AES-GCM');
      expect(encrypted.version).toBe(1);
      expect(atob(encrypted.iv)).toHaveLength(12);
      expect(atob(encrypted.salt)).toHaveLength(16);
      expect(atob(encrypted.ciphertext)).not.toContain('attack at dawn');
      await expect(decryptString(encrypted, 'passphrase')).resolves.toBe('attack at dawn');
    });

    it('round-trips binary data', async () => {
      const bytes = new Uint8Array([0, 1, 2, 250, 255]);

      const encrypted = await encrypt(bytes.buffer, 'passphrase', ITERATIONS);
      const decrypted = await decrypt(encrypted, 'passphrase', ITERATIONS);

      expect(new Uint8Array(decrypted)).toEqual(bytes);
    });

    it('uses a fresh salt and IV for every call', async () => {
      const a = await encrypt('same', 'passphrase', ITERATIONS);
      const b = await encrypt('same', 'passphrase', ITERATIONS);

      expect(a.salt).not.toBe(b.salt);
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('rejects a wrong passphrase and tampered ciphertext', async () => {
      const encrypted = await encrypt('secret', 'right', ITERATIONS);
      const bytes = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
      bytes[0] ^= 0xff;
      const tampered = { ...encrypted, ciphertext: btoa(String.fromCharCode(...bytes)) };

      await expect(decrypt(encrypted, 'wrong', ITERATIONS)).rejects.toThrow(
        'Decryption failed: invalid passphrase or corrupted data'
      );
      await expect(decrypt(tampered, 'right', ITERATIONS)).rejects.toThrow(
        'Decryption failed: invalid passphrase or corrupted data'
      );
    });

    it('rejects an unsupported algorithm', async () => {
      const encrypted = await encrypt('secret', 'right', ITERATIONS);

      await expect(
        decrypt({ ...encrypted, algorithm: 'AES-CBC' as 'AES-GCM' }, 'right', ITERATIONS)
      ).rejects.toThrow('Unsupported algorithm: AES-CBC');
    });

    it('round-trips JSON and vectors', async () => {
      const object = { a: 1, b: ['x', null], c: { d: true } };
      const vector = new Float32Array([0.25, -1.5, 3]);

      const json = await decryptJSON(await encryptJSON(object, 'pw', ITERATIONS), 'pw', ITERATIONS);
      const vec = await decryptVector(await encryptVector(vector, 'pw', ITERATIONS), 'pw', ITERATIONS);

      expect(json).toEqual(object);
      expect(vec).toBeInstanceOf(Float32Array);
      expect(Array.from(vec)).toEqual([0.25, -1.5, 3]);
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

    it('encrypts metadata at rest while search and get return plaintext', async () => {
      const db = await createVectorDB({
        name: `test-encryption-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });
      const wrappedDb = wrapVectorDB({ db, middleware: encryptionMiddleware({ key }) });

      await wrappedDb.add({
        id: 'doc1',
        vector: new Float32Array([1, 0, 0]),
        metadata: { secret: 'classified', level: 3 },
      });
      await wrappedDb.add({
        id: 'doc2',
        vector: new Float32Array([0, 1, 0]),
        metadata: { secret: 'other' },
      });

      const raw = await db.get('doc1');
      expect(JSON.stringify(raw?.metadata)).not.toContain('classified');
      expect(raw?.metadata?.secret).toMatchObject({ __encrypted: true });

      const retrieved = await wrappedDb.get('doc1');
      expect(retrieved?.metadata).toEqual({ secret: 'classified', level: 3 });

      const results = await wrappedDb.search(new Float32Array([1, 0, 0]), { k: 2 });
      expect(results.map((r) => r.id)).toEqual(['doc1', 'doc2']);
      expect(results[0].metadata).toEqual({ secret: 'classified', level: 3 });

      await db.close();
    });

    it('keeps listed fields in plaintext so they remain filterable', async () => {
      const db = await createVectorDB({
        name: `test-encryption-exclude-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });
      const wrappedDb = wrapVectorDB({
        db,
        middleware: encryptionMiddleware({ key, excludeFields: ['type'] }),
      });

      await wrappedDb.add({ id: 'a', vector: new Float32Array([1, 0, 0]), metadata: { type: 'note', body: 'x' } });
      await wrappedDb.add({ id: 'b', vector: new Float32Array([1, 0, 0]), metadata: { type: 'mail', body: 'y' } });

      const results = await wrappedDb.search(new Float32Array([1, 0, 0]), { k: 5, filter: { type: 'mail' } });

      expect(results.map((r) => r.id)).toEqual(['b']);
      expect(results[0].metadata).toEqual({ type: 'mail', body: 'y' });

      await db.close();
    });

    it('stores string fields in plaintext when encryptText is false, still encrypting other values', async () => {
      const db = await createVectorDB({
        name: `test-encryption-no-text-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });
      const wrappedDb = wrapVectorDB({
        db,
        middleware: encryptionMiddleware({ key, encryptText: false }),
      });

      await wrappedDb.add({
        id: 'doc1',
        vector: new Float32Array([1, 0, 0]),
        metadata: { title: 'public title', level: 3, tags: { a: 1 } },
      });

      const raw = await db.get('doc1');
      expect(raw?.metadata?.title).toBe('public title');
      expect(raw?.metadata?.level).toMatchObject({ __encrypted: true });
      expect(raw?.metadata?.tags).toMatchObject({ __encrypted: true });

      const retrieved = await wrappedDb.get('doc1');
      expect(retrieved?.metadata).toEqual({ title: 'public title', level: 3, tags: { a: 1 } });

      const results = await wrappedDb.search(new Float32Array([1, 0, 0]), {
        k: 5,
        filter: { title: 'public title' },
      });
      expect(results.map((r) => r.id)).toEqual(['doc1']);
      expect(results[0].metadata).toEqual({ title: 'public title', level: 3, tags: { a: 1 } });

      await db.close();
    });

    it('encrypts string fields by default (encryptText: true)', async () => {
      const db = await createVectorDB({
        name: `test-encryption-text-default-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });
      const wrappedDb = wrapVectorDB({ db, middleware: encryptionMiddleware({ key }) });

      await wrappedDb.add({ id: 'doc1', vector: new Float32Array([1, 0, 0]), metadata: { title: 'hidden title' } });

      const raw = await db.get('doc1');
      expect(raw?.metadata?.title).toMatchObject({ __encrypted: true });
      expect(JSON.stringify(raw?.metadata)).not.toContain('hidden title');
      expect((await wrappedDb.get('doc1'))?.metadata).toEqual({ title: 'hidden title' });

      await db.close();
    });

    it('refuses to encrypt vectors, which the index must read to search', () => {
      expect(() => encryptionMiddleware({ key, encryptVectors: true })).toThrow(ValidationError);
      expect(() => encryptionMiddleware({ key, encryptVectors: true })).toThrow(
        /encryptVectors is not supported/
      );
    });
  });

  describe('createVectorDB() encryption option', () => {
    it('rejects encryption.enabled: true instead of silently storing plaintext', async () => {
      const config = {
        name: `test-dead-encryption-${Date.now()}`,
        dimensions: 3,
        storage: 'memory' as const,
        encryption: { enabled: true, passphrase: 'secret' },
      };
      const error = await createVectorDB(config).then(
        () => null,
        (e: unknown) => e
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
      expect((error as ValidationError).message).toMatch(/encryption option is not supported/);
      expect((error as ValidationError).hint).toContain('encryptionMiddleware');
      expect((error as ValidationError).hint).toContain('deriveEncryptionKey');
    });

    it('treats encryption.enabled: false and an absent option as no-ops', async () => {
      const disabled = await createVectorDB({
        name: `test-encryption-disabled-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
        encryption: { enabled: false },
      });
      await disabled.add({ id: 'a', vector: new Float32Array([1, 0, 0]), metadata: { t: 'x' } });
      expect((await disabled.get('a'))?.metadata).toEqual({ t: 'x' });
      await disabled.close();

      const absent = await createVectorDB({
        name: `test-encryption-absent-${Date.now()}`,
        dimensions: 3,
        storage: 'memory',
      });
      await absent.add({ id: 'b', vector: new Float32Array([0, 1, 0]) });
      expect((await absent.search(new Float32Array([0, 1, 0]), { k: 1 }))[0].id).toBe('b');
      await absent.close();
    });
  });
});

describe('Combined Security', () => {
  it('redacts PII before embedding and encrypts metadata at rest', async () => {
    const { key } = await deriveKey('test-password', undefined, 1000);
    const seen: string[][] = [];
    const safeModel = wrapEmbeddingModel({
      model: createMockEmbeddingModel({ dimensions: 4, onEmbed: ({ values }) => seen.push(values) }),
      middleware: piiRedactionMiddleware({ emails: true }),
    });
    const db = await createVectorDB({
      name: `test-combined-${Date.now()}`,
      dimensions: 4,
      storage: 'memory',
    });
    const secureDb = wrapVectorDB({ db, middleware: encryptionMiddleware({ key }) });

    const { embeddings } = await safeModel.doEmbed({ values: ['Contact john@example.com for info'] });
    await secureDb.add({
      id: 'secure-doc',
      vector: embeddings[0],
      metadata: { email: 'john@example.com' },
    });

    expect(seen).toEqual([['Contact [EMAIL_REDACTED] for info']]);
    expect(JSON.stringify((await db.get('secure-doc'))?.metadata)).not.toContain('john@example.com');
    expect((await secureDb.get('secure-doc'))?.metadata).toEqual({ email: 'john@example.com' });

    await db.close();
  });
});
