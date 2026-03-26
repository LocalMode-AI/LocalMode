/**
 * Testing Utilities
 *
 * Mock implementations and helpers for testing @localmode applications.
 *
 * @packageDocumentation
 */

import type { EmbeddingModel } from '../embeddings/types.js';
import type { Document, SearchOptions, SearchResult, StoredDocument } from '../types.js';
import type { Entity } from '../classification/types.js';

// ============================================================================
// Seeded Random
// ============================================================================

/**
 * Create a seeded random number generator.
 *
 * Produces deterministic pseudo-random numbers for reproducible tests.
 *
 * @param seed - Initial seed value
 * @returns Function that returns random numbers between 0 and 1
 *
 * @example
 * ```typescript
 * import { createSeededRandom } from '@localmode/core';
 *
 * const rng = createSeededRandom(42);
 * const value = rng(); // Always produces the same sequence
 * ```
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;

  return function random(): number {
    // Mulberry32 PRNG
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Test Vectors
// ============================================================================

/**
 * Create a deterministic test vector.
 *
 * @param dimensions - Number of dimensions
 * @param seed - Seed for random generation
 * @param normalize - Whether to normalize the vector (default: true)
 * @returns Float32Array with deterministic values
 *
 * @example
 * ```typescript
 * import { createTestVector } from '@localmode/core';
 *
 * const vector1 = createTestVector(384, 42);
 * const vector2 = createTestVector(384, 42);
 * // vector1 and vector2 are identical
 * ```
 */
export function createTestVector(
  dimensions: number,
  seed: number = 42,
  normalize: boolean = true
): Float32Array {
  const rng = createSeededRandom(seed);
  const vector = new Float32Array(dimensions);

  for (let i = 0; i < dimensions; i++) {
    vector[i] = rng() * 2 - 1; // Values between -1 and 1
  }

  if (normalize) {
    let magnitude = 0;
    for (let i = 0; i < dimensions; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] /= magnitude;
      }
    }
  }

  return vector;
}

/**
 * Create multiple test vectors.
 *
 * @param count - Number of vectors to create
 * @param dimensions - Number of dimensions per vector
 * @param baseSeed - Base seed (each vector gets baseSeed + index)
 * @returns Array of Float32Arrays
 */
export function createTestVectors(
  count: number,
  dimensions: number,
  baseSeed: number = 0
): Float32Array[] {
  const vectors: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    vectors.push(createTestVector(dimensions, baseSeed + i));
  }
  return vectors;
}

// ============================================================================
// Mock Embedding Model
// ============================================================================

/**
 * Options for creating a mock embedding model.
 */
export interface MockEmbeddingModelOptions {
  /** Number of dimensions (default: 384) */
  dimensions?: number;

  /** Delay in milliseconds before returning (default: 0) */
  delay?: number;

  /** Number of times to fail before succeeding (default: 0) */
  failCount?: number;

  /** Error to throw when failing */
  failError?: Error;

  /** Model ID (default: 'mock:test-model') */
  modelId?: string;

  /** Seed for deterministic embeddings */
  seed?: number;

  /** Callback to track embed calls */
  onEmbed?: (options: {
    values: string[];
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }) => void;
}

/**
 * Create a mock embedding model for testing.
 *
 * @param options - Configuration options
 * @returns Mock EmbeddingModel instance
 *
 * @example
 * ```typescript
 * import { createMockEmbeddingModel, embed } from '@localmode/core';
 *
 * const model = createMockEmbeddingModel({ dimensions: 384 });
 *
 * const { embedding } = await embed({
 *   model,
 *   value: 'Hello world',
 * });
 * ```
 */
export function createMockEmbeddingModel(options: MockEmbeddingModelOptions = {}): EmbeddingModel {
  const {
    dimensions = 384,
    delay = 0,
    failCount = 0,
    failError = new Error('Mock embedding failed'),
    modelId = 'mock:test-model',
    seed = 42,
    onEmbed,
  } = options;

  let failures = 0;
  let callCount = 0;

  return {
    modelId,
    provider: 'mock',
    dimensions,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,

    async doEmbed(embedOptions) {
      callCount++;

      // Call the callback if provided
      if (onEmbed) {
        onEmbed(embedOptions);
      }

      // Check for abort
      embedOptions.abortSignal?.throwIfAborted?.();

      // Simulate delay
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        embedOptions.abortSignal?.throwIfAborted?.();
      }

      // Simulate failures
      if (failures < failCount) {
        failures++;
        throw failError;
      }

      // Generate deterministic embeddings
      const embeddings = embedOptions.values.map((value, index) => {
        // Use hash of value + seed for deterministic results
        const valueSeed = seed + hashString(value) + index;
        return createTestVector(dimensions, valueSeed);
      });

      return {
        embeddings,
        usage: {
          tokens: embedOptions.values.reduce((sum, v) => sum + v.split(/\s+/).length, 0),
        },
        response: {
          id: `mock-${callCount}`,
          modelId,
          timestamp: new Date(),
        },
      };
    },

    // Extension for testing
    get callCount() {
      return callCount;
    },
    resetCallCount() {
      callCount = 0;
      failures = 0;
    },
  } as EmbeddingModel & { callCount: number; resetCallCount: () => void };
}

/**
 * Simple string hash function.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Mock Classification Model
// ============================================================================

/**
 * Options for creating a mock classification model.
 */
export interface MockClassificationModelOptions {
  /** Available labels (default: ['positive', 'negative', 'neutral']) */
  labels?: string[];

  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Default label to return */
  defaultLabel?: string;

  /** Default score (default: 0.9) */
  defaultScore?: number;
}

/**
 * Mock classification model interface.
 */
export interface MockClassificationModel {
  modelId: string;
  provider: string;
  labels: string[];

