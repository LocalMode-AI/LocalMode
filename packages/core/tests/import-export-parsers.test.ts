/**
 * @file import-export-parsers.test.ts
 * @description Unit tests for vector data format parsers and detectFormat
 */

import { describe, it, expect } from 'vitest';
import { parsePinecone } from '../src/import-export/parsers/pinecone.js';
import { parseChroma } from '../src/import-export/parsers/chroma.js';
import { parseCSVVectors } from '../src/import-export/parsers/csv.js';
import { parseJSONL } from '../src/import-export/parsers/jsonl.js';
import { detectFormat } from '../src/import-export/detect.js';
import { parseExternalFormat } from '../src/import-export/import-from.js';
import { ParseError } from '../src/errors/index.js';

// ============================================================================
// parsePinecone
// ============================================================================

describe('parsePinecone()', () => {
  it('parses vectors array format', () => {
    const data = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2, 0.3], metadata: { title: 'Hello' } },
        { id: 'v2', values: [0.4, 0.5, 0.6], metadata: { title: 'World' } },
      ],
    });

    const records = parsePinecone(data);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('v1');
    expect(records[0].vector).toBeInstanceOf(Float32Array);
    expect(records[0].vector!.length).toBe(3);
    expect(records[0].vector![0]).toBeCloseTo(0.1);
    expect(records[0].metadata).toEqual({ title: 'Hello' });
  });

  it('parses flat array format', () => {
    const data = JSON.stringify([
      { id: 'v1', values: [0.1, 0.2], metadata: {} },
    ]);

    const records = parsePinecone(data);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('v1');
    expect(records[0].vector).toBeInstanceOf(Float32Array);
    expect(records[0].vector!.length).toBe(2);
  });

  it('handles text-only records (no values)', () => {
    const data = JSON.stringify({
      vectors: [
        { id: 'v1', metadata: { text: 'Hello world' } },
      ],
    });

    const records = parsePinecone(data);
    expect(records).toHaveLength(1);
    expect(records[0].vector).toBeUndefined();
    expect(records[0].text).toBe('Hello world');
  });

  it('extracts text from metadata.content', () => {
    const data = JSON.stringify({
      vectors: [
        { id: 'v1', metadata: { content: 'Some content' } },
      ],
    });

    const records = parsePinecone(data);
    expect(records[0].text).toBe('Some content');
  });

  it('ignores sparse_values', () => {
    const data = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2], sparse_values: { indices: [0, 1], values: [0.5, 0.6] } },
      ],
    });

    const records = parsePinecone(data);
    expect(records[0].vector!.length).toBe(2);
    // sparse_values should not affect the record
  });

  it('throws ParseError on invalid JSON', () => {
    expect(() => parsePinecone('not valid json')).toThrow(ParseError);
  });

  it('throws ParseError when vectors is not an array', () => {
    expect(() => parsePinecone('{"vectors": "not an array"}')).toThrow(ParseError);
  });
});

// ============================================================================
// parseChroma
// ============================================================================

describe('parseChroma()', () => {
  it('parses columnar format', () => {
    const data = JSON.stringify({
      ids: ['d1', 'd2'],
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      metadatas: [{ k: 'v1' }, { k: 'v2' }],
      documents: ['text1', 'text2'],
    });

    const records = parseChroma(data);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('d1');
    expect(records[0].vector).toBeInstanceOf(Float32Array);
    expect(records[0].vector!.length).toBe(2);
    expect(records[0].text).toBe('text1');
    expect(records[0].metadata).toEqual({ k: 'v1' });
  });

  it('handles null embeddings (text-only)', () => {
    const data = JSON.stringify({
      ids: ['d1'],
      embeddings: null,
      documents: ['some text'],
    });

    const records = parseChroma(data);
    expect(records).toHaveLength(1);
    expect(records[0].vector).toBeUndefined();
    expect(records[0].text).toBe('some text');
  });

  it('throws ParseError on mismatched array lengths', () => {
    const data = JSON.stringify({
      ids: ['d1', 'd2', 'd3'],
      embeddings: [[0.1], [0.2]],
    });

    expect(() => parseChroma(data)).toThrow(ParseError);
  });

  it('throws ParseError on invalid JSON', () => {
    expect(() => parseChroma('not valid json')).toThrow(ParseError);
  });

  it('handles missing metadatas and documents', () => {
    const data = JSON.stringify({
      ids: ['d1'],
      embeddings: [[0.1, 0.2]],
    });

    const records = parseChroma(data);
    expect(records).toHaveLength(1);
    expect(records[0].metadata).toBeUndefined();
    expect(records[0].text).toBeUndefined();
  });
});

