import { describe, it, expect } from 'vitest';
import {
  classifyAudio,
  classifyAudioZeroShot,
  setGlobalAudioClassificationProvider,
  createMockAudioClassificationModel,
} from '../src/index.js';

describe('classifyAudio()', () => {
  it('returns { predictions, usage, response }', async () => {
    const model = createMockAudioClassificationModel();
    const audio = new Float32Array(16000); // 1 second of silence at 16kHz

    const result = await classifyAudio({ model, audio });

    expect(result.predictions).toBeInstanceOf(Array);
    expect(result.predictions.length).toBeGreaterThan(0);
    expect(result.predictions[0]).toHaveProperty('label');
    expect(result.predictions[0]).toHaveProperty('score');
    expect(result.usage).toHaveProperty('durationMs');
    expect(result.response).toHaveProperty('modelId');
    expect(result.response).toHaveProperty('timestamp');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('respects topK option', async () => {
    const model = createMockAudioClassificationModel({
      labels: ['speech', 'music', 'noise', 'silence', 'other'],
    });
    const audio = new Float32Array(16000);

    const result = await classifyAudio({ model, audio, topK: 2 });

    expect(result.predictions.length).toBeLessThanOrEqual(2);
  });

  it('supports AbortSignal', async () => {
    const model = createMockAudioClassificationModel();
    const audio = new Float32Array(16000);
    const controller = new AbortController();
    controller.abort();

    await expect(
      classifyAudio({ model, audio, abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('retries on transient failure', async () => {
    let callCount = 0;

    const model = {
      modelId: 'test:flaky',
      provider: 'test',
      async doClassify(options: { audio: unknown[]; topK?: number; abortSignal?: AbortSignal }) {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient failure');
        }
        return {
          results: [
            [
              { label: 'speech', score: 0.9 },
              { label: 'music', score: 0.1 },
            ],
          ],
          usage: { durationMs: 10 },
        };
      },
    };

    const result = await classifyAudio({ model, audio: new Float32Array(100) });
    expect(result.predictions[0].label).toBe('speech');
    expect(callCount).toBe(2);
  });

  it('throws after max retries exhausted', async () => {
    const model = {
      modelId: 'test:always-fails',
      provider: 'test',
      async doClassify() {
        throw new Error('Persistent failure');
      },
    };

    await expect(
      classifyAudio({ model, audio: new Float32Array(100), maxRetries: 1 })
    ).rejects.toThrow('Audio classification failed after 2 attempts');
  });

  it('throws when using string model ID without global provider', async () => {
    // Reset any existing provider
    setGlobalAudioClassificationProvider({} as never);

    await expect(
      classifyAudio({ model: 'test:some-model', audio: new Float32Array(100) })
    ).rejects.toThrow();
  });
});

describe('classifyAudioZeroShot()', () => {
  it('returns { labels, scores, usage, response }', async () => {
    const model = {
      modelId: 'mock:zero-shot-audio',
      provider: 'mock',
      async doClassifyZeroShot(options: {
        audio: unknown[];
        candidateLabels: string[];
        abortSignal?: AbortSignal;
      }) {
        return {
          results: [
            {
              labels: options.candidateLabels.slice().sort(),
              scores: options.candidateLabels.map((_, i) => 1 / (i + 1)),
            },
          ],
          usage: { durationMs: 5 },
        };
      },
    };

    const result = await classifyAudioZeroShot({
      model,
      audio: new Float32Array(16000),
      candidateLabels: ['music', 'speech', 'noise'],
    });

    expect(result.labels).toBeInstanceOf(Array);
    expect(result.scores).toBeInstanceOf(Array);
    expect(result.labels.length).toBe(result.scores.length);
    expect(result.usage).toHaveProperty('durationMs');
    expect(result.response).toHaveProperty('modelId');
    expect(result.response.modelId).toBe('mock:zero-shot-audio');
  });

  it('supports AbortSignal', async () => {
    const model = {
      modelId: 'mock:zero-shot-audio',
      provider: 'mock',
      async doClassifyZeroShot() {
        return { results: [{ labels: [], scores: [] }], usage: { durationMs: 0 } };
      },
    };

    const controller = new AbortController();
    controller.abort();

    await expect(
      classifyAudioZeroShot({
        model,
        audio: new Float32Array(100),
        candidateLabels: ['a'],
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});
