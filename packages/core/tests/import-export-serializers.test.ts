/**
 * @file import-export-serializers.test.ts
 * @description Unit tests for exportToCSV, exportToJSONL, and convertFormat
 */

import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToJSONL, convertFormat } from '../src/import-export/index.js';
import { parseCSVVectors } from '../src/import-export/parsers/csv.js';
import { parseJSONL } from '../src/import-export/parsers/jsonl.js';
import type { ImportRecord } from '../src/import-export/types.js';

// ============================================================================
// Test data
// ============================================================================

function createTestRecords(): ImportRecord[] {
  return [
    {
      id: 'v1',
      text: 'hello',
      vector: new Float32Array([0.1, 0.2]),
      metadata: { category: 'docs' },
    },
    {
      id: 'v2',
      text: 'world',
      vector: new Float32Array([0.3, 0.4]),
      metadata: { category: 'code', score: 0.95 },
    },
  ];
}

// ============================================================================
// exportToCSV
// ============================================================================

describe('exportToCSV()', () => {
  it('generates header with metadata columns', () => {
    const records = createTestRecords();
    const csv = exportToCSV(records);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('text');
    expect(lines[0]).toContain('vector');
    expect(lines[0]).toContain('category');
    expect(lines[0]).toContain('score');
  });

  it('serializes vectors as JSON arrays', () => {
    const records = createTestRecords();
    const csv = exportToCSV(records);
    // Float32Array values may have precision differences
    expect(csv).toContain('[0.1');
    expect(csv).toMatch(/0\.2\d*\]/);
  });

  it('handles union of metadata keys across records', () => {
    const records: ImportRecord[] = [
      { id: 'v1', metadata: { a: 1 } },
      { id: 'v2', metadata: { b: 2 } },
    ];
    const csv = exportToCSV(records);
    const header = csv.split('\n')[0];
    expect(header).toContain('a');
    expect(header).toContain('b');

    // v1 should have empty b
    const lines = csv.split('\n');
    expect(lines[1]).toContain('v1');
  });

  it('escapes values with commas', () => {
    const records: ImportRecord[] = [
      { id: 'v1', text: 'New York, NY' },
    ];
    const csv = exportToCSV(records);
    expect(csv).toContain('"New York, NY"');
  });

  it('escapes values with quotes', () => {
    const records: ImportRecord[] = [
      { id: 'v1', text: 'He said "hi"' },
    ];
    const csv = exportToCSV(records);
    expect(csv).toContain('"He said ""hi"""');
  });

  it('respects delimiter option', () => {
    const records = createTestRecords();
    const csv = exportToCSV(records, { delimiter: '\t' });
    const header = csv.split('\n')[0];
    expect(header).toContain('\t');
    expect(header).not.toContain(',');
  });

  it('omits vector column when includeVectors is false', () => {
    const records = createTestRecords();
    const csv = exportToCSV(records, { includeVectors: false });
    const header = csv.split('\n')[0];
    expect(header).not.toContain('vector');
  });

  it('omits text column when includeText is false', () => {
    const records = createTestRecords();
    const csv = exportToCSV(records, { includeText: false });
    const header = csv.split('\n')[0];
    expect(header).not.toContain('text');
  });

  it('omits vector column when no records have vectors', () => {
    const records: ImportRecord[] = [
      { id: 'v1', text: 'hello' },
    ];
    const csv = exportToCSV(records);
    const header = csv.split('\n')[0];
    expect(header).not.toContain('vector');
  });

  it('returns empty string for empty records', () => {
    expect(exportToCSV([])).toBe('');
  });
});

// ============================================================================
// exportToJSONL
// ============================================================================

describe('exportToJSONL()', () => {
  it('produces one line per record', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('each line is valid JSON', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records);
    for (const line of jsonl.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('flattens metadata into the object', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records);
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.category).toBe('docs');
    expect(parsed.metadata).toBeUndefined();
  });

  it('includes vector as number array', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records);
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.vector).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });

  it('omits vector when includeVectors is false', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records, { includeVectors: false });
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.vector).toBeUndefined();
  });

  it('omits text when includeText is false', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records, { includeText: false });
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.text).toBeUndefined();
  });

  it('respects vectorFieldName option', () => {
    const records = createTestRecords();
    const jsonl = exportToJSONL(records, { vectorFieldName: 'embedding' });
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.embedding).toBeDefined();
    expect(parsed.vector).toBeUndefined();
  });

  it('omits vector key when record has no vector', () => {
    const records: ImportRecord[] = [{ id: 'v1', text: 'hello' }];
    const jsonl = exportToJSONL(records);
    const parsed = JSON.parse(jsonl);
    expect(parsed.vector).toBeUndefined();
  });
});

// ============================================================================
// convertFormat
// ============================================================================

describe('convertFormat()', () => {
  it('converts Pinecone JSON to CSV', () => {
    const pinecone = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2], metadata: { k: 'v' } }],
    });

    const csv = convertFormat(pinecone, { from: 'pinecone', to: 'csv' });
    expect(csv).toContain('id');
    expect(csv).toContain('v1');
    expect(csv).toContain('[0.1');
  });

  it('converts ChromaDB JSON to JSONL', () => {
    const chroma = JSON.stringify({
      ids: ['d1'],
      embeddings: [[0.1, 0.2]],
      documents: ['text1'],
    });

    const jsonl = convertFormat(chroma, { from: 'chroma', to: 'jsonl' });
    const parsed = JSON.parse(jsonl);
    expect(parsed.id).toBe('d1');
    expect(parsed.text).toBe('text1');
    expect(parsed.vector).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });

  it('auto-detects source format', () => {
    const pinecone = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1] }],
    });

    const csv = convertFormat(pinecone, { to: 'csv' });
    expect(csv).toContain('v1');
  });

  it('converts to Pinecone format', () => {
    const csvData = 'id,text,vector\nv1,hello,"[0.1, 0.2]"';
    const result = convertFormat(csvData, { from: 'csv', to: 'pinecone' });
    const parsed = JSON.parse(result);
    expect(parsed.vectors).toHaveLength(1);
    expect(parsed.vectors[0].id).toBe('v1');
    expect(parsed.vectors[0].values).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });

  it('converts to ChromaDB format', () => {
    const jsonlData = '{"id":"v1","text":"hello","vector":[0.1,0.2]}';
    const result = convertFormat(jsonlData, { from: 'jsonl', to: 'chroma' });
    const parsed = JSON.parse(result);
    expect(parsed.ids).toEqual(['v1']);
    expect(parsed.embeddings).toHaveLength(1);
    expect(parsed.documents).toEqual(['hello']);
  });

  it('roundtrip: parse + serialize + parse produces same records', () => {
    const original = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2, 0.3], metadata: { k: 'value' } },
        { id: 'v2', values: [0.4, 0.5, 0.6], metadata: { k: 'other' } },
      ],
    });

    // Pinecone -> JSONL -> parse
    const jsonl = convertFormat(original, { from: 'pinecone', to: 'jsonl' });
    const records = parseJSONL(jsonl);

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('v1');
    expect(records[0].vector![0]).toBeCloseTo(0.1);
    expect(records[1].id).toBe('v2');
  });
});
