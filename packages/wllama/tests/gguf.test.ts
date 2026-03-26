/**
 * @localmode/wllama Tests — GGUF Parser & Browser Compat
 *
 * Unit tests for GGUF metadata parsing and browser compatibility checking.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GGUFMetadata } from '../src/gguf.js';

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

const mockGgufResult = {
  metadata: {
    'general.architecture': 'llama',
    'llama.context_length': 131072,
    'llama.embedding_length': 2048,
    'llama.vocab_size': 32000,
    'llama.attention.head_count': 32,
    'llama.block_count': 22,
    'general.name': 'Llama 3.2 1B Instruct',
    'general.author': 'Meta',
    'general.license': 'MIT',
    'general.file_type': 15, // Q4_K_M
    version: 3,
    tensor_count: BigInt(100),
    kv_count: BigInt(20),
  },
  tensorInfos: [
    { name: 'token_embd.weight', n_dims: 2, shape: [BigInt(32000), BigInt(2048)], dtype: 15, offset: BigInt(0) },
    { name: 'blk.0.attn_q.weight', n_dims: 2, shape: [BigInt(2048), BigInt(2048)], dtype: 15, offset: BigInt(1000) },
  ],
  tensorDataOffset: BigInt(4096),
  parameterCount: 1_236_000_000,
};

vi.mock('@huggingface/gguf', () => ({
  gguf: vi.fn().mockResolvedValue(mockGgufResult),
}));

// Mock @wllama/wllama for context length auto-detection tests
vi.mock('@wllama/wllama', () => ({
  Wllama: function Wllama() {
    return {
      loadModelFromUrl: vi.fn().mockResolvedValue(undefined),
      createCompletion: vi.fn().mockResolvedValue('Hello'),
      tokenize: vi.fn().mockResolvedValue([1, 2, 3]),
      lookupToken: vi.fn().mockResolvedValue(-1),
      samplingInit: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      cacheManager: { open: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) },
    };
  },
}));

// ═══════════════════════════════════════════════════════════════
// IMPORTS (after mocks)
// ═══════════════════════════════════════════════════════════════

import { parseGGUFMetadata, mapQuantizationType } from '../src/gguf.js';
import { checkGGUFBrowserCompat, checkGGUFBrowserCompatFromURL } from '../src/compat.js';
import { resolveModelUrl } from '../src/utils.js';

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('GGUF Metadata Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // 9.1: Quantization string mapping
  // ─────────────────────────────────────────────────────────────
  describe('mapQuantizationType()', () => {
    it('should map known file_type values to names', () => {
      expect(mapQuantizationType(0)).toBe('F32');
      expect(mapQuantizationType(1)).toBe('F16');
      expect(mapQuantizationType(2)).toBe('Q4_0');
      expect(mapQuantizationType(3)).toBe('Q4_1');
      expect(mapQuantizationType(7)).toBe('Q8_0');
      expect(mapQuantizationType(8)).toBe('Q8_1');
      expect(mapQuantizationType(10)).toBe('Q2_K');
      expect(mapQuantizationType(11)).toBe('Q3_K_S');
      expect(mapQuantizationType(12)).toBe('Q3_K_M');
      expect(mapQuantizationType(13)).toBe('Q3_K_L');
      expect(mapQuantizationType(14)).toBe('Q4_K_S');
      expect(mapQuantizationType(15)).toBe('Q4_K_M');
      expect(mapQuantizationType(16)).toBe('Q5_K_S');
      expect(mapQuantizationType(17)).toBe('Q5_K_M');
      expect(mapQuantizationType(18)).toBe('Q6_K');
    });

    it('should map unknown values to UNKNOWN(N)', () => {
      expect(mapQuantizationType(99)).toBe('UNKNOWN(99)');
      expect(mapQuantizationType(-1)).toBe('UNKNOWN(-1)');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.2: parseGGUFMetadata()
  // ─────────────────────────────────────────────────────────────
  describe('parseGGUFMetadata()', () => {
    it('should extract and normalize all metadata fields', async () => {
      const metadata = await parseGGUFMetadata('https://huggingface.co/repo/model/resolve/main/model.gguf');

      expect(metadata.architecture).toBe('llama');
      expect(metadata.contextLength).toBe(131072);
      expect(metadata.embeddingLength).toBe(2048);
      expect(metadata.vocabSize).toBe(32000);
      expect(metadata.headCount).toBe(32);
      expect(metadata.layerCount).toBe(22);
      expect(metadata.quantization).toBe('Q4_K_M');
      expect(metadata.fileType).toBe(15);
      expect(metadata.modelName).toBe('Llama 3.2 1B Instruct');
      expect(metadata.author).toBe('Meta');
      expect(metadata.license).toBe('MIT');
      expect(metadata.parameterCount).toBe(1_236_000_000);
      expect(metadata.fileSize).toBeGreaterThan(0);
      expect(metadata.rawMetadata).toBeDefined();
    });

    it('should include all raw metadata keys', async () => {
      const metadata = await parseGGUFMetadata('https://example.com/model.gguf');
      expect(metadata.rawMetadata['general.architecture']).toBe('llama');
      expect(metadata.rawMetadata['llama.context_length']).toBe(131072);
      expect(metadata.rawMetadata['general.name']).toBe('Llama 3.2 1B Instruct');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.3: HuggingFace shorthand URL resolution
  // ─────────────────────────────────────────────────────────────
  describe('HuggingFace shorthand URL resolution', () => {
    it('should expand repo/name:file.gguf to full URL', () => {
      const url = resolveModelUrl('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
      expect(url).toBe('https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf');
    });

    it('should pass through full URLs unchanged', () => {
      const fullUrl = 'https://huggingface.co/repo/model/resolve/main/model.gguf';
      expect(resolveModelUrl(fullUrl)).toBe(fullUrl);
    });

    it('should handle modelUrl override', () => {
      expect(resolveModelUrl('anything', 'https://custom.com/model.gguf')).toBe('https://custom.com/model.gguf');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.4: parseGGUFMetadata() error cases
  // ─────────────────────────────────────────────────────────────
  describe('parseGGUFMetadata() errors', () => {
    it('should throw descriptive error for non-GGUF files', async () => {
      const { gguf } = await import('@huggingface/gguf');
      (gguf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Invalid GGUF magic bytes'));

      await expect(
        parseGGUFMetadata('https://example.com/not-a-gguf.txt')
      ).rejects.toThrow(/not a valid GGUF file/);
    });

    it('should throw with abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        parseGGUFMetadata('https://example.com/model.gguf', { abortSignal: controller.signal })
      ).rejects.toThrow();
    });

    it('should throw for Range request failures', async () => {
      const { gguf } = await import('@huggingface/gguf');
      (gguf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('HTTP 416 Range Not Satisfiable'));

      await expect(
        parseGGUFMetadata('https://example.com/model.gguf')
      ).rejects.toThrow(/Range request/);
    });
  });
});

describe('GGUF Browser Compatibility', () => {
  const originalDeviceMemory = Object.getOwnPropertyDescriptor(navigator, 'deviceMemory');
  const originalCrossOriginIsolated = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore navigator.deviceMemory
    if (originalDeviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', originalDeviceMemory);
    } else {
      // Remove property if it didn't exist
      try {
        Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });
      } catch {
        // ignore
      }
    }
    // Restore crossOriginIsolated
    if (originalCrossOriginIsolated) {
      Object.defineProperty(globalThis, 'crossOriginIsolated', originalCrossOriginIsolated);
    } else {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: undefined, writable: true, configurable: true });
    }
  });

  // Helper to create test metadata
  function createTestMetadata(overrides: Partial<GGUFMetadata> = {}): GGUFMetadata {
    return {
      architecture: 'llama',
      contextLength: 4096,
      embeddingLength: 2048,
      quantization: 'Q4_K_M',
      parameterCount: 1_236_000_000,
      fileSize: 600 * 1024 * 1024, // 600MB
      vocabSize: 32000,
      headCount: 32,
      layerCount: 22,
      fileType: 15,
      rawMetadata: {},
      ...overrides,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 9.5: Small model on capable device
  // ─────────────────────────────────────────────────────────────
  describe('checkGGUFBrowserCompat()', () => {
    it('should return canRun=true for small model on 8GB device', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });

      const metadata = createTestMetadata({ fileSize: 600 * 1024 * 1024 });
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.canRun).toBe(true);
      expect(compat.estimatedRAM).toBeCloseTo(600 * 1024 * 1024 * 1.2, -5);
    });

    it('should return canRun=false for oversized model', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });

      const metadata = createTestMetadata({ fileSize: 4 * 1024 * 1024 * 1024 }); // 4GB
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.canRun).toBe(false);
      expect(compat.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.6: Missing navigator.deviceMemory
  // ─────────────────────────────────────────────────────────────
  describe('Missing navigator.deviceMemory', () => {
    it('should fall back to 4GB assumption with warning', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });

      const metadata = createTestMetadata({ fileSize: 600 * 1024 * 1024 });
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.deviceRAM).toBeNull();
      expect(compat.deviceRAMHuman).toBe('unknown');
      expect(compat.warnings.some(w => w.includes('Device RAM could not be detected'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.7: CORS detection
  // ─────────────────────────────────────────────────────────────
  describe('CORS detection', () => {
    it('should report hasCORS=true when crossOriginIsolated is true', async () => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.hasCORS).toBe(true);
      expect(compat.estimatedSpeed).toContain('multi-thread');
    });

    it('should report hasCORS=false when crossOriginIsolated is false', async () => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, writable: true, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.hasCORS).toBe(false);
      expect(compat.estimatedSpeed).toContain('single-thread');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.8: Recommendations
  // ─────────────────────────────────────────────────────────────
  describe('Recommendations', () => {
    it('should recommend smaller quantization when RAM too low', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });

      const metadata = createTestMetadata({
        fileSize: 3 * 1024 * 1024 * 1024,
        quantization: 'Q8_0',
        parameterCount: 7_000_000_000,
      });
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.canRun).toBe(false);
      expect(compat.recommendations.some(r => r.includes('Q4_K_M'))).toBe(true);
    });

    it('should recommend smaller model for large parameter counts', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });

      const metadata = createTestMetadata({
        fileSize: 5 * 1024 * 1024 * 1024,
        parameterCount: 7_000_000_000,
      });
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.recommendations.some(r => r.includes('smaller model variant'))).toBe(true);
    });

    it('should recommend CORS headers when not isolated', async () => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, writable: true, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.recommendations.some(r => r.includes('Cross-Origin'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.9: checkGGUFBrowserCompatFromURL()
  // ─────────────────────────────────────────────────────────────
  describe('checkGGUFBrowserCompatFromURL()', () => {
    it('should combine parsing and compat check', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });

      const result = await checkGGUFBrowserCompatFromURL('https://huggingface.co/repo/model/resolve/main/model.gguf');

      // Should have compat fields
      expect(result).toHaveProperty('canRun');
      expect(result).toHaveProperty('estimatedRAM');
      expect(result).toHaveProperty('estimatedSpeed');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recommendations');

      // Should have metadata field
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.architecture).toBe('llama');
      expect(result.metadata.quantization).toBe('Q4_K_M');
    });

    it('should propagate AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        checkGGUFBrowserCompatFromURL('https://example.com/model.gguf', { abortSignal: controller.signal })
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9.10: Context length auto-detection
  // ─────────────────────────────────────────────────────────────
  describe('Context length auto-detection', () => {
    it('should use context length from GGUF metadata when not set in settings', async () => {
      const { WllamaLanguageModel } = await import('../src/model.js');
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });

      // Before loading, should be default
      expect(model.contextLength).toBe(4096);

      // After doGenerate triggers load, contextLength should be updated from GGUF metadata
      // The mocked gguf returns llama.context_length: 131072
      await model.doGenerate({ prompt: 'Hello' });
      expect(model.contextLength).toBe(131072);
    });

    it('should use explicit contextLength setting over auto-detection', async () => {
      const { WllamaLanguageModel } = await import('../src/model.js');
      const model = new WllamaLanguageModel('test-model', {
        modelUrl: 'https://example.com/test.gguf',
        contextLength: 2048,
      });

      expect(model.contextLength).toBe(2048);

      await model.doGenerate({ prompt: 'Hello' });

      // Should remain 2048, not changed by GGUF metadata
      expect(model.contextLength).toBe(2048);
    });
  });

  describe('GGUFBrowserCompat interface', () => {
    it('should have all required fields', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      // All required fields
      expect(typeof compat.canRun).toBe('boolean');
      expect(typeof compat.estimatedRAM).toBe('number');
      expect(typeof compat.estimatedRAMHuman).toBe('string');
      expect(compat.deviceRAM === null || typeof compat.deviceRAM === 'number').toBe(true);
      expect(typeof compat.deviceRAMHuman).toBe('string');
      expect(compat.availableStorage === null || typeof compat.availableStorage === 'number').toBe(true);
      expect(typeof compat.availableStorageHuman).toBe('string');
      expect(typeof compat.needsCORS).toBe('boolean');
      expect(typeof compat.hasCORS).toBe('boolean');
      expect(typeof compat.estimatedSpeed).toBe('string');
      expect(Array.isArray(compat.warnings)).toBe(true);
      expect(Array.isArray(compat.recommendations)).toBe(true);
    });

    it('should always have needsCORS=true', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      expect(compat.needsCORS).toBe(true);
    });

    it('should produce speed estimates as ranges', async () => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });

      const metadata = createTestMetadata();
      const compat = await checkGGUFBrowserCompat(metadata);

      // Speed should match pattern like "~N-N tok/s ..."
      expect(compat.estimatedSpeed).toMatch(/~\d+-\d+ tok\/s/);
    });
  });
});
