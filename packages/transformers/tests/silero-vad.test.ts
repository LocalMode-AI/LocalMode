/**
 * Silero VAD Tests
 *
 * Verifies the silero-vad factory shape, the VADProvider contract, and the
 * lazy warm-up semantics. The actual ONNX session is mocked so the tests
 * do not depend on the model file being downloaded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @huggingface/transformers package's AutoModel + Tensor.
vi.mock('@huggingface/transformers', () => {
  class MockTensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[]
    ) {}
  }

  // Fake session that returns a fixed probability and identity hidden state.
  const fakeSession = vi.fn(async () => ({
    output: { data: new Float32Array([0.9]) }, // always "speech"
    hn: { data: new Float32Array(2 * 64) },
    cn: { data: new Float32Array(2 * 64) },
  }));

  return {
    AutoModel: {
      from_pretrained: vi.fn(async () => fakeSession),
    },
    Tensor: MockTensor,
    env: { backends: { onnx: { logLevel: 'error' } } },
  };
});

import { transformers } from '../src/index.js';
import { TransformersSileroVAD } from '../src/implementations/silero-vad.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transformers.vad()', () => {
  it('returns a VADProvider with correct shape', () => {
    const vad = transformers.vad('onnx-community/silero-vad');
    expect(vad.provider).toBe('transformers');
    expect(vad.frameSize).toBe(512);
    expect(vad.sampleRate).toBe(16000);
    expect(typeof vad.start).toBe('function');
    expect(typeof vad.processFrame).toBe('function');
    expect(typeof vad.stop).toBe('function');
    expect(typeof vad.dispose).toBe('function');
  });

  it('warmUp() loads the ONNX session and isReady() reflects state', async () => {
    const vad = new TransformersSileroVAD('onnx-community/silero-vad');
    expect(vad.isReady()).toBe(false);

    await vad.warmUp();
    expect(vad.isReady()).toBe(true);

    // Idempotent
    await vad.warmUp();
    expect(vad.isReady()).toBe(true);
  });

  it('start() warms up and accepts processFrame', async () => {
    const vad = new TransformersSileroVAD('onnx-community/silero-vad', {
      threshold: 0.5,
    });
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();

    await vad.start({ onSpeechStart, onSpeechEnd });
    expect(vad.isReady()).toBe(true);

    // Push a frame; the mocked session returns probability 0.9 (>= 0.5)
    vad.processFrame(new Float32Array(512));

    // Allow microtasks for the async inference path.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onSpeechStart).toHaveBeenCalled();
    await vad.dispose();
  });

  it('dispose() releases state and is idempotent', async () => {
    const vad = new TransformersSileroVAD('onnx-community/silero-vad');
    await vad.warmUp();
    await vad.dispose();
    expect(vad.isReady()).toBe(false);
    await expect(vad.dispose()).resolves.toBeUndefined();
  });
});
