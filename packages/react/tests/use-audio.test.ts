import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockSpeechToTextModel, createMockTextToSpeechModel } from '@localmode/core';
import type {
  DoSynthesizeOptions,
  DoTranscribeOptions,
  SpeechToTextModel,
  TextToSpeechModel,
} from '@localmode/core';
import { useTranscribe } from '../src/hooks/use-transcribe.js';
import { useSynthesizeSpeech } from '../src/hooks/use-synthesize-speech.js';

// BOUNDARY NOTE: jsdom has no microphone/speakers and these models are mocks,
// which is the correct layer-below boundary for a hook unit test — the
// assertions are on the exact DoSynthesize/DoTranscribe options the hooks
// route through the REAL core synthesizeSpeech()/transcribe() functions.
// Actual model quality must be verified in a browser with a real provider.

/** TTS model that records every doSynthesize() call it receives. */
function makeRecordingTTS() {
  const calls: DoSynthesizeOptions[] = [];
  const model: TextToSpeechModel = {
    modelId: 'mock:tts-recording',
    provider: 'mock',
    async doSynthesize(o) {
      calls.push(o);
      return {
        audio: new Blob([new Float32Array(8).buffer], { type: 'audio/wav' }),
        sampleRate: 16000,
        usage: { characterCount: o.text.length, durationMs: 1 },
      };
    },
  };
  return { model, calls };
}

/** STT model that records every doTranscribe() call it receives. */
function makeRecordingSTT() {
  const calls: DoTranscribeOptions[] = [];
  const model: SpeechToTextModel = {
    modelId: 'mock:stt-recording',
    provider: 'mock',
    async doTranscribe(o) {
      calls.push(o);
      return {
        text: 'recorded',
        language: o.language,
        usage: { audioDurationSec: 1, durationMs: 1 },
      };
    },
  };
  return { model, calls };
}

describe('useTranscribe', () => {
  it('transcribes audio', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'Hello world' });
    const { result } = renderHook(() => useTranscribe({ model }));

    const audioBlob = new Blob(['fake audio'], { type: 'audio/wav' });

    await act(async () => {
      await result.current.execute(audioBlob);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.text).toBe('Hello world');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles cancellation', () => {
    const model = createMockSpeechToTextModel({ delay: 5000 });
    const { result } = renderHook(() => useTranscribe({ model }));

    act(() => {
      result.current.execute(new Blob(['audio']));
    });

    act(() => {
      result.current.cancel();
    });

    // Cancel should not set error
    expect(result.current.error).toBeNull();
  });

  it('forwards hook-level language/task/returnTimestamps to the model', async () => {
    const { model, calls } = makeRecordingSTT();
    const { result } = renderHook(() =>
      useTranscribe({ model, language: 'de', task: 'translate', returnTimestamps: 'word' })
    );

    await act(async () => {
      await result.current.execute(new Blob(['audio']));
    });

    expect(calls.length).toBe(1);
    expect(calls[0].language).toBe('de');
    expect(calls[0].task).toBe('translate');
    expect(calls[0].returnTimestamps).toBe('word');
    // Without per-call options, the AbortSignal must still land correctly.
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('per-call execute options override hook-level options', async () => {
    const { model, calls } = makeRecordingSTT();
    const { result } = renderHook(() =>
      useTranscribe({ model, language: 'de', task: 'transcribe' })
    );

    await act(async () => {
      await result.current.execute(new Blob(['audio']), {
        language: 'fr',
        returnTimestamps: true,
      });
    });

    expect(calls.length).toBe(1);
    expect(calls[0].language).toBe('fr'); // per-call wins
    expect(calls[0].task).toBe('transcribe'); // hook-level fallback
    expect(calls[0].returnTimestamps).toBe(true);
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('passes segments through data when returnTimestamps is requested', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'one two three' });
    const { result } = renderHook(() => useTranscribe({ model, returnTimestamps: true }));

    await act(async () => {
      await result.current.execute(new Blob(['audio']));
    });

    expect(result.current.data?.segments).toBeDefined();
    expect(result.current.data?.segments?.length).toBe(3);
    expect(result.current.data?.segments?.[0].text).toBe('one');
    expect(typeof result.current.data?.segments?.[0].start).toBe('number');
    expect(typeof result.current.data?.segments?.[0].end).toBe('number');
  });
});

describe('useSynthesizeSpeech', () => {
  it('synthesizes speech', async () => {
    const model = createMockTextToSpeechModel();
    const { result } = renderHook(() => useSynthesizeSpeech({ model }));

    await act(async () => {
      await result.current.execute('Hello world');
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.audio).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('forwards hook-level voice/speed/pitch to the model', async () => {
    const { model, calls } = makeRecordingTTS();
    const { result } = renderHook(() =>
      useSynthesizeSpeech({ model, voice: 'af_heart', speed: 1.25, pitch: 0.5 })
    );

    await act(async () => {
      await result.current.execute('Hello');
    });

    expect(calls.length).toBe(1);
    expect(calls[0].text).toBe('Hello');
    expect(calls[0].voice).toBe('af_heart');
    expect(calls[0].speed).toBe(1.25);
    expect(calls[0].pitch).toBe(0.5);
    // Without per-call options, the AbortSignal must still land correctly.
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('per-call execute options override hook-level options', async () => {
    const { model, calls } = makeRecordingTTS();
    const { result } = renderHook(() =>
      useSynthesizeSpeech({ model, voice: 'af_heart', speed: 1.0 })
    );

    await act(async () => {
      await result.current.execute('Bonjour', { voice: 'bf_emma', pitch: -0.2 });
    });

    expect(calls.length).toBe(1);
    expect(calls[0].voice).toBe('bf_emma'); // per-call wins
    expect(calls[0].speed).toBe(1.0); // hook-level fallback
    expect(calls[0].pitch).toBe(-0.2);
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('leaves voice/speed/pitch undefined when neither level sets them', async () => {
    const { model, calls } = makeRecordingTTS();
    const { result } = renderHook(() => useSynthesizeSpeech({ model }));

    await act(async () => {
      await result.current.execute('Plain');
    });

    expect(calls[0].voice).toBeUndefined();
    expect(calls[0].speed).toBeUndefined();
    expect(calls[0].pitch).toBeUndefined();
  });
});
