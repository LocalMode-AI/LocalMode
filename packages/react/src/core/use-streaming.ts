/**
 * @file use-streaming.ts
 * @description Base hook for streaming async generator operations with chunk accumulation
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Options for configuring useStreaming */
interface UseStreamingConfig {
  /** Function that returns an async generator of string chunks */
  fn: (input: string, signal: AbortSignal) => AsyncGenerator<string, void, unknown>;
}

/** Return type from useStreaming */
interface UseStreamingReturn {
  content: string;
  isStreaming: boolean;
  error: Error | null;
  send: (input: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * Base hook for streaming async generator operations.
 * Manages content accumulation, streaming state, and abort support.
 *
 * @internal Not exported from the public API
 */
export function useStreaming(config: UseStreamingConfig): UseStreamingReturn {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fnRef = useRef(config.fn);
  fnRef.current = config.fn;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const send = useCallback(async (input: string): Promise<void> => {
    if (IS_SERVER) return;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setContent('');
    setError(null);
    setIsStreaming(true);

    try {
      const generator = fnRef.current(input, controller.signal);

      for await (const chunk of generator) {
        if (!mountedRef.current || controller.signal.aborted) break;
        setContent((prev) => prev + chunk);
      }

      if (mountedRef.current) {
        setIsStreaming(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      // Abort errors are silent — preserve partial content
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        setIsStreaming(false);
        return;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsStreaming(false);
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setContent('');
    setError(null);
    setIsStreaming(false);
  }, []);

  if (IS_SERVER) {
    return {
      content: '',
      isStreaming: false,
      error: null,
      send: async () => {},
      cancel: () => {},
      reset: () => {},
    };
  }

  return { content, isStreaming, error, send, cancel, reset };
}