// ============================================================================
// parseCSVVectors
// ============================================================================

describe('parseCSVVectors()', () => {
  it('parses CSV with vector column', () => {
    const csv = 'id,text,vector\nv1,hello,"[0.1, 0.2, 0.3]"\nv2,world,"[0.4, 0.5, 0.6]"';

    const records = parseCSVVectors(csv);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('v1');
    expect(records[0].text).toBe('hello');
    expect(records[0].vector).toBeInstanceOf(Float32Array);
    expect(records[0].vector!.length).toBe(3);
  });

  it('auto-detects embedding column name', () => {
    const csv = 'id,embedding\nv1,"[0.1, 0.2]"';
    const records = parseCSVVectors(csv);
    expect(records[0].vector).toBeInstanceOf(Float32Array);
  });

  it('auto-detects values column name', () => {
    const csv = 'id,values\nv1,"[0.1, 0.2]"';
    const records = parseCSVVectors(csv);
    expect(records[0].vector).toBeInstanceOf(Float32Array);
  });

  it('supports manual vectorColumn option', () => {
    const csv = 'id,my_embedding\nv1,"[0.1, 0.2]"';
    const records = parseCSVVectors(csv, { vectorColumn: 'my_embedding' });
    expect(records[0].vector).toBeInstanceOf(Float32Array);
  });

  it('auto-detects ID column variants', () => {
    const csv = '_id,vector\nmy-id,"[0.1]"';
    const records = parseCSVVectors(csv);
    expect(records[0].id).toBe('my-id');
  });

  it('auto-detects text column variants', () => {
    const csv = 'id,content,vector\nv1,hello world,"[0.1]"';
    const records = parseCSVVectors(csv);
    expect(records[0].text).toBe('hello world');
  });

  it('remaining columns become metadata', () => {
    const csv = 'id,text,vector,category,score\nv1,hello,"[0.1]",docs,0.95';
    const records = parseCSVVectors(csv);
    expect(records[0].metadata).toEqual({ category: 'docs', score: 0.95 });
  });

  it('handles CSV without vector column (text-only)', () => {
    const csv = 'id,text,category\nv1,hello,docs';
    const records = parseCSVVectors(csv);
    expect(records[0].vector).toBeUndefined();
    expect(records[0].id).toBe('v1');
    expect(records[0].text).toBe('hello');
  });

  it('handles malformed vector JSON (record still created)', () => {
    const csv = 'id,vector\nv1,"not a vector"';
    const records = parseCSVVectors(csv);
    expect(records).toHaveLength(1);
    expect(records[0].vector).toBeUndefined();
  });

  it('handles values with commas and quotes', () => {
    const csv = 'id,text,vector\nv1,"New York, NY","[0.1, 0.2]"\nv2,"He said ""hi""","[0.3, 0.4]"';
    const records = parseCSVVectors(csv);
    expect(records[0].text).toBe('New York, NY');
    expect(records[1].text).toBe('He said "hi"');
  });

  it('generates IDs when no ID column', () => {
    const csv = 'text,vector\nhello,"[0.1]"';
    const records = parseCSVVectors(csv);
    expect(records[0].id).toMatch(/^csv-row-/);
  });
});

// ============================================================================
// parseJSONL
// ============================================================================

describe('parseJSONL()', () => {
  it('parses multiple lines with vector field', () => {
    const data = '{"id":"v1","vector":[0.1,0.2]}\n{"id":"v2","vector":[0.3,0.4]}';
    const records = parseJSONL(data);
    expect(records).toHaveLength(2);
    expect(records[0].vector).toBeInstanceOf(Float32Array);
    expect(records[0].vector!.length).toBe(2);
  });

  it('detects embedding field name variant', () => {
    const data = '{"id":"v1","embedding":[0.1,0.2]}';
    const records = parseJSONL(data);
    expect(records[0].vector).toBeInstanceOf(Float32Array);
  });

  it('detects values field name variant', () => {
    const data = '{"id":"v1","values":[0.1,0.2]}';
    const records = parseJSONL(data);
    expect(records[0].vector).toBeInstanceOf(Float32Array);
  });

  it('detects text field variants', () => {
    const data = '{"id":"v1","content":"hello"}';
    const records = parseJSONL(data);
    expect(records[0].text).toBe('hello');
  });

  it('detects ID field variants', () => {
    const data = '{"_id":"v1","vector":[0.1]}';
    const records = parseJSONL(data);
    expect(records[0].id).toBe('v1');
  });

  it('generates unique ID when missing', () => {
    const data = '{"vector":[0.1,0.2]}';
    const records = parseJSONL(data);
    expect(records[0].id).toBeTruthy();
    expect(records[0].id.length).toBeGreaterThan(0);
  });

  it('skips blank lines', () => {
    const data = '{"id":"v1","vector":[0.1]}\n\n\n{"id":"v2","vector":[0.2]}';
    const records = parseJSONL(data);
    expect(records).toHaveLength(2);
  });

  it('throws ParseError with line number on malformed line', () => {
    const data = '{"id":"v1","vector":[0.1]}\nnot valid json\n{"id":"v3"}';
    try {
      parseJSONL(data);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).context?.line).toBe(2);
    }
  });

  it('collects metadata from remaining fields', () => {
    const data = '{"id":"v1","vector":[0.1],"category":"docs","score":0.9}';
    const records = parseJSONL(data);
    expect(records[0].metadata).toEqual({ category: 'docs', score: 0.9 });
  });

  it('handles nested metadata object', () => {
    const data = '{"id":"v1","vector":[0.1],"metadata":{"k":"v"}}';
    const records = parseJSONL(data);
    expect(records[0].metadata?.k).toBe('v');
  });
});

