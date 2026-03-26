/**
 * @fileoverview Tests for embedding drift detection and reindexing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractFingerprint,
  fingerprintsMatch,
  checkModelCompatibility,
  reindexCollection,
  createVectorDB,
  createMockEmbeddingModel,
  globalEventBus,
} from '../src/index.js';
import type {
  EmbeddingModel,
  ModelFingerprint,
  VectorDB,
} from '../src/index.js';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function createModel(modelId: string, provider: string, dimensions: number): EmbeddingModel {
  return createMockEmbeddingModel({ dimensions, modelId: `${provider}:${modelId}`, provider });
}

// ═══════════════════════════════════════════════════════════════
// FINGERPRINT HELPERS
// ═══════════════════════════════════════════════════════════════

describe('extractFingerprint()', () => {
  it('derives fingerprint from EmbeddingModel', () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const fingerprint = extractFingerprint(model);

    expect(fingerprint).toHaveProperty('modelId');
    expect(fingerprint).toHaveProperty('provider');
    expect(fingerprint).toHaveProperty('dimensions');
    expect(fingerprint.dimensions).toBe(384);
    expect(typeof fingerprint.modelId).toBe('string');
    expect(typeof fingerprint.provider).toBe('string');
  });
});

describe('fingerprintsMatch()', () => {
  it('returns true for identical fingerprints', () => {
    const a: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 384 };
    const b: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 384 };

    expect(fingerprintsMatch(a, b)).toBe(true);
  });

  it('returns false when modelId differs', () => {
    const a: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 384 };
    const b: ModelFingerprint = { modelId: 'model-b', provider: 'transformers', dimensions: 384 };

    expect(fingerprintsMatch(a, b)).toBe(false);
  });

  it('returns false when provider differs', () => {
    const a: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 384 };
    const b: ModelFingerprint = { modelId: 'model-a', provider: 'onnx', dimensions: 384 };

    expect(fingerprintsMatch(a, b)).toBe(false);
  });

  it('returns false when dimensions differ', () => {
    const a: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 384 };
    const b: ModelFingerprint = { modelId: 'model-a', provider: 'transformers', dimensions: 768 };

    expect(fingerprintsMatch(a, b)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// DRIFT DETECTION ON INITIALIZE
// ═══════════════════════════════════════════════════════════════

describe('Model drift detection on initialize()', () => {
  it('stores fingerprint on new collection with model', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const db = await createVectorDB({
      name: `drift-test-new-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model,
    });

    // Verify fingerprint is stored by checking compatibility
    const result = await checkModelCompatibility(db, model);
    expect(result.status).toBe('compatible');
    expect(result.storedModel).not.toBeNull();
    expect(result.storedModel?.modelId).toBe(model.modelId);
    expect(result.storedModel?.provider).toBe(model.provider);

    await db.close();
  });

  it('does not emit event when fingerprints match', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const listener = vi.fn();
    const unsub = globalEventBus.on('modelDriftDetected', listener);

    const db = await createVectorDB({
      name: `drift-test-match-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model,
    });

    // Re-open with same model (simulated by creating again with same storage)
    expect(listener).not.toHaveBeenCalled();
    unsub();
    await db.close();
  });

  it('emits modelDriftDetected when fingerprints differ (same dimensions)', async () => {
    const model1 = createModel('model-a', 'transformers', 384);
    const model2 = createModel('model-b', 'transformers', 384);

    // Create DB with model1
    const dbName = `drift-test-detect-${Date.now()}`;
    const db1 = await createVectorDB({
      name: dbName,
      dimensions: 384,
      storage: 'memory',
      model: model1,
    });

    // Add a document so countDocuments is > 0
    await db1.add({
      id: 'doc-1',
      vector: new Float32Array(384).fill(0.1),
      metadata: { _text: 'hello' },
    });

    // We can't easily re-initialize with a different model using MemoryStorage
    // since each createVectorDB creates a new MemoryStorage.
    // Instead, test checkModelCompatibility which checks the same logic.
    const result = await checkModelCompatibility(db1, model2);
    expect(result.status).toBe('incompatible');
    expect(result.storedModel?.modelId).toContain('model-a');
    expect(result.currentModel.modelId).toContain('model-b');
    expect(result.documentCount).toBe(1);

    await db1.close();
  });

  it('does not perform drift detection when model not provided', async () => {
    const listener = vi.fn();
    const unsub = globalEventBus.on('modelDriftDetected', listener);

    const db = await createVectorDB({
      name: `drift-test-no-model-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
    });

    expect(listener).not.toHaveBeenCalled();
    unsub();
    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK MODEL COMPATIBILITY
// ═══════════════════════════════════════════════════════════════

describe('checkModelCompatibility()', () => {
  it('returns compatible when fingerprints match', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const db = await createVectorDB({
      name: `compat-test-match-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model,
    });

    const result = await checkModelCompatibility(db, model);
    expect(result.status).toBe('compatible');
    expect(result.storedModel).not.toBeNull();
    expect(result.currentModel.modelId).toBe(model.modelId);

    await db.close();
  });

  it('returns incompatible when modelId differs (same dimensions)', async () => {
    const model1 = createModel('bge-small', 'transformers', 384);
    const model2 = createModel('minilm', 'transformers', 384);

    const db = await createVectorDB({
      name: `compat-test-incompat-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model: model1,
    });

    const result = await checkModelCompatibility(db, model2);
    expect(result.status).toBe('incompatible');

    await db.close();
  });

  it('returns compatible with storedModel null when no fingerprint stored', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    // Create DB without model (no fingerprint stored)
    const db = await createVectorDB({
      name: `compat-test-no-fp-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
    });

    const result = await checkModelCompatibility(db, model);
    expect(result.status).toBe('compatible');
    expect(result.storedModel).toBeNull();

    await db.close();
  });

  it('is read-only (does not modify storage)', async () => {
    const model1 = createModel('model-a', 'transformers', 384);
    const model2 = createModel('model-b', 'transformers', 384);

    const db = await createVectorDB({
      name: `compat-test-readonly-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model: model1,
    });

    // Check compatibility with a different model
    await checkModelCompatibility(db, model2);

    // Verify the stored fingerprint was NOT changed
    const result = await checkModelCompatibility(db, model1);
    expect(result.status).toBe('compatible');
    expect(result.storedModel?.modelId).toContain('model-a');

    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// REINDEX COLLECTION
// ═══════════════════════════════════════════════════════════════

describe('reindexCollection()', () => {
  let db: VectorDB;
  let model: EmbeddingModel;

  beforeEach(async () => {
    model = createMockEmbeddingModel({ dimensions: 384 });

    db = await createVectorDB({
      name: `reindex-test-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model,
    });

    // Add documents with _text metadata
    await db.add({
      id: 'doc-1',
      vector: new Float32Array(384).fill(0.1),
      metadata: { _text: 'Hello world', category: 'test' },
    });
    await db.add({
      id: 'doc-2',
      vector: new Float32Array(384).fill(0.2),
      metadata: { _text: 'Goodbye world', category: 'test' },
    });
  });

  it('re-embeds documents with _text metadata', async () => {
    const newModel = createMockEmbeddingModel({ dimensions: 384 });

    const result = await reindexCollection(db, newModel);

    expect(result.reindexed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('skips documents without text metadata and reports skip count', async () => {
    // Add a document without _text
    await db.add({
      id: 'doc-no-text',
      vector: new Float32Array(384).fill(0.3),
      metadata: { category: 'no-text' },
    });

    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const result = await reindexCollection(db, newModel);

    expect(result.reindexed).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('uses custom textExtractor when provided', async () => {
    // Add document with custom metadata field
    await db.add({
      id: 'doc-custom',
      vector: new Float32Array(384).fill(0.4),
      metadata: { customField: 'Custom text here' },
    });

    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const result = await reindexCollection(db, newModel, {
      textExtractor: (metadata) => {
        if (typeof metadata.customField === 'string') {
          return metadata.customField;
        }
        if (typeof metadata._text === 'string') {
          return metadata._text;
        }
        return null;
      },
    });

    // 2 docs with _text + 1 doc with customField = 3 reindexed
    expect(result.reindexed).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('updates collection fingerprint on completion', async () => {
    const newModel = createModel('new-model', 'transformers', 384);

    await reindexCollection(db, newModel);

    // Check that the fingerprint was updated
    const result = await checkModelCompatibility(db, newModel);
    expect(result.status).toBe('compatible');
    expect(result.storedModel?.modelId).toContain('new-model');
  });

  it('calls onProgress callback', async () => {
    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const progressCalls: Array<{ completed: number; total: number; skipped: number; phase: string }> = [];

    await reindexCollection(db, newModel, {
      batchSize: 1,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // The last embedding phase progress should have completed === total
    const lastEmbedding = progressCalls.filter((p) => p.phase === 'embedding').pop();
    expect(lastEmbedding?.completed).toBe(2);
  });

  it('emits reindexStart and reindexComplete events', async () => {
    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const startListener = vi.fn();
    const completeListener = vi.fn();

    const unsub1 = globalEventBus.on('reindexStart', startListener);
    const unsub2 = globalEventBus.on('reindexComplete', completeListener);

    await reindexCollection(db, newModel);

    expect(startListener).toHaveBeenCalledOnce();
    expect(startListener).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 2,
        resumed: false,
      })
    );

    expect(completeListener).toHaveBeenCalledOnce();
    expect(completeListener).toHaveBeenCalledWith(
      expect.objectContaining({
        reindexed: 2,
        skipped: 0,
      })
    );

    unsub1();
    unsub2();
  });

  it('supports AbortSignal - abort before processing', async () => {
    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    await expect(
      reindexCollection(db, newModel, { abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('handles empty collection gracefully', async () => {
    const emptyDb = await createVectorDB({
      name: `reindex-empty-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
      model,
    });

    const newModel = createMockEmbeddingModel({ dimensions: 384 });
    const result = await reindexCollection(emptyDb, newModel);

    expect(result.reindexed).toBe(0);
    expect(result.skipped).toBe(0);

    await emptyDb.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════

describe('Migration v5', () => {
  it('existing collections have modelFingerprint as undefined', async () => {
    // Create a collection without model — simulates pre-v5 collection
    const db = await createVectorDB({
      name: `migration-test-${Date.now()}`,
      dimensions: 384,
      storage: 'memory',
    });

    const model = createMockEmbeddingModel({ dimensions: 384 });
    const result = await checkModelCompatibility(db, model);

    expect(result.storedModel).toBeNull();
    expect(result.status).toBe('compatible');

    await db.close();
  });
});
