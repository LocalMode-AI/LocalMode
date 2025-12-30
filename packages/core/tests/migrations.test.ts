/**
 * Tests for migrations system.
 */

import { describe, it, expect } from 'vitest';
import {
  MIGRATIONS,
  getCurrentVersion,
  getMigrationsToRun,
  MigrationManager,
} from '../src/storage/migrations';

describe('Migrations', () => {
  it('should have migration definitions', () => {
    expect(MIGRATIONS).toBeInstanceOf(Array);
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('should have incrementing version numbers', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    const sortedVersions = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(sortedVersions);
  });

  it('should have descriptions for all migrations', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.description).toBeTruthy();
      expect(typeof migration.description).toBe('string');
    }
  });

  it('should have migrate functions for all migrations', () => {
    for (const migration of MIGRATIONS) {
      expect(typeof migration.migrate).toBe('function');
    }
  });
});

describe('getCurrentVersion', () => {
  it('should return the highest version number', () => {
    const current = getCurrentVersion();
    const maxVersion = Math.max(...MIGRATIONS.map((m) => m.version));
    expect(current).toBe(maxVersion);
  });

  it('should return a positive number', () => {
    const current = getCurrentVersion();
    expect(current).toBeGreaterThan(0);
  });
});

describe('getMigrationsToRun', () => {
  it('should return empty array when versions are equal', () => {
    const migrations = getMigrationsToRun(3, 3);
    expect(migrations).toEqual([]);
  });

  it('should return empty array when target is lower than current', () => {
    const migrations = getMigrationsToRun(3, 2);
    expect(migrations).toEqual([]);
  });

  it('should return migrations between versions', () => {
    const migrations = getMigrationsToRun(0, 2);
    expect(migrations.length).toBe(2);
    expect(migrations[0].version).toBe(1);
    expect(migrations[1].version).toBe(2);
  });

  it('should return migrations in ascending order', () => {
    const migrations = getMigrationsToRun(0, getCurrentVersion());
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version);
    }
  });

  it('should return all migrations from version 0', () => {
    const migrations = getMigrationsToRun(0, getCurrentVersion());
    expect(migrations.length).toBe(MIGRATIONS.length);
  });
});

describe('MigrationManager', () => {
  it('should create a migration manager', () => {
    const manager = new MigrationManager('test-db');
    expect(manager).toBeInstanceOf(MigrationManager);
  });

  it('should return migration history', () => {
    const manager = new MigrationManager('test-db');
    const history = manager.getMigrationHistory();

    expect(history).toBeInstanceOf(Array);
    expect(history.length).toBe(MIGRATIONS.length);

    for (const item of history) {
      expect(typeof item.version).toBe('number');
      expect(typeof item.description).toBe('string');
    }
  });

  it('should close without error', () => {
    const manager = new MigrationManager('test-db');
    expect(() => manager.close()).not.toThrow();
  });
});