// ============================================================================
// detectFormat
// ============================================================================

describe('detectFormat()', () => {
  it('detects Pinecone JSON (vectors array)', () => {
    const data = JSON.stringify({ vectors: [{ id: 'v1', values: [0.1] }] });
    expect(detectFormat(data)).toBe('pinecone');
  });

  it('detects Pinecone flat array', () => {
    const data = JSON.stringify([{ id: 'v1', values: [0.1], metadata: {} }]);
    expect(detectFormat(data)).toBe('pinecone');
  });

  it('detects ChromaDB JSON', () => {
    const data = JSON.stringify({ ids: ['d1'], embeddings: [[0.1]], documents: ['text'] });
    expect(detectFormat(data)).toBe('chroma');
  });

  it('detects ChromaDB JSON with null embeddings', () => {
    const data = JSON.stringify({ ids: ['d1'], embeddings: null, documents: ['text'] });
    expect(detectFormat(data)).toBe('chroma');
  });

  it('detects JSONL', () => {
    const data = '{"id":"v1","vector":[0.1]}\n{"id":"v2","vector":[0.2]}';
    expect(detectFormat(data)).toBe('jsonl');
  });

  it('detects CSV', () => {
    const data = 'id,text,vector\nv1,hello,"[0.1]"';
    expect(detectFormat(data)).toBe('csv');
  });

  it('throws ParseError on unknown format', () => {
    expect(() => detectFormat('just plain text without structure')).toThrow(ParseError);
  });

  it('throws ParseError on empty content', () => {
    expect(() => detectFormat('')).toThrow(ParseError);
  });
});

// ============================================================================
// parseExternalFormat
// ============================================================================

describe('parseExternalFormat()', () => {
  it('auto-detects format', () => {
    const data = JSON.stringify({ vectors: [{ id: 'v1', values: [0.1, 0.2] }] });
    const result = parseExternalFormat(data);
    expect(result.format).toBe('pinecone');
    expect(result.totalRecords).toBe(1);
    expect(result.recordsWithVectors).toBe(1);
    expect(result.dimensions).toBe(2);
  });

  it('respects explicit format override', () => {
    const data = '{"id":"v1","vector":[0.1]}';
    const result = parseExternalFormat(data, { format: 'jsonl' });
    expect(result.format).toBe('jsonl');
    expect(result.totalRecords).toBe(1);
  });

  it('provides accurate counts', () => {
    const data = JSON.stringify({
      ids: ['d1', 'd2', 'd3'],
      embeddings: [[0.1], null, [0.3]],
      documents: [null, 'text only', null],
    });

    const result = parseExternalFormat(data, { format: 'chroma' });
    expect(result.totalRecords).toBe(3);
    expect(result.recordsWithVectors).toBe(2);
    expect(result.recordsWithTextOnly).toBe(1);
  });

  it('returns null dimensions when no vectors present', () => {
    const data = JSON.stringify({
      ids: ['d1'],
      embeddings: null,
      documents: ['text'],
    });

    const result = parseExternalFormat(data, { format: 'chroma' });
    expect(result.dimensions).toBeNull();
  });

  it('detects dimensions from vectors', () => {
    const data = '{"id":"v1","vector":[0.1,0.2,0.3]}';
    const result = parseExternalFormat(data, { format: 'jsonl' });
    expect(result.dimensions).toBe(3);
  });
});
