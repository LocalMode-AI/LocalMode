import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockSpeechToTextModel, createMockTextToSpeechModel } from '@localmode/core';
import { useTranscribe } from '../src/hooks/use-transcribe.js';
import { useSynthesizeSpeech } from '../src/hooks/use-synthesize-speech.js';

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
});
