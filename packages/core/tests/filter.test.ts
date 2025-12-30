import { describe, it, expect } from 'vitest';
import { matchesFilter, applyFilter } from '../src/query/filter.js';

describe('matchesFilter', () => {
  describe('exact match', () => {
    it('should match exact string values', () => {
      expect(matchesFilter({ category: 'notes' }, { category: 'notes' })).toBe(true);
      expect(matchesFilter({ category: 'notes' }, { category: 'other' })).toBe(false);
    });

    it('should match exact number values', () => {
      expect(matchesFilter({ count: 5 }, { count: 5 })).toBe(true);
      expect(matchesFilter({ count: 5 }, { count: 10 })).toBe(false);
    });

    it('should match exact boolean values', () => {
      expect(matchesFilter({ active: true }, { active: true })).toBe(true);
      expect(matchesFilter({ active: true }, { active: false })).toBe(false);
    });

    it('should match null values', () => {
      expect(matchesFilter({ value: null }, { value: null })).toBe(true);
      expect(matchesFilter({ value: 'not null' }, { value: null })).toBe(false);
    });
  });

  describe('$in operator', () => {
    it('should match values in array', () => {
      expect(matchesFilter({ tag: 'a' }, { tag: { $in: ['a', 'b', 'c'] } })).toBe(true);
      expect(matchesFilter({ tag: 'd' }, { tag: { $in: ['a', 'b', 'c'] } })).toBe(false);
    });
  });

  describe('$nin operator', () => {
    it('should match values not in array', () => {
      expect(matchesFilter({ tag: 'd' }, { tag: { $nin: ['a', 'b', 'c'] } })).toBe(true);
      expect(matchesFilter({ tag: 'a' }, { tag: { $nin: ['a', 'b', 'c'] } })).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('$gt should match greater than', () => {
      expect(matchesFilter({ count: 10 }, { count: { $gt: 5 } })).toBe(true);
      expect(matchesFilter({ count: 5 }, { count: { $gt: 5 } })).toBe(false);
      expect(matchesFilter({ count: 3 }, { count: { $gt: 5 } })).toBe(false);
    });

    it('$gte should match greater than or equal', () => {
      expect(matchesFilter({ count: 10 }, { count: { $gte: 5 } })).toBe(true);
      expect(matchesFilter({ count: 5 }, { count: { $gte: 5 } })).toBe(true);
      expect(matchesFilter({ count: 3 }, { count: { $gte: 5 } })).toBe(false);
    });

    it('$lt should match less than', () => {
      expect(matchesFilter({ count: 3 }, { count: { $lt: 5 } })).toBe(true);
      expect(matchesFilter({ count: 5 }, { count: { $lt: 5 } })).toBe(false);
      expect(matchesFilter({ count: 10 }, { count: { $lt: 5 } })).toBe(false);
    });

    it('$lte should match less than or equal', () => {
      expect(matchesFilter({ count: 3 }, { count: { $lte: 5 } })).toBe(true);
      expect(matchesFilter({ count: 5 }, { count: { $lte: 5 } })).toBe(true);
      expect(matchesFilter({ count: 10 }, { count: { $lte: 5 } })).toBe(false);
    });
  });

  describe('$ne operator', () => {
    it('should match not equal values', () => {
      expect(matchesFilter({ status: 'active' }, { status: { $ne: 'deleted' } })).toBe(true);
      expect(matchesFilter({ status: 'deleted' }, { status: { $ne: 'deleted' } })).toBe(false);
    });
  });

  describe('$exists operator', () => {
    it('should check field existence', () => {
      expect(matchesFilter({ name: 'John' }, { name: { $exists: true } })).toBe(true);
      expect(matchesFilter({}, { name: { $exists: true } })).toBe(false);
      expect(matchesFilter({}, { name: { $exists: false } })).toBe(true);
      expect(matchesFilter({ name: 'John' }, { name: { $exists: false } })).toBe(false);
    });
  });

  describe('multiple conditions', () => {
    it('should match all conditions (AND)', () => {
      const metadata = { category: 'notes', count: 10, active: true };
      
      expect(matchesFilter(metadata, { category: 'notes', count: 10 })).toBe(true);
      expect(matchesFilter(metadata, { category: 'notes', count: 5 })).toBe(false);
      expect(matchesFilter(metadata, { category: 'notes', count: { $gt: 5 }, active: true })).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return true for empty filter', () => {
      expect(matchesFilter({ any: 'value' }, {})).toBe(true);
    });

    it('should return false for undefined metadata with non-empty filter', () => {
      expect(matchesFilter(undefined, { category: 'notes' })).toBe(false);
    });

    it('should return true for undefined metadata with empty filter', () => {
      expect(matchesFilter(undefined, {})).toBe(true);
    });
  });
});

describe('applyFilter', () => {
  const items = [
    { id: '1', metadata: { category: 'notes', count: 5 } },
    { id: '2', metadata: { category: 'notes', count: 10 } },
    { id: '3', metadata: { category: 'photos', count: 3 } },
    { id: '4', metadata: { category: 'photos', count: 8 } },
  ];

  it('should filter items by exact match', () => {
    const result = applyFilter(items, { category: 'notes' });
    expect(result.length).toBe(2);
    expect(result.map(r => r.id)).toEqual(['1', '2']);
  });

  it('should filter items by comparison', () => {
    const result = applyFilter(items, { count: { $gt: 5 } });
    expect(result.length).toBe(2);
    expect(result.map(r => r.id)).toEqual(['2', '4']);
  });

  it('should filter by multiple conditions', () => {
    const result = applyFilter(items, { category: 'photos', count: { $gt: 5 } });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('4');
  });

  it('should return all items for undefined filter', () => {
    const result = applyFilter(items, undefined);
    expect(result.length).toBe(4);
  });
});

