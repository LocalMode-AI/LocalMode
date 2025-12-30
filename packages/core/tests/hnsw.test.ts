import { describe, it, expect, beforeEach } from 'vitest';
import { HNSWIndex } from '../src/hnsw/index.js';

describe('HNSWIndex', () => {
  let index: HNSWIndex;
  const dimensions = 4;

  beforeEach(() => {
    index = new HNSWIndex(dimensions, { m: 4, efConstruction: 50, efSearch: 20 });
  });

  describe('add', () => {
    it('should add a vector', () => {
      const vector = new Float32Array([1, 0, 0, 0]);
      index.add('v1', vector);
      expect(index.size).toBe(1);
      expect(index.has('v1')).toBe(true);
    });

    it('should add multiple vectors', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v2', new Float32Array([0, 1, 0, 0]));
      index.add('v3', new Float32Array([0, 0, 1, 0]));
      expect(index.size).toBe(3);
    });

    it('should throw on dimension mismatch', () => {
      expect(() => {
        index.add('v1', new Float32Array([1, 0, 0]));
      }).toThrow(/dimension mismatch/i);
    });

    it('should update existing vector', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v1', new Float32Array([0, 1, 0, 0]));
      expect(index.size).toBe(1);
      
      const stored = index.getVector('v1');
      expect(stored).toBeDefined();
      expect(stored![1]).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // Add some test vectors
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v2', new Float32Array([0.9, 0.1, 0, 0]));
      index.add('v3', new Float32Array([0, 1, 0, 0]));
      index.add('v4', new Float32Array([0, 0, 1, 0]));
      index.add('v5', new Float32Array([0, 0, 0, 1]));
    });

    it('should find the exact match first', () => {
      const query = new Float32Array([1, 0, 0, 0]);
      const results = index.search(query, 1);
      
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('v1');
      expect(results[0].score).toBeCloseTo(1, 5);
    });

    it('should find similar vectors', () => {
      const query = new Float32Array([1, 0, 0, 0]);
      const results = index.search(query, 2);
      
      expect(results.length).toBe(2);
      expect(results[0].id).toBe('v1');
      expect(results[1].id).toBe('v2'); // Most similar to v1
    });

    it('should return k results', () => {
      const query = new Float32Array([0.5, 0.5, 0, 0]);
      const results = index.search(query, 3);
      expect(results.length).toBe(3);
    });

    it('should throw on dimension mismatch', () => {
      expect(() => {
        index.search(new Float32Array([1, 0, 0]), 1);
      }).toThrow(/dimension mismatch/i);
    });

    it('should return empty array for empty index', () => {
      const emptyIndex = new HNSWIndex(dimensions);
      const results = emptyIndex.search(new Float32Array([1, 0, 0, 0]), 5);
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete a vector', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      expect(index.has('v1')).toBe(true);
      
      const deleted = index.delete('v1');
      expect(deleted).toBe(true);
      expect(index.has('v1')).toBe(false);
      expect(index.size).toBe(0);
    });

    it('should return false for non-existent vector', () => {
      const deleted = index.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should not return deleted vectors in search', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v2', new Float32Array([0.9, 0.1, 0, 0]));
      
      index.delete('v1');
      
      const results = index.search(new Float32Array([1, 0, 0, 0]), 2);
      expect(results.some(r => r.id === 'v1')).toBe(false);
    });
  });

  describe('serialize/deserialize', () => {
    it('should serialize and deserialize', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v2', new Float32Array([0, 1, 0, 0]));
      
      const serialized = index.serialize();
      const vectors = new Map<string, Float32Array>([
        ['v1', new Float32Array([1, 0, 0, 0])],
        ['v2', new Float32Array([0, 1, 0, 0])],
      ]);
      
      const restored = HNSWIndex.deserialize(serialized, vectors);
      
      expect(restored.size).toBe(2);
      expect(restored.has('v1')).toBe(true);
      expect(restored.has('v2')).toBe(true);
      
      // Search should work on restored index
      const results = restored.search(new Float32Array([1, 0, 0, 0]), 1);
      expect(results[0].id).toBe('v1');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      index.add('v1', new Float32Array([1, 0, 0, 0]));
      index.add('v2', new Float32Array([0, 1, 0, 0]));
      
      index.clear();
      
      expect(index.size).toBe(0);
      expect(index.has('v1')).toBe(false);
    });
  });
});