  doClassify(options: { texts: string[]; abortSignal?: AbortSignal }): Promise<{
    results: Array<{
      label: string;
      score: number;
      allScores?: Record<string, number>;
    }>;
    usage: { inputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock classification model for testing.
 *
 * @param options - Configuration options
 * @returns Mock classification model
 */
export function createMockClassificationModel(
  options: MockClassificationModelOptions = {}
): MockClassificationModel {
  const {
    labels = ['positive', 'negative', 'neutral'],
    delay = 0,
    defaultLabel,
    defaultScore = 0.9,
  } = options;

  return {
    modelId: 'mock:classifier',
    provider: 'mock',
    labels,

    async doClassify({ texts, abortSignal }) {
      abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();

      const results = texts.map((text) => {
        // Simple heuristic for testing
        const lower = text.toLowerCase();
        let label = defaultLabel;
        let score = defaultScore;

        if (!label) {
          if (lower.includes('great') || lower.includes('good') || lower.includes('love')) {
            label = 'positive';
            score = 0.95;
          } else if (
            lower.includes('bad') ||
            lower.includes('terrible') ||
            lower.includes('hate')
          ) {
            label = 'negative';
            score = 0.92;
          } else {
            label = 'neutral';
            score = 0.88;
          }
        }

        // Generate all scores
        const allScores: Record<string, number> = {};
        labels.forEach((l) => {
          allScores[l] = l === label ? score : (1 - score) / (labels.length - 1);
        });

        return { label: label!, score, allScores };
      });

      return {
        results,
        usage: {
          inputTokens: texts.reduce((sum, t) => sum + t.split(/\s+/).length, 0),
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock NER Model
// ============================================================================

/**
 * Options for creating a mock NER model.
 */
export interface MockNERModelOptions {
  /** Entity types to detect (default: ['PERSON', 'ORG', 'LOC', 'DATE']) */
  entityTypes?: string[];

  /** Delay in milliseconds (default: 0) */
  delay?: number;
}

// Re-export Entity from classification (canonical source)
export type { Entity } from '../classification/types.js';

/**
 * Mock NER model interface.
 */
export interface MockNERModel {
  modelId: string;
  provider: string;
  entityTypes: string[];

  doExtract(options: { texts: string[]; abortSignal?: AbortSignal }): Promise<{
    results: Array<{ entities: Entity[] }>;
    usage: { inputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock NER model for testing.
 *
 * @param options - Configuration options
 * @returns Mock NER model
 */
export function createMockNERModel(options: MockNERModelOptions = {}): MockNERModel {
  const { entityTypes = ['PERSON', 'ORG', 'LOC', 'DATE'], delay = 0 } = options;

  // Simple patterns for mock extraction
  const patterns: Record<string, RegExp> = {
    PERSON: /\b(John|Jane|Bob|Alice|Mike|Sarah)\b/gi,
    ORG: /\b(Microsoft|Google|Apple|Amazon|OpenAI|Meta)\b/gi,
    LOC: /\b(Seattle|New York|London|Paris|Tokyo|Berlin)\b/gi,
    DATE: /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
  };

  return {
    modelId: 'mock:ner',
    provider: 'mock',
    entityTypes,

    async doExtract({ texts, abortSignal }) {
      abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();

      const results = texts.map((text) => {
        const entities: Entity[] = [];

        for (const type of entityTypes) {
          const pattern = patterns[type];
          if (!pattern) continue;

          let match;
          pattern.lastIndex = 0; // Reset regex state
          while ((match = pattern.exec(text)) !== null) {
            entities.push({
              text: match[0],
              type,
              start: match.index,
              end: match.index + match[0].length,
              score: 0.95,
            });
          }
        }

        // Sort by start position
        entities.sort((a, b) => a.start - b.start);

        return { entities };
      });

      return {
        results,
        usage: {
          inputTokens: texts.reduce((sum, t) => sum + t.split(/\s+/).length, 0),
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock Speech-to-Text Model
// ============================================================================

/**
 * Options for creating a mock speech-to-text model.
 */
export interface MockSpeechToTextModelOptions {
  /** Languages supported (default: ['en']) */
  languages?: string[];

  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Text to return */
  mockText?: string;
}

/**
 * Mock speech-to-text model interface.
 */
export interface MockSpeechToTextModel {
  modelId: string;
  provider: string;
  languages: string[];

  doTranscribe(options: {
    audio: Blob | ArrayBuffer | Float32Array;
    language?: string;
    task?: 'transcribe' | 'translate';
    returnTimestamps?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<{
    text: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    language?: string;
    usage: { audioDurationSec: number; durationMs: number };
  }>;
}

/**
 * Create a mock speech-to-text model for testing.
 *
 * @param options - Configuration options
 * @returns Mock speech-to-text model
 */
export function createMockSpeechToTextModel(
  options: MockSpeechToTextModelOptions = {}
): MockSpeechToTextModel {
  const { languages = ['en'], delay = 0, mockText = 'This is a test transcription.' } = options;

  return {
    modelId: 'mock:whisper',
    provider: 'mock',
    languages,

    async doTranscribe({ audio, language = 'en', returnTimestamps = false, abortSignal }) {
      abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();

      // Estimate audio duration from size
      let audioSize = 0;
      if (audio instanceof Blob) {
        audioSize = audio.size;
      } else if (audio instanceof ArrayBuffer) {
        audioSize = audio.byteLength;
      } else if (audio instanceof Float32Array) {
        audioSize = audio.byteLength;
      }

      // Rough estimate: 16kHz mono = 32KB/second
      const audioDurationSec = Math.max(1, audioSize / 32000);

      const result: Awaited<ReturnType<MockSpeechToTextModel['doTranscribe']>> = {
        text: mockText,
        language,
        usage: {
          audioDurationSec,
          durationMs: performance.now() - startTime,
        },
      };

      if (returnTimestamps) {
        const words = mockText.split(' ');
        const segmentDuration = audioDurationSec / words.length;
        result.segments = words.map((word, i) => ({
          start: i * segmentDuration,
          end: (i + 1) * segmentDuration,
          text: word,
        }));
      }

      return result;
    },
  };
}

// ============================================================================
// Mock Storage
// ============================================================================

/**
 * Simple mock storage interface for testing.
 * This is a simplified version that doesn't require the full Storage implementation.
 */
export interface SimpleMockStorage {
  get(key: string): Promise<StoredDocument | undefined>;
  set(key: string, value: StoredDocument): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  close(): Promise<void>;
  readonly size: number;
  getData(): Map<string, StoredDocument>;
}

/**
 * Create a mock storage for testing.
 *
 * @returns Simple mock storage instance
 *
 * @example
 * ```typescript
 * import { createMockStorage } from '@localmode/core';
 *
 * const storage = createMockStorage();
 * await storage.set('key', { id: 'doc1', ... });
 * const doc = await storage.get('key');
 * ```
 */
export function createMockStorage(): SimpleMockStorage {
  const data = new Map<string, StoredDocument>();

  return {
    async get(key: string): Promise<StoredDocument | undefined> {
      return data.get(key);
    },

    async set(key: string, value: StoredDocument): Promise<void> {
      data.set(key, value);
    },

    async delete(key: string): Promise<void> {
      data.delete(key);
    },

    async keys(): Promise<string[]> {
      return Array.from(data.keys());
    },

    async clear(): Promise<void> {
      data.clear();
    },

    async close(): Promise<void> {
      data.clear();
    },

    get size() {
      return data.size;
    },

    getData() {
      return new Map(data);
    },
  };
}

// ============================================================================
// Mock VectorDB
// ============================================================================

/**
 * Options for creating a mock VectorDB.
 */
export interface MockVectorDBOptions {
  /** Database name (default: 'mock-db') */
  name?: string;

  /** Number of dimensions (default: 384) */
  dimensions?: number;

  /** Delay in milliseconds for operations (default: 0) */
  delay?: number;
}

/**
 * Simplified mock VectorDB interface for testing.
 * This doesn't implement the full VectorDB interface but provides
 * the most commonly used methods for testing.
 */
export interface SimpleMockVectorDB {
  readonly name: string;
  readonly dimensions: number;
  readonly documents: Map<string, Document>;
  add(doc: Document): Promise<void>;
  addMany(docs: Document[]): Promise<void>;
  get(id: string): Promise<Document | null>;
  getMany(ids: string[]): Promise<(Document | null)[]>;
  update(id: string, updates: Partial<Omit<Document, 'id' | 'vector'>>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  search(queryVector: Float32Array, options?: SearchOptions): Promise<SearchResult[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Create a mock VectorDB for testing.
 *
 * @param options - Configuration options
 * @returns Mock VectorDB instance
 */
export function createMockVectorDB(options: MockVectorDBOptions = {}): SimpleMockVectorDB {
  const { name = 'mock-db', dimensions = 384, delay = 0 } = options;

  const documents = new Map<string, Document>();

  async function maybeDelay(): Promise<void> {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    name,
    dimensions,
    documents,

    async add(doc: Document): Promise<void> {
      await maybeDelay();
      documents.set(doc.id, { ...doc });
    },

    async addMany(docs: Document[]): Promise<void> {
      await maybeDelay();
      for (const doc of docs) {
        documents.set(doc.id, { ...doc });
      }
    },

    async get(id: string): Promise<Document | null> {
      await maybeDelay();
      return documents.get(id) ?? null;
    },

    async getMany(ids: string[]): Promise<(Document | null)[]> {
      await maybeDelay();
      return ids.map((id) => documents.get(id) ?? null);
    },

    async update(id: string, updates: Partial<Omit<Document, 'id' | 'vector'>>): Promise<void> {
      await maybeDelay();
      const doc = documents.get(id);
      if (doc) {
        documents.set(id, { ...doc, ...updates });
      }
    },

    async delete(id: string): Promise<void> {
      await maybeDelay();
      documents.delete(id);
    },

    async deleteMany(ids: string[]): Promise<void> {
      await maybeDelay();
      for (const id of ids) {
        documents.delete(id);
      }
    },

    async search(queryVector: Float32Array, options: SearchOptions = {}): Promise<SearchResult[]> {
      await maybeDelay();
      const { k = 10, threshold = 0 } = options;

      const results: SearchResult[] = [];

      for (const doc of documents.values()) {
        // Apply filter if provided
        if (options.filter && !matchesFilter(doc, options.filter)) {
          continue;
        }

        // Calculate cosine similarity
        const score = cosineSimilarity(queryVector, doc.vector);

        if (score >= threshold) {
          results.push({
            id: doc.id,
            score,
            vector: doc.vector,
            metadata: doc.metadata,
          });
        }
      }

      // Sort by score and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    },

    async count(): Promise<number> {
      return documents.size;
    },

    async clear(): Promise<void> {
      await maybeDelay();
      documents.clear();
    },

    async close(): Promise<void> {
      documents.clear();
    },
  };
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Check if document matches filter.
 */
function matchesFilter(doc: Document, filter: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filter)) {
    const docValue = doc.metadata?.[key];

    if (typeof value === 'object' && value !== null) {
      // Handle operators
      for (const [op, opValue] of Object.entries(value)) {
        switch (op) {
          case '$eq':
            if (docValue !== opValue) return false;
            break;
          case '$ne':
            if (docValue === opValue) return false;
            break;
          case '$gt':
            if (!((docValue as number) > (opValue as number))) return false;
            break;
          case '$gte':
            if (!((docValue as number) >= (opValue as number))) return false;
            break;
          case '$lt':
            if (!((docValue as number) < (opValue as number))) return false;
            break;
          case '$lte':
            if (!((docValue as number) <= (opValue as number))) return false;
            break;
          case '$in':
            if (!Array.isArray(opValue) || !opValue.includes(docValue)) return false;
            break;
          case '$nin':
            if (!Array.isArray(opValue) || opValue.includes(docValue)) return false;
            break;
          default:
            // Unknown operator, skip
            break;
        }
      }
    } else {
      // Direct equality
      if (docValue !== value) return false;
    }
  }

  return true;
}

// ============================================================================
// Mock Image Caption Model// ============================================================================

/**
 * Options for creating a mock image caption model.
 */
export interface MockImageCaptionModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Caption to return */
  mockCaption?: string;
}

/**
 * Mock image caption model interface.
 */
export interface MockImageCaptionModel {
  modelId: string;
  provider: string;

  doCaption(options: {
    images: Array<Blob | ImageData | string>;
    maxLength?: number;
    abortSignal?: AbortSignal;
  }): Promise<{
    captions: string[];
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock image caption model for testing.
 */
export function createMockImageCaptionModel(
  options: MockImageCaptionModelOptions = {}
): MockImageCaptionModel {
  const { delay = 0, mockCaption = 'A photo showing test content.' } = options;

  return {
    modelId: 'mock:image-caption',
    provider: 'mock',

    async doCaption({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      return {
        captions: images.map(() => mockCaption),
        usage: { durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Segmentation Model// ============================================================================

/**
 * Options for creating a mock segmentation model.
 */
export interface MockSegmentationModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Mock segmentation model interface.
 */
export interface MockSegmentationModel {
  modelId: string;
  provider: string;
  segmentationType: 'semantic' | 'instance' | 'panoptic';

  doSegment(options: {
    images: Array<Blob | ImageData | string>;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<{
      masks: Array<{
        label: string;
        mask: ImageData | Uint8Array;
        score: number;
      }>;
    }>;
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock segmentation model for testing.
 */
export function createMockSegmentationModel(
  options: MockSegmentationModelOptions = {}
): MockSegmentationModel {
  const { delay = 0 } = options;

  return {
    modelId: 'mock:segmentation',
    provider: 'mock',
    segmentationType: 'semantic',

    async doSegment({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      return {
        results: images.map(() => ({
          masks: [
            { label: 'background', mask: new Uint8Array(100), score: 0.98 },
            { label: 'object', mask: new Uint8Array(100), score: 0.95 },
          ],
        })),
        usage: { durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Object Detection Model// ============================================================================

/**
 * Options for creating a mock object detection model.
 */
export interface MockObjectDetectionModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Mock object detection model interface.
 */
export interface MockObjectDetectionModel {
  modelId: string;
  provider: string;

  doDetect(options: {
    images: Array<Blob | ImageData | string>;
    threshold?: number;
    abortSignal?: AbortSignal;
  }): Promise<{
    results: Array<{
      objects: Array<{
        label: string;
        score: number;
        box: { x: number; y: number; width: number; height: number };
      }>;
    }>;
    usage: { imageCount: number; durationMs: number };
  }>;
}

/**
 * Create a mock object detection model for testing.
 */
export function createMockObjectDetectionModel(
  options: MockObjectDetectionModelOptions = {}
): MockObjectDetectionModel {
  const { delay = 0 } = options;

  return {
    modelId: 'mock:object-detection',
    provider: 'mock',

    async doDetect({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      return {
        results: images.map(() => ({
          objects: [
            { label: 'person', score: 0.95, box: { x: 10, y: 20, width: 100, height: 200 } },
            { label: 'dog', score: 0.88, box: { x: 150, y: 100, width: 80, height: 60 } },
          ],
        })),
        usage: { imageCount: images.length, durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Image Feature Model// ============================================================================

/**
 * Options for creating a mock image feature model.
 */
export interface MockImageFeatureModelOptions {
  /** Feature dimensions (default: 512) */
  dimensions?: number;

  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Seed for deterministic features */
  seed?: number;
}

/**
 * Mock image feature model interface.
 */
export interface MockImageFeatureModel {
  modelId: string;
  provider: string;
  dimensions: number;

  doExtract(options: {
    images: Array<Blob | ImageData | string>;
    abortSignal?: AbortSignal;
  }): Promise<{
    features: Float32Array[];
    usage: { imageCount: number; durationMs: number };
  }>;
}

/**
 * Create a mock image feature model for testing.
 */
export function createMockImageFeatureModel(
  options: MockImageFeatureModelOptions = {}
): MockImageFeatureModel {
  const { dimensions = 512, delay = 0, seed = 42 } = options;

  return {
    modelId: 'mock:image-feature',
    provider: 'mock',
    dimensions,

    async doExtract({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      return {
        features: images.map((_, i) => createTestVector(dimensions, seed + i)),
        usage: { imageCount: images.length, durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Image-to-Image Model// ============================================================================

/**
 * Options for creating a mock image-to-image model.
 */
export interface MockImageToImageModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Task type (default: 'upscale') */
  taskType?: 'upscale' | 'style-transfer' | 'inpainting' | 'outpainting' | 'super-resolution';
}

/**
 * Mock image-to-image model interface.
 */
export interface MockImageToImageModel {
  modelId: string;
  provider: string;
  taskType: string;

  doTransform(options: {
    images: Array<Blob | ImageData | string>;
    prompt?: string;
    abortSignal?: AbortSignal;
  }): Promise<{
    images: Blob[];
    usage: { imageCount: number; durationMs: number };
  }>;
}

/**
 * Create a mock image-to-image model for testing.
 */
export function createMockImageToImageModel(
  options: MockImageToImageModelOptions = {}
): MockImageToImageModel {
  const { delay = 0, taskType = 'upscale' } = options;

  return {
    modelId: 'mock:image-to-image',
    provider: 'mock',
    taskType,

    async doTransform({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      // Return a simple blob for each input image
      return {
        images: images.map(() => new Blob(['mock image data'], { type: 'image/png' })),
        usage: { imageCount: images.length, durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Text-to-Speech Model// ============================================================================

/**
 * Options for creating a mock text-to-speech model.
 */
export interface MockTextToSpeechModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Sample rate (default: 16000) */
  sampleRate?: number;
}

/**
 * Mock text-to-speech model interface.
 */
export interface MockTextToSpeechModel {
  modelId: string;
  provider: string;
  sampleRate: number;

  doSynthesize(options: {
    text: string;
    voice?: string;
    speed?: number;
    pitch?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    audio: Blob;
    sampleRate: number;
    usage: { characterCount: number; durationMs: number };
  }>;
}

/**
 * Create a mock text-to-speech model for testing.
 */
export function createMockTextToSpeechModel(
  options: MockTextToSpeechModelOptions = {}
): MockTextToSpeechModel {
  const { delay = 0, sampleRate = 16000 } = options;

  return {
    modelId: 'mock:tts',
    provider: 'mock',
    sampleRate,

    async doSynthesize({ text, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      // Generate ~1 second of audio per 10 characters
      const durationSec = Math.max(0.5, text.length / 10);
      const numSamples = Math.floor(sampleRate * durationSec);

      // Create silent audio (zeros) as Float32Array then convert to Blob
      const audioData = new Float32Array(numSamples);
      const audio = new Blob([audioData.buffer], { type: 'audio/wav' });

      return {
        audio,
        sampleRate,
        usage: { characterCount: text.length, durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Language Model// ============================================================================

/**
 * Options for creating a mock language model.
 */
export interface MockLanguageModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Text to generate */
  mockResponse?: string;

  /**
   * Queue of responses to return in order.
   * Each call to doGenerate/doStream returns the next response.
   * After exhausting the queue, falls back to mockResponse.
   */
  responses?: string[];

  /** Context length (default: 4096) */
  contextLength?: number;
}

/**
 * Mock language model interface.
 */
export interface MockLanguageModel {
  modelId: string;
  provider: string;
  contextLength: number;

  doGenerate(options: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: unknown }>;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    text: string;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error';
    usage: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number };
  }>;

  doStream?(options: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: unknown }>;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): AsyncIterable<{
    text: string;
    done: boolean;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock language model for testing.
 */
export function createMockLanguageModel(options: MockLanguageModelOptions = {}): MockLanguageModel {
  const { delay = 0, mockResponse = 'This is a mock response.', responses, contextLength = 4096 } = options;
  const responseQueue = responses ? [...responses] : [];

  function getNextResponse(): string {
    if (responseQueue.length > 0) {
      return responseQueue.shift()!;
    }
    return mockResponse;
  }

  return {
    modelId: 'mock:llm',
    provider: 'mock',
    contextLength,

    async doGenerate({ prompt, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const response = getNextResponse();
      const startTime = performance.now();
      const inputTokens = prompt.split(/\s+/).length;
      const outputTokens = response.split(/\s+/).length;

      return {
        text: response,
        finishReason: 'stop' as const,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          durationMs: performance.now() - startTime,
        },
      };
    },

    async *doStream({ prompt, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = getNextResponse();
      const startTime = performance.now();
      const inputTokens = prompt.split(/\s+/).length;
      const tokens = response.split(' ');

      for (let i = 0; i < tokens.length; i++) {
        abortSignal?.throwIfAborted?.();
        const tokenText = (i > 0 ? ' ' : '') + tokens[i];
        const isLast = i === tokens.length - 1;

        yield {
          text: tokenText,
          done: isLast,
          finishReason: isLast ? ('stop' as const) : undefined,
          usage: isLast
            ? {
                inputTokens,
                outputTokens: tokens.length,
                totalTokens: inputTokens + tokens.length,
                durationMs: performance.now() - startTime,
              }
            : undefined,
        };
      }
    },
  };
}

// ============================================================================
// Mock Vision Language Model
// ============================================================================

/**
 * Options for creating a mock vision language model.
 */
export interface MockVisionLanguageModelOptions {
  /** Simulated delay in milliseconds (default: 0) */
  delay?: number;
  /** Context length (default: 4096) */
  contextLength?: number;
}

/**
 * Create a mock vision language model for testing.
 *
 * Returns a `LanguageModel` with `supportsVision: true` that echoes
 * a description of received content parts. Useful for testing multimodal
 * message handling without a real model.
 *
 * @param options - Configuration options
 * @returns Mock vision language model
 *
 * @example
 * ```ts
 * const model = createMockVisionLanguageModel();
 * const { text } = await generateText({
 *   model,
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Describe this' },
 *       { type: 'image', data: '...', mimeType: 'image/png' },
 *     ],
 *   }],
 *   prompt: '',
 * });
 * // text: "Received 1 text part and 1 image part"
 * ```
 */
export function createMockVisionLanguageModel(
  options: MockVisionLanguageModelOptions = {}
): MockLanguageModel & { supportsVision: true } {
  const { delay = 0, contextLength = 4096 } = options;

  function describeContent(messages?: Array<{ role: string; content: string | Array<{ type: string }> }>): string {
    if (!messages || messages.length === 0) {
      return 'No messages received';
    }
    const lastMsg = messages[messages.length - 1];
    if (typeof lastMsg.content === 'string') {
      return `Received text: ${lastMsg.content}`;
    }
    const parts = lastMsg.content;
    const textCount = parts.filter((p) => p.type === 'text').length;
    const imageCount = parts.filter((p) => p.type === 'image').length;
    const segments: string[] = [];
    if (textCount > 0) segments.push(`${textCount} text part${textCount > 1 ? 's' : ''}`);
    if (imageCount > 0) segments.push(`${imageCount} image part${imageCount > 1 ? 's' : ''}`);
    return `Received ${segments.join(' and ')}`;
  }

  return {
    modelId: 'mock:vision-llm',
    provider: 'mock',
    contextLength,
    supportsVision: true as const,

    async doGenerate({ prompt, messages, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const response = describeContent(messages as Array<{ role: string; content: string | Array<{ type: string }> }>);
      const inputTokens = prompt.split(/\s+/).length;
      const outputTokens = response.split(/\s+/).length;

      return {
        text: response,
        finishReason: 'stop' as const,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          durationMs: 0,
        },
      };
    },

    async *doStream({ prompt, messages, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = describeContent(messages as Array<{ role: string; content: string | Array<{ type: string }> }>);
      const tokens = response.split(' ');

      for (let i = 0; i < tokens.length; i++) {
        abortSignal?.throwIfAborted?.();
        const tokenText = (i > 0 ? ' ' : '') + tokens[i];
        const isLast = i === tokens.length - 1;

        yield {
          text: tokenText,
          done: isLast,
          finishReason: isLast ? ('stop' as const) : undefined,
          usage: isLast
            ? {
                inputTokens: prompt.split(/\s+/).length,
                outputTokens: tokens.length,
                totalTokens: prompt.split(/\s+/).length + tokens.length,
                durationMs: 0,
              }
            : undefined,
        };
      }
    },
  };
}

// ============================================================================
// Mock Translation Model
// ============================================================================

/**
 * Options for creating a mock translation model.
 */
export interface MockTranslationModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Mock translation prefix (default: '[translated]') */
  translationPrefix?: string;
}

/**
 * Mock translation model interface.
 */
export interface MockTranslationModel {
  modelId: string;
  provider: string;

  doTranslate(options: {
    texts: string[];
    sourceLanguage?: string;
    targetLanguage?: string;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    translations: string[];
    detectedLanguage?: string;
    usage: { inputTokens: number; outputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock translation model for testing.
 */
export function createMockTranslationModel(
  options: MockTranslationModelOptions = {}
): MockTranslationModel {
  const { delay = 0, translationPrefix = '[translated]' } = options;

  return {
    modelId: 'mock:translation',
    provider: 'mock',

    async doTranslate({ texts, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const translations = texts.map((text) => `${translationPrefix} ${text}`);
      const inputTokens = texts.join(' ').split(/\s+/).length;
      const outputTokens = translations.join(' ').split(/\s+/).length;

      return {
        translations,
        usage: {
          inputTokens,
          outputTokens,
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock Summarization Model// ============================================================================

/**
 * Options for creating a mock summarization model.
 */
export interface MockSummarizationModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Mock summary (default: takes first sentence) */
  mockSummary?: string;
}

/**
 * Mock summarization model interface.
 */
export interface MockSummarizationModel {
  modelId: string;
  provider: string;

  doSummarize(options: {
    texts: string[];
    maxLength?: number;
    minLength?: number;
    mode?: 'extractive' | 'abstractive';
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    summaries: string[];
    usage: { inputTokens: number; outputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock summarization model for testing.
 */
export function createMockSummarizationModel(
  options: MockSummarizationModelOptions = {}
): MockSummarizationModel {
  const { delay = 0, mockSummary } = options;

  return {
    modelId: 'mock:summarization',
    provider: 'mock',

    async doSummarize({ texts, maxLength, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const summaries: string[] = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (const text of texts) {
        // Default: take first sentence or truncate
        let summaryText = mockSummary;
        if (!summaryText) {
          const firstSentence = text.split(/[.!?]/)[0] + '.';
          summaryText =
            maxLength && firstSentence.length > maxLength
              ? firstSentence.substring(0, maxLength) + '...'
              : firstSentence;
        }

        summaries.push(summaryText);
        totalInputTokens += text.split(/\s+/).length;
        totalOutputTokens += summaryText.split(/\s+/).length;
      }

      return {
        summaries,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock Fill-Mask Model// ============================================================================

/**
 * Options for creating a mock fill-mask model.
 */
export interface MockFillMaskModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Mock predictions */
  mockPredictions?: Array<{ token: string; score: number }>;
}

/**
 * Mock fill-mask model interface.
 */
export interface MockFillMaskModel {
  modelId: string;
  provider: string;

  doFillMask(options: {
    texts: string[];
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<Array<{ token: string; score: number; sequence: string }>>;
    usage: { inputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock fill-mask model for testing.
 */
export function createMockFillMaskModel(options: MockFillMaskModelOptions = {}): MockFillMaskModel {
  const {
    delay = 0,
    mockPredictions = [
      { token: 'great', score: 0.85 },
      { token: 'wonderful', score: 0.1 },
      { token: 'fantastic', score: 0.05 },
    ],
  } = options;

  return {
    modelId: 'mock:fill-mask',
    provider: 'mock',

    async doFillMask({ texts, topK = 5, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const inputTokens = texts.join(' ').split(/\s+/).length;
      const predictions = mockPredictions.slice(0, topK).map((p) => ({
        ...p,
        sequence: texts[0]?.replace('[MASK]', p.token) || p.token,
      }));

      return {
        results: texts.map(() => predictions),
        usage: {
          inputTokens,
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock Question Answering Model// ============================================================================

/**
 * Options for creating a mock question answering model.
 */
export interface MockQuestionAnsweringModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Mock question answering model interface.
 */
export interface MockQuestionAnsweringModel {
  modelId: string;
  provider: string;
  maxContextLength?: number;

  doAnswer(options: {
    questions: Array<{ question: string; context: string }>;
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<Array<{ answer: string; score: number; start: number; end: number }>>;
    usage: { inputTokens: number; durationMs: number };
  }>;
}

/**
 * Create a mock question answering model for testing.
 */
export function createMockQuestionAnsweringModel(
  options: MockQuestionAnsweringModelOptions = {}
): MockQuestionAnsweringModel {
  const { delay = 0 } = options;

  return {
    modelId: 'mock:qa',
    provider: 'mock',
    maxContextLength: 512,

    async doAnswer({ questions, topK = 1, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const results: Array<Array<{ answer: string; score: number; start: number; end: number }>> =
        [];
      let totalInputTokens = 0;

      for (const { question, context } of questions) {
        // Find a substring that might answer the question
        const words = context.split(/\s+/);
        const answer = words.slice(0, Math.min(10, words.length)).join(' ');
        const start = 0;
        const end = answer.length;

        totalInputTokens += question.split(/\s+/).length + context.split(/\s+/).length;

        results.push([{ answer, score: 0.92, start, end }].slice(0, topK));
      }

      return {
        results,
        usage: {
          inputTokens: totalInputTokens,
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock OCR Model// ============================================================================

/**
 * Options for creating a mock OCR model.
 */
export interface MockOCRModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Mock extracted text */
  mockText?: string;
}

/**
 * Mock OCR model interface.
 */
export interface MockOCRModel {
  modelId: string;
  provider: string;
  supportedLanguages?: string[];

  doOCR(options: {
    images: Array<Blob | ImageData | string>;
    languages?: string[];
    detectRegions?: boolean;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    texts: string[];
    regions?: Array<
      Array<{
        text: string;
        confidence: number;
        bbox?: { x: number; y: number; width: number; height: number };
      }>
    >;
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock OCR model for testing.
 */
export function createMockOCRModel(options: MockOCRModelOptions = {}): MockOCRModel {
  const { delay = 0, mockText = 'Sample extracted text from image.' } = options;

  return {
    modelId: 'mock:ocr',
    provider: 'mock',
    supportedLanguages: ['en', 'es', 'fr', 'de'],

    async doOCR({ images, detectRegions, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const texts = images.map(() => mockText);
      const regions = detectRegions
        ? images.map(() => [
            { text: mockText, confidence: 0.95, bbox: { x: 10, y: 10, width: 200, height: 30 } },
          ])
        : undefined;

      return {
        texts,
        regions,
        usage: { durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Document QA Model// ============================================================================

/**
 * Options for creating a mock document QA model.
 */
export interface MockDocumentQAModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Mock document QA model interface.
 */
export interface MockDocumentQAModel {
  modelId: string;
  provider: string;

  doAskDocument(options: {
    document: Blob | ImageData | string;
    questions: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    answers: Array<{ answer: string; score: number }>;
    usage: { durationMs: number };
  }>;

  doAskTable(options: {
    table: { headers: string[]; rows: string[][] };
    questions: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    answers: Array<{ answer: string; score: number; cells?: string[]; aggregator?: string }>;
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock document QA model for testing.
 */
export function createMockDocumentQAModel(
  options: MockDocumentQAModelOptions = {}
): MockDocumentQAModel {
  const { delay = 0 } = options;

  return {
    modelId: 'mock:document-qa',
    provider: 'mock',

    async doAskDocument({ questions, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();

      return {
        answers: questions.map(() => ({ answer: 'Mock answer from document.', score: 0.88 })),
        usage: {
          durationMs: performance.now() - startTime,
        },
      };
    },

    async doAskTable({ questions, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      return {
        answers: questions.map(() => ({
          answer: 'Mock answer from table.',
          score: 0.9,
          cells: ['10'],
          aggregator: 'SUM',
        })),
        usage: {
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

// ============================================================================
// Mock Audio Classification Model
// ============================================================================

/**
 * Options for creating a mock audio classification model.
 */
export interface MockAudioClassificationModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Mock labels (default: ['speech', 'music', 'noise']) */
  labels?: string[];
}

/**
 * Mock audio classification model interface.
 */
export interface MockAudioClassificationModel {
  modelId: string;
  provider: string;

  doClassify(options: {
    audio: Array<Blob | ArrayBuffer | Float32Array>;
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<Array<{ label: string; score: number }>>;
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock audio classification model for testing.
 */
export function createMockAudioClassificationModel(
  options: MockAudioClassificationModelOptions = {}
): MockAudioClassificationModel {
  const { delay = 0, labels = ['speech', 'music', 'noise'] } = options;

  return {
    modelId: 'mock:audio-classifier',
    provider: 'mock',

    async doClassify({ audio, topK = 5, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();

      const predictions = labels.slice(0, topK).map((label, i) => ({
        label,
        score: Math.max(0.95 - i * 0.2, 0.05),
      }));

      return {
        results: audio.map(() => predictions),
        usage: { durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Mock Depth Estimation Model
// ============================================================================

/**
 * Options for creating a mock depth estimation model.
 */
export interface MockDepthEstimationModelOptions {
  /** Delay in milliseconds (default: 0) */
  delay?: number;

  /** Width of the mock depth map (default: 224) */
  width?: number;

  /** Height of the mock depth map (default: 224) */
  height?: number;
}

/**
 * Mock depth estimation model interface.
 */
export interface MockDepthEstimationModel {
  modelId: string;
  provider: string;

  doEstimate(options: {
    images: Array<Blob | ImageData | string | ArrayBuffer>;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    depthMaps: Array<Float32Array | ImageData>;
    usage: { durationMs: number };
  }>;
}

/**
 * Create a mock depth estimation model for testing.
 */
export function createMockDepthEstimationModel(
  options: MockDepthEstimationModelOptions = {}
): MockDepthEstimationModel {
  const { delay = 0, width = 224, height = 224 } = options;

  return {
    modelId: 'mock:depth-estimation',
    provider: 'mock',

    async doEstimate({ images, abortSignal }) {
      abortSignal?.throwIfAborted?.();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      const startTime = performance.now();
      const size = width * height;

      return {
        depthMaps: images.map(() => {
          const depthMap = new Float32Array(size);
          for (let i = 0; i < size; i++) {
            depthMap[i] = (i / size); // Gradient from 0 to 1
          }
          return depthMap;
        }),
        usage: { durationMs: performance.now() - startTime },
      };
    },
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Wait for a condition to be true.
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param interval - Check interval in milliseconds (default: 50)
 * @returns Promise that resolves when condition is met
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 50
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Create a deferred promise for testing.
 *
 * @returns Object with promise and resolve/reject functions
 */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Create a spy function for testing.
 *
 * @returns Spy function with call tracking
 */
export function createSpy<T extends (...args: unknown[]) => unknown>(): T & {
  calls: Parameters<T>[];
  callCount: number;
  reset: () => void;
} {
  const calls: Parameters<T>[] = [];

  const spy = ((...args: Parameters<T>) => {
    calls.push(args);
  }) as T & {
    calls: Parameters<T>[];
    callCount: number;
    reset: () => void;
  };

  Object.defineProperty(spy, 'calls', { get: () => calls });
  Object.defineProperty(spy, 'callCount', { get: () => calls.length });
  spy.reset = () => {
    calls.length = 0;
  };

  return spy;
}

// ============================================================================
// Mock Multimodal Embedding Model
// ============================================================================

/**
 * Options for creating a mock multimodal embedding model.
 */
export interface MockMultimodalEmbeddingModelOptions {
  /** Number of dimensions (default: 512) */
  dimensions?: number;

  /** Delay in milliseconds before returning (default: 0) */
  delay?: number;

  /** Number of times to fail before succeeding (default: 0) */
  failCount?: number;

  /** Error to throw when failing */
  failError?: Error;

  /** Model ID (default: 'mock:multimodal-embedding') */
  modelId?: string;

  /** Seed for deterministic embeddings */
  seed?: number;

  /** Supported modalities (default: ['text', 'image']) */
  supportedModalities?: Array<'text' | 'image' | 'audio'>;
}

/**
 * Create a mock multimodal embedding model for testing.
 *
 * Produces deterministic embeddings for both text and images in the same
 * vector space, making it easy to test cross-modal search scenarios.
 *
 * @param options - Configuration options
 * @returns Mock MultimodalEmbeddingModel instance
 *
 * @example
 * ```typescript
 * import { createMockMultimodalEmbeddingModel, embedImage, embed } from '@localmode/core';
 *
 * const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
 *
 * const { embedding: textVec } = await embed({ model, value: 'cat' });
 * const { embedding: imgVec } = await embedImage({ model, image: catBlob });
 *
 * // Both vectors have same dimensions
 * expect(textVec.length).toBe(512);
 * expect(imgVec.length).toBe(512);
 * ```
 */
export function createMockMultimodalEmbeddingModel(
  options: MockMultimodalEmbeddingModelOptions = {}
) {
  const {
    dimensions = 512,
    delay = 0,
    failCount = 0,
    failError = new Error('Mock multimodal embedding failed'),
    modelId = 'mock:multimodal-embedding',
    seed = 42,
    supportedModalities = ['text', 'image'],
  } = options;

  let textFailures = 0;
  let imageFailures = 0;
  let textCallCount = 0;
  let imageCallCount = 0;

  return {
    modelId,
    provider: 'mock',
    dimensions,
    maxEmbeddingsPerCall: 100 as number | undefined,
    supportsParallelCalls: true,
    supportedModalities,

    async doEmbed(embedOptions: {
      values: string[];
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
      providerOptions?: Record<string, Record<string, unknown>>;
    }) {
      textCallCount++;

      embedOptions.abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        embedOptions.abortSignal?.throwIfAborted?.();
      }

      if (textFailures < failCount) {
        textFailures++;
        throw failError;
      }

      const embeddings = embedOptions.values.map((value, index) => {
        const valueSeed = seed + hashString(value) + index;
        return createTestVector(dimensions, valueSeed);
      });

      return {
        embeddings,
        usage: {
          tokens: embedOptions.values.reduce((sum, v) => sum + v.split(/\s+/).length, 0),
        },
        response: {
          id: `mock-text-${textCallCount}`,
          modelId,
          timestamp: new Date(),
        },
      };
    },

    async doEmbedImage(embedOptions: {
      images: Array<Blob | ImageData | string | ArrayBuffer>;
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
      providerOptions?: Record<string, Record<string, unknown>>;
    }) {
      imageCallCount++;

      embedOptions.abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        embedOptions.abortSignal?.throwIfAborted?.();
      }

      if (imageFailures < failCount) {
        imageFailures++;
        throw failError;
      }

      // Use a different seed offset for images to distinguish from text
      const embeddings = embedOptions.images.map((_, index) => {
        const imageSeed = seed + 10000 + index;
        return createTestVector(dimensions, imageSeed);
      });

      return {
        embeddings,
        usage: {
          tokens: embedOptions.images.length, // 1 "token" per image
        },
        response: {
          id: `mock-image-${imageCallCount}`,
          modelId,
          timestamp: new Date(),
        },
      };
    },

    get textCallCount() {
      return textCallCount;
    },
    get imageCallCount() {
      return imageCallCount;
    },
    resetCallCounts() {
      textCallCount = 0;
      imageCallCount = 0;
      textFailures = 0;
      imageFailures = 0;
    },
  };
}

// ============================================================================
// Mock Import/Export Data Helpers
// ============================================================================

/**
 * Create mock Pinecone JSON export data.
 *
 * @param count - Number of records to generate
 * @param dimensions - Vector dimensions per record
 * @returns JSON string in Pinecone format
 *
 * @example
 * ```ts
 * const data = createMockPineconeData(10, 384);
 * const records = parsePinecone(data);
 * // 10 records with 384-dimensional vectors
 * ```
 */
export function createMockPineconeData(count: number, dimensions: number): string {
  const rng = createSeededRandom(42);
  const vectors = [];

  for (let i = 0; i < count; i++) {
    const values = [];
    for (let d = 0; d < dimensions; d++) {
      values.push(Math.round((rng() * 2 - 1) * 1000) / 1000);
    }
    vectors.push({
      id: `pinecone-${i}`,
      values,
      metadata: { source: 'mock', index: i },
    });
  }

  return JSON.stringify({ vectors });
}

/**
 * Create mock ChromaDB JSON export data.
 *
 * @param count - Number of records to generate
 * @param dimensions - Vector dimensions per record
 * @returns JSON string in ChromaDB columnar format
 *
 * @example
 * ```ts
 * const data = createMockChromaData(10, 384);
 * const records = parseChroma(data);
 * // 10 records with 384-dimensional vectors
 * ```
 */
export function createMockChromaData(count: number, dimensions: number): string {
  const rng = createSeededRandom(43);
  const ids: string[] = [];
  const embeddings: number[][] = [];
  const metadatas: Record<string, unknown>[] = [];
  const documents: string[] = [];

  for (let i = 0; i < count; i++) {
    ids.push(`chroma-${i}`);
    const emb = [];
    for (let d = 0; d < dimensions; d++) {
      emb.push(Math.round((rng() * 2 - 1) * 1000) / 1000);
    }
    embeddings.push(emb);
    metadatas.push({ source: 'mock', index: i });
    documents.push(`Document ${i} content`);
  }

  return JSON.stringify({ ids, embeddings, metadatas, documents });
}

/**
 * Create mock CSV export data with vector column.
 *
 * @param count - Number of records to generate
 * @param dimensions - Vector dimensions per record
 * @returns CSV string with id, text, vector, and metadata columns
 *
 * @example
 * ```ts
 * const data = createMockCSVVectorData(10, 384);
 * const records = parseCSVVectors(data);
 * // 10 records with 384-dimensional vectors
 * ```
 */
export function createMockCSVVectorData(count: number, dimensions: number): string {
  const rng = createSeededRandom(44);
  const lines = ['id,text,vector,source'];

  for (let i = 0; i < count; i++) {
    const values = [];
    for (let d = 0; d < dimensions; d++) {
      values.push(Math.round((rng() * 2 - 1) * 1000) / 1000);
    }
    const vectorStr = `"[${values.join(',')}]"`;
    lines.push(`csv-${i},Document ${i},${vectorStr},mock`);
  }

  return lines.join('\n');
}

/**
 * Create mock JSONL export data.
 *
 * @param count - Number of records to generate
 * @param dimensions - Vector dimensions per record
 * @returns JSONL string with one JSON object per line
 *
 * @example
 * ```ts
 * const data = createMockJSONLData(10, 384);
 * const records = parseJSONL(data);
 * // 10 records with 384-dimensional vectors
 * ```
 */
export function createMockJSONLData(count: number, dimensions: number): string {
  const rng = createSeededRandom(45);
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    const vector = [];
    for (let d = 0; d < dimensions; d++) {
      vector.push(Math.round((rng() * 2 - 1) * 1000) / 1000);
    }
    lines.push(JSON.stringify({
      id: `jsonl-${i}`,
      text: `Document ${i}`,
      vector,
      source: 'mock',
    }));
  }

  return lines.join('\n');
}

// ============================================================================
// Mock Agent Utilities
// ============================================================================

/**
 * Options for creating a mock language model for agent testing.
 */
export interface MockAgentLanguageModelOptions {
  /** Sequence of JSON responses the model should return (as raw text) */
  actionSequence: Array<
    | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
    | { type: 'finish'; result: string }
  >;
  /** Context length in tokens (default: 4096) */
  contextLength?: number;
  /** Delay per step in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Create a mock language model that returns a predetermined sequence
 * of agent actions (tool calls and finish). Useful for testing the
 * agent ReAct loop without a real LLM.
 *
 * @param options - Configuration with action sequence
 * @returns A LanguageModel that returns JSON action strings
 *
 * @example
 * ```ts
 * const model = createMockLanguageModelForAgent({
 *   actionSequence: [
 *     { type: 'tool_call', tool: 'search', args: { query: 'test' } },
 *     { type: 'finish', result: 'The answer is 42.' },
 *   ],
 * });
 *
 * const result = await runAgent({ model, tools, prompt: 'What is 42?' });
 * ```
 */
export function createMockLanguageModelForAgent(
  options: MockAgentLanguageModelOptions
) {
  const { actionSequence, contextLength = 4096, delay = 0 } = options;
  const queue = [...actionSequence];
  let callCount = 0;

  return {
    modelId: 'mock:agent-llm',
    provider: 'mock',
    contextLength,

    async doGenerate({ abortSignal }: { prompt: string; abortSignal?: AbortSignal }) {
      abortSignal?.throwIfAborted?.();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        abortSignal?.throwIfAborted?.();
      }

      callCount++;
      const action = queue.shift();
      if (!action) {
        // Default to finish if sequence exhausted
        const text = JSON.stringify({ type: 'finish', result: 'No more actions in sequence.' });
        return {
          text,
          finishReason: 'stop' as const,
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, durationMs: 1 },
        };
      }

      const text = JSON.stringify(action);
      return {
        text,
        finishReason: 'stop' as const,
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, durationMs: 1 },
      };
    },

    get callCount() {
      return callCount;
    },
  };
}

/**
 * Create a mock tool for testing agents.
 *
 * @param name - Tool name
 * @param result - Value the tool returns when executed
 * @returns A ToolDefinition mock
 *
 * @example
 * ```ts
 * const searchTool = createMockTool('search', 'Found: quantum computing article');
 * const agent = createAgent({ model, tools: [searchTool] });
 * ```
 */
export function createMockTool(
  name: string,
  result: string | Record<string, unknown> = 'Mock result',
  description: string = `Mock ${name} tool`,
) {
  let callCount = 0;
  const calls: Array<{ args: unknown }> = [];

  return {
    name,
    description,
    parameters: {
      parse: (value: unknown) => {
        if (typeof value !== 'object' || value === null) return {};
        return value;
      },
      jsonSchema: { type: 'object', properties: {} },
    },
    execute: async (params: unknown) => {
      callCount++;
      calls.push({ args: params });
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
    get callCount() {
      return callCount;
    },
    get calls() {
      return calls;
    },
  };
}
