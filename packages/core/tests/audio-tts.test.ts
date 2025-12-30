/**
 * Audio TTS Domain Tests
 *
 * Tests for synthesizeSpeech() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  synthesizeSpeech,
  setGlobalTTSProvider,
} from '../src/audio/index.js';
import { createMockTextToSpeechModel } from '../src/testing/index.js';

describe('synthesizeSpeech()', () => {
  afterEach(() => {
    setGlobalTTSProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should synthesize speech from text', async () => {
    const model = createMockTextToSpeechModel();

    const result = await synthesizeSpeech({
      model,
      text: 'Hello world',
    });

    expect(result.audio).toBeInstanceOf(Blob);
    expect(result.audio.size).toBeGreaterThan(0);
    expect(result.sampleRate).toBe(model.sampleRate);
    expect(result.usage.characterCount).toBe(11); // "Hello world"
  });

  it('should support speaker option', async () => {
    const model = createMockTextToSpeechModel();

    const result = await synthesizeSpeech({
      model,
      text: 'Test',
      speaker: 'speaker-1',
    });

    expect(result.audio).toBeInstanceOf(Blob);
  });

  it('should support speed option', async () => {
    const model = createMockTextToSpeechModel();

    const result = await synthesizeSpeech({
      model,
      text: 'Test',
      speed: 1.5,
    });

    expect(result.audio).toBeInstanceOf(Blob);
  });

  it('should support abort signal', async () => {
    const model = createMockTextToSpeechModel({ delay: 100 });
    const controller = new AbortController();

    const promise = synthesizeSpeech({
      model,
      text: 'Test',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalTTSProvider(() => createMockTextToSpeechModel());

    const result = await synthesizeSpeech({
      model: 'test-model' as any,
      text: 'Hello',
    });

    expect(result.audio).toBeInstanceOf(Blob);
  });

  it('should include usage information', async () => {
    const model = createMockTextToSpeechModel();

    const result = await synthesizeSpeech({
      model,
      text: 'A longer sentence for testing.',
    });

    expect(result.usage.characterCount).toBe(30);
    expect(result.usage.durationMs).toBeGreaterThan(0);
  });
});

