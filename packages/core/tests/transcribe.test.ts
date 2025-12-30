/**
 * Transcription Tests
 *
 * Tests for the transcribe() function.
 */

import { describe, it, expect, vi } from 'vitest';
import { transcribe, type SpeechToTextModel } from '../src/audio/index.js';

describe('Transcription Functions', () => {
  describe('transcribe()', () => {
    it('should transcribe audio to text', async () => {
      const mockAudio = new Float32Array(16000); // 1 second at 16kHz

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Hello world',
          language: 'en',
          usage: { audioDurationSec: 1.0, durationMs: 500 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: mockAudio,
      });

      expect(result.text).toBe('Hello world');
      expect(result.language).toBe('en');
      expect(result.usage.audioDurationSec).toBe(1.0);
      expect(result.response.modelId).toBe('test-stt');
    });

    it('should return segments with timestamps', async () => {
      const mockAudio = new Float32Array(32000); // 2 seconds

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Hello world. How are you?',
          segments: [
            { text: 'Hello world.', start: 0.0, end: 1.0 },
            { text: 'How are you?', start: 1.0, end: 2.0 },
          ],
          language: 'en',
          usage: { audioDurationSec: 2.0, durationMs: 800 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: mockAudio,
        returnTimestamps: true,
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments?.[0]).toMatchObject({
        text: 'Hello world.',
        start: 0.0,
        end: 1.0,
      });
      expect(result.segments?.[1]).toMatchObject({
        text: 'How are you?',
        start: 1.0,
        end: 2.0,
      });
    });

    it('should handle Blob audio input', async () => {
      const mockBlob = new Blob([new ArrayBuffer(16000 * 4)], {
        type: 'audio/wav',
      });

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Test transcription',
          usage: { audioDurationSec: 1.0, durationMs: 400 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: mockBlob,
      });

      expect(result.text).toBe('Test transcription');
    });

    it('should handle ArrayBuffer audio input', async () => {
      const mockBuffer = new ArrayBuffer(16000 * 4);

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Test transcription',
          usage: { audioDurationSec: 1.0, durationMs: 350 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: mockBuffer,
      });

      expect(result.text).toBe('Test transcription');
    });

    it('should pass language parameter', async () => {
      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Bonjour le monde',
          language: 'fr',
          usage: { audioDurationSec: 1.0, durationMs: 400 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: new Float32Array(16000),
        language: 'fr',
      });

      expect(mockModel.doTranscribe).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' })
      );
      expect(result.language).toBe('fr');
    });

    it('should support translate task', async () => {
      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Hello world', // Translated to English
          language: 'fr', // Original language detected
          usage: { audioDurationSec: 1.0, durationMs: 450 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: new Float32Array(16000),
        task: 'translate',
      });

      expect(mockModel.doTranscribe).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'translate' })
      );
      expect(result.text).toBe('Hello world');
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn(),
      };

      await expect(
        transcribe({
          model: mockModel,
          audio: new Float32Array(16000),
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoTranscribe = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          text: 'Retry successful',
          usage: { audioDurationSec: 1.0, durationMs: 400 },
        });

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: mockDoTranscribe,
      };

      const result = await transcribe({
        model: mockModel,
        audio: new Float32Array(16000),
        maxRetries: 2,
      });

      expect(result.text).toBe('Retry successful');
      expect(mockDoTranscribe).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        transcribe({
          model: mockModel,
          audio: new Float32Array(16000),
          maxRetries: 2,
        })
      ).rejects.toThrow('Transcription failed after 3 attempts');
    });

    it('should track timestamps in response', async () => {
      const beforeTime = new Date();

      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Test',
          usage: { audioDurationSec: 1.0, durationMs: 100 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: new Float32Array(16000),
      });

      const afterTime = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle word-level timestamps', async () => {
      const mockModel: SpeechToTextModel = {
        modelId: 'test-stt',
        provider: 'test',
        doTranscribe: vi.fn().mockResolvedValue({
          text: 'Hello world',
          segments: [
            { text: 'Hello', start: 0.0, end: 0.5 },
            { text: 'world', start: 0.5, end: 1.0 },
          ],
          usage: { audioDurationSec: 1.0, durationMs: 400 },
        }),
      };

      const result = await transcribe({
        model: mockModel,
        audio: new Float32Array(16000),
        returnTimestamps: 'word',
      });

      expect(mockModel.doTranscribe).toHaveBeenCalledWith(
        expect.objectContaining({ returnTimestamps: 'word' })
      );
      expect(result.segments).toHaveLength(2);
    });
  });
});

