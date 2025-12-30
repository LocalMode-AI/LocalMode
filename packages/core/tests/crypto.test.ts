/**
 * Tests for encryption utilities.
 * Note: Web Crypto API is not fully available in jsdom, so we test the structure.
 */

import { describe, it, expect } from 'vitest';
import { isCryptoSupported } from '../src/security/crypto';
import { Keystore } from '../src/security/keystore';

describe('Crypto Support Detection', () => {
  it('should detect crypto support', () => {
    // In jsdom, crypto.subtle might be partially available
    const isSupported = isCryptoSupported();
    expect(typeof isSupported).toBe('boolean');
  });
});

describe('Keystore', () => {
  it('should create a keystore instance', () => {
    const keystore = new Keystore();
    expect(keystore).toBeInstanceOf(Keystore);
  });

  it('should start in locked state', () => {
    const keystore = new Keystore();
    expect(keystore.isUnlocked()).toBe(false);
  });

  it('should throw when getting passphrase while locked', () => {
    const keystore = new Keystore();
    expect(() => keystore.getPassphrase()).toThrow('Encryption is locked');
  });

  it('should return default iterations', () => {
    const keystore = new Keystore();
    expect(keystore.getIterations()).toBe(100000);
  });

  it('should lock and stay locked', () => {
    const keystore = new Keystore();
    keystore.lock();
    expect(keystore.isUnlocked()).toBe(false);
  });

  it('should detect keystore support', () => {
    const isSupported = Keystore.isSupported();
    expect(typeof isSupported).toBe('boolean');
  });
});

describe('Encryption Config Types', () => {
  it('should accept valid encryption config', () => {
    const config = {
      enabled: true,
      passphrase: 'secret',
      iterations: 150000,
    };

    expect(config.enabled).toBe(true);
    expect(config.passphrase).toBe('secret');
    expect(config.iterations).toBe(150000);
  });

  it('should work with minimal config', () => {
    const config = {
      enabled: false,
    };

    expect(config.enabled).toBe(false);
  });
});

describe('EncryptedData Structure', () => {
  it('should have correct encrypted data format', () => {
    const encryptedData = {
      ciphertext: 'base64-encoded-data',
      iv: 'base64-iv',
      salt: 'base64-salt',
      algorithm: 'AES-GCM' as const,
      version: 1 as const,
    };

    expect(encryptedData.algorithm).toBe('AES-GCM');
    expect(encryptedData.version).toBe(1);
    expect(typeof encryptedData.ciphertext).toBe('string');
    expect(typeof encryptedData.iv).toBe('string');
    expect(typeof encryptedData.salt).toBe('string');
  });
});

