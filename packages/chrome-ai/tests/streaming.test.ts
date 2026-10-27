/**
 * @file streaming.test.ts
 * @description Streaming, input quota and model info for the Chrome AI summarizer and
 * translator, against fakes of Chrome's `Summarizer` / `Translator` globals that hand out
 * real `ReadableStream<string>` instances.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChromeAISummarizer } from '../src/implementations/summarizer.js';
import { ChromeAITranslator } from '../src/implementations/translator.js';
import { getChromeBuildInfo } from '../src/utils.js';
import type { ChromeAIStreamChunk } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * A ReadableStream that enqueues `parts` one per macrotask and errors with an
 * `AbortError` DOMException when `signal` aborts, as Chrome does.
 */
function fakeTextStream(parts: string[], signal?: AbortSignal, delayMs = 2): ReadableStream<string> {
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<string>({
    start(controller) {
      signal?.addEventListener('abort', () => {
        if (timer !== undefined) clearTimeout(timer);
        try {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        } catch {
          /* already closed */
        }
      });
    },
    pull(controller) {
      return new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timer = undefined;
          if (signal?.aborted) return resolve();
          if (i < parts.length) controller.enqueue(parts[i++]);
          else controller.close();
          resolve();
        }, delayMs);
      });
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
    },
  });
}

interface FakeState {
  availability: string;
  createCalls: Record<string, unknown>[];
  streamCalls: { text: string; options?: Record<string, unknown> }[];
  measureCalls: { text: string; options?: Record<string, unknown> }[];
  parts: string[];
  destroyed: number;
}

function installSummarizer(state: FakeState, opts: { withStreaming?: boolean; withQuota?: boolean } = {}) {
  const { withStreaming = true, withQuota = true } = opts;
  const factory = {
    availability: vi.fn(async () => state.availability),
    create: vi.fn(async (options: Record<string, unknown>) => {
      state.createCalls.push(options);
      const session: Record<string, unknown> = {
        // Chrome's Summarizer session reflects its create() options as attributes.
        type: options.type,
        format: options.format,
        length: options.length,
        sharedContext: options.sharedContext ?? '',
        // Chrome reflects the language options as attributes (null when not given).
        expectedInputLanguages: options.expectedInputLanguages ?? null,
        expectedContextLanguages: options.expectedContextLanguages ?? null,
        outputLanguage: options.outputLanguage ?? null,
        summarize: vi.fn(async () => state.parts.join('')),
        destroy: vi.fn(() => {
          state.destroyed++;
        }),
      };
      if (withStreaming) {
        session.summarizeStreaming = vi.fn((text: string, o?: { signal?: AbortSignal; context?: string }) => {
          state.streamCalls.push({ text, options: o as Record<string, unknown> });
          return fakeTextStream(state.parts, o?.signal);
        });
      }
      if (withQuota) {
        session.inputQuota = 4096;
        session.measureInputUsage = vi.fn(async (text: string, o?: Record<string, unknown>) => {
          state.measureCalls.push({ text, options: o });
          return Math.ceil(text.length / 4);
        });
      }
      return session;
    }),
  };
  vi.stubGlobal('self', { Summarizer: factory });
  return factory;
}

function installTranslator(state: FakeState, opts: { withStreaming?: boolean } = {}) {
  const { withStreaming = true } = opts;
  const factory = {
    availability: vi.fn(async () => state.availability),
    create: vi.fn(async (options: Record<string, unknown>) => {
      state.createCalls.push(options);
      const session: Record<string, unknown> = {
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
        inputQuota: Infinity,
        measureInputUsage: vi.fn(async (text: string, o?: Record<string, unknown>) => {
          state.measureCalls.push({ text, options: o });
          return text.length;
        }),
        translate: vi.fn(async () => state.parts.join('')),
        destroy: vi.fn(() => {
          state.destroyed++;
        }),
      };
      if (withStreaming) {
        session.translateStreaming = vi.fn((text: string, o?: { signal?: AbortSignal }) => {
          state.streamCalls.push({ text, options: o as Record<string, unknown> });
          return fakeTextStream(state.parts, o?.signal);
        });
      }
      return session;
    }),
  };
  vi.stubGlobal('self', { Translator: factory });
  return factory;
}

function newState(parts: string[], availability = 'available'): FakeState {
  return { availability, createCalls: [], streamCalls: [], measureCalls: [], parts, destroyed: 0 };
}

async function collect(iter: AsyncIterable<ChromeAIStreamChunk>): Promise<ChromeAIStreamChunk[]> {
  const out: ChromeAIStreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

const fakeNavigator = {
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/156.0.0.0 Safari/537.36',
  userAgentData: {
    brands: [
      { brand: 'Google Chrome', version: '156' },
      { brand: 'Chromium', version: '156' },
      { brand: 'Not.A/Brand', version: '99' },
    ],
    mobile: false,
    platform: 'macOS',
    getHighEntropyValues: vi.fn(async (hints: string[]) => ({
      brands: fakeNavigator.userAgentData.brands,
      mobile: false,
      platform: 'macOS',
      ...(hints.includes('fullVersionList')
        ? {
            fullVersionList: [
              { brand: 'Google Chrome', version: '156.0.8078.48' },
              { brand: 'Chromium', version: '156.0.8078.48' },
              { brand: 'Not.A/Brand', version: '99.0.0.0' },
            ],
          }
        : {}),
      ...(hints.includes('platformVersion') ? { platformVersion: '26.3.0' } : {}),
      ...(hints.includes('architecture') ? { architecture: 'arm' } : {}),
    })),
  },
};

beforeEach(() => {
  vi.stubGlobal('navigator', fakeNavigator);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

describe('ChromeAISummarizer.doStreamSummarize()', () => {
  it('yields each Chrome chunk with a performance.now() stamp, then a final timing chunk', async () => {
    const state = newState(['The cat ', 'sat on ', 'the mat.']);
    installSummarizer(state);
    const model = new ChromeAISummarizer({ type: 'tldr', length: 'short' });

    const before = performance.now();
    const chunks = await collect(model.doStreamSummarize({ text: 'A long article about a cat.' }));
    const after = performance.now();

    const deltas = chunks.filter((c) => !c.done);
    expect(deltas.map((c) => c.text)).toEqual(['The cat ', 'sat on ', 'the mat.']);
    const final = chunks[chunks.length - 1];
    expect(chunks.filter((c) => c.done)).toHaveLength(1);
    expect(final.done).toBe(true);
    expect(final.text).toBe('');

    // Stamps are monotonic and bracketed by the request and the end.
    const timing = final.timing!;
    expect(timing.requestedAt).toBeGreaterThanOrEqual(before);
    expect(timing.endedAt).toBeLessThanOrEqual(after);
    expect(timing.firstChunkAt).toBe(deltas[0].timestamp);
    let prev = timing.requestedAt;
    for (const c of deltas) {
      expect(c.timestamp).toBeGreaterThanOrEqual(prev);
      prev = c.timestamp;
    }
    expect(timing.endedAt).toBeGreaterThanOrEqual(prev);
    expect(final.timestamp).toBe(timing.endedAt);
    expect(timing.chunkCount).toBe(3);
    expect(timing.chars).toBe('The cat sat on the mat.'.length);
    expect(final.usage!.durationMs).toBeCloseTo(timing.endedAt - timing.requestedAt, 6);
    expect(final.usage!.outputTokens).toBeGreaterThan(0);
    expect(final.usage!.inputTokens).toBeGreaterThan(0);

    // The request reached Chrome's summarizeStreaming() with the text.
    expect(state.streamCalls).toHaveLength(1);
    expect(state.streamCalls[0].text).toBe('A long article about a cat.');
  });

  it('forwards per-call context and the abort signal to summarizeStreaming()', async () => {
    const state = newState(['ok']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();
    const controller = new AbortController();

    await collect(
      model.doStreamSummarize({ text: 'x', context: 'For a newsletter.', abortSignal: controller.signal })
    );

    expect(state.streamCalls[0].options).toMatchObject({ context: 'For a newsletter.' });
    expect(state.streamCalls[0].options?.signal).toBe(controller.signal);
  });

  it('reports firstChunkAt null and zero chunks for an empty stream', async () => {
    const state = newState([]);
    installSummarizer(state);
    const model = new ChromeAISummarizer();

    const chunks = await collect(model.doStreamSummarize({ text: 'x' }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].done).toBe(true);
    expect(chunks[0].timing!.firstChunkAt).toBeNull();
    expect(chunks[0].timing!.chunkCount).toBe(0);
  });

  it('applies maxLength and providerOptions like doSummarize()', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();

    await collect(
      model.doStreamSummarize({ text: 'x', maxLength: 40, providerOptions: { chromeAI: { type: 'headline' } } })
    );
    expect(state.createCalls[state.createCalls.length - 1]).toMatchObject({
      type: 'headline',
      length: 'short',
    });
  });

  it('surfaces an abort mid-stream as an AbortError and stops reading', async () => {
    const state = newState(['one ', 'two ', 'three ', 'four']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();
    const controller = new AbortController();

    const seen: string[] = [];
    const run = (async () => {
      for await (const c of model.doStreamSummarize({ text: 'x', abortSignal: controller.signal })) {
        if (!c.done) {
          seen.push(c.text);
          if (seen.length === 1) controller.abort();
        }
      }
    })();

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toEqual(['one ']);
  });

  it('throws before starting when the signal is already aborted', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();
    const controller = new AbortController();
    controller.abort();

    await expect(
      collect(model.doStreamSummarize({ text: 'x', abortSignal: controller.signal }))
    ).rejects.toThrow();
    expect(state.createCalls).toHaveLength(0);
  });

  it('wraps a Chrome stream failure in a SummarizationError with the cause', async () => {
    const state = newState([]);
    const factory = installSummarizer(state);
    factory.create.mockImplementationOnce(async () => ({
      summarize: vi.fn(),
      destroy: vi.fn(),
      summarizeStreaming: () =>
        new ReadableStream<string>({
          start(c) {
            c.error(new DOMException('Input too large', 'QuotaExceededError'));
          },
        }),
    }));
    const model = new ChromeAISummarizer();

    const err = await collect(model.doStreamSummarize({ text: 'x' })).catch((e) => e);
    expect(err.name).toBe('SummarizationError');
    expect(err.message).toContain('QuotaExceededError');
    expect(err.cause.name).toBe('QuotaExceededError');
  });

  it('throws a non-retryable SummarizationError when the session has no summarizeStreaming()', async () => {
    const state = newState(['a']);
    installSummarizer(state, { withStreaming: false });
    const model = new ChromeAISummarizer();

    const err = await collect(model.doStreamSummarize({ text: 'x' })).catch((e) => e);
    expect(err.name).toBe('SummarizationError');
    expect(err.code).toBe('chrome-ai-streaming-not-supported');
    expect(err.retryable).toBe(false);
  });

  it('keeps the availability gate: downloadable without allowDownload throws', async () => {
    const state = newState(['a'], 'downloadable');
    installSummarizer(state);
    const model = new ChromeAISummarizer();

    await expect(collect(model.doStreamSummarize({ text: 'x' }))).rejects.toThrow(/downloaded/);
    expect(state.createCalls).toHaveLength(0);
  });
});

describe('ChromeAISummarizer per-call providerOptions', () => {
  it('applies a length-only providerOptions override', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer({ length: 'medium' });

    await model.doSummarize({ texts: ['x'], providerOptions: { chromeAI: { length: 'long' } } });
    expect(state.createCalls[state.createCalls.length - 1]).toMatchObject({ length: 'long' });
  });

  it('keeps the session when repeated providerOptions do not change it', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();
    const providerOptions = { chromeAI: { type: 'key-points', length: 'short' } };

    await model.doSummarize({ texts: ['x'], providerOptions });
    await model.doSummarize({ texts: ['y'], providerOptions });
    await model.doSummarize({ texts: ['z'], providerOptions });
    expect(state.createCalls).toHaveLength(1);
    expect(state.destroyed).toBe(0);
  });
});

describe('ChromeAISummarizer language options', () => {
  it('passes outputLanguage, expectedInputLanguages and expectedContextLanguages to availability() and create()', async () => {
    const state = newState(['a']);
    const factory = installSummarizer(state);
    const model = new ChromeAISummarizer({
      outputLanguage: 'en',
      expectedInputLanguages: ['en', 'de'],
      expectedContextLanguages: ['en'],
    });

    await model.doSummarize({ texts: ['x'] });
    const langs = { outputLanguage: 'en', expectedInputLanguages: ['en', 'de'], expectedContextLanguages: ['en'] };
    expect(state.createCalls[0]).toMatchObject(langs);
    expect(factory.availability).toHaveBeenCalledWith(expect.objectContaining(langs));
  });

  it('leaves the language keys out of create() when unset', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    await new ChromeAISummarizer().doSummarize({ texts: ['x'] });
    expect(state.createCalls[0]).not.toHaveProperty('outputLanguage');
    expect(state.createCalls[0]).not.toHaveProperty('expectedInputLanguages');
    expect(state.createCalls[0]).not.toHaveProperty('expectedContextLanguages');
  });

  it('getModelInfo() records the language options as requested and as the session echoes them', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer({ outputLanguage: 'de', expectedInputLanguages: ['en'] });

    const info = await model.getModelInfo();
    expect(info.requestedOptions).toMatchObject({
      outputLanguage: 'de',
      expectedInputLanguages: ['en'],
      expectedContextLanguages: undefined,
    });
    expect(info.sessionOptions).toMatchObject({
      outputLanguage: 'de',
      expectedInputLanguages: ['en'],
      expectedContextLanguages: null,
    });
  });

  it('recreates the session when providerOptions change outputLanguage', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer({ outputLanguage: 'en' });

    await model.doSummarize({ texts: ['x'] });
    await model.doSummarize({ texts: ['x'], providerOptions: { chromeAI: { outputLanguage: 'es' } } });
    expect(state.createCalls).toHaveLength(2);
    expect(state.createCalls[1]).toMatchObject({ outputLanguage: 'es' });
  });
});

describe('ChromeAISummarizer input quota', () => {
  it('measureInputUsage() forwards text and context to the session', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer();

    const usage = await model.measureInputUsage('abcdefgh', { context: 'ctx' });
    expect(usage).toBe(2);
    expect(state.measureCalls[0].text).toBe('abcdefgh');
    expect(state.measureCalls[0].options).toMatchObject({ context: 'ctx' });
  });

  it('getInputQuota() returns the session inputQuota', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    expect(await new ChromeAISummarizer().getInputQuota()).toBe(4096);
  });

  it('returns null quota and throws a coded error for measureInputUsage() where Chrome exposes neither', async () => {
    const state = newState(['a']);
    installSummarizer(state, { withQuota: false });
    const model = new ChromeAISummarizer();

    expect(await model.getInputQuota()).toBeNull();
    const err = await model.measureInputUsage('x').catch((e) => e);
    expect(err.name).toBe('SummarizationError');
    expect(err.code).toBe('chrome-ai-measure-not-supported');
    expect(err.retryable).toBe(false);
  });
});

describe('ChromeAISummarizer.getModelInfo()', () => {
  it('captures availability at creation, echoed options, quota and the Chrome build', async () => {
    const state = newState(['a']);
    installSummarizer(state);
    const model = new ChromeAISummarizer({ type: 'key-points', format: 'markdown', length: 'long' });

    const info = await model.getModelInfo();
    expect(info.api).toBe('Summarizer');
    expect(info.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(info.availabilityAtCreate).toBe('available');
    expect(info.requestedOptions).toMatchObject({ type: 'key-points', format: 'markdown', length: 'long' });
    expect(info.sessionOptions).toMatchObject({ type: 'key-points', format: 'markdown', length: 'long' });
    expect(info.inputQuota).toBe(4096);
    expect(info.modelVersion).toBeNull();
    expect(info.browser.fullVersionList).toEqual([
      { brand: 'Google Chrome', version: '156.0.8078.48' },
      { brand: 'Chromium', version: '156.0.8078.48' },
      { brand: 'Not.A/Brand', version: '99.0.0.0' },
    ]);
    expect(info.browser.brands).toHaveLength(3);
  });

  it('records the availability Chrome reported before a download was started', async () => {
    const state = newState(['a'], 'downloadable');
    installSummarizer(state);
    const model = new ChromeAISummarizer({ allowDownload: true });

    const info = await model.getModelInfo();
    expect(info.availabilityAtCreate).toBe('downloadable');
  });

  it("records 'timeout' when availability() never settles", async () => {
    vi.useFakeTimers();
    try {
      const state = newState(['a']);
      const factory = installSummarizer(state);
      factory.availability.mockImplementation(() => new Promise(() => {}));
      const model = new ChromeAISummarizer();
      const p = model.getModelInfo();
      await vi.advanceTimersByTimeAsync(3100);
      const info = await p;
      expect(info.availabilityAtCreate).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

describe('ChromeAITranslator.doStreamTranslate()', () => {
  it('yields timed chunks from translateStreaming() for the requested pair', async () => {
    const state = newState(['Das Wetter ', 'ist schön.']);
    installTranslator(state);
    const model = new ChromeAITranslator({ sourceLanguage: 'en', targetLanguage: 'es' });

    const chunks = await collect(
      model.doStreamTranslate({ text: 'The weather is nice.', sourceLanguage: 'en', targetLanguage: 'de' })
    );

    expect(state.createCalls[0]).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'de' });
    expect(state.streamCalls[0].text).toBe('The weather is nice.');
    expect(chunks.filter((c) => !c.done).map((c) => c.text)).toEqual(['Das Wetter ', 'ist schön.']);
    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.timing!.chunkCount).toBe(2);
    expect(final.timing!.chars).toBe('Das Wetter ist schön.'.length);
    expect(final.timing!.firstChunkAt).toBeGreaterThanOrEqual(final.timing!.requestedAt);
    expect(final.timing!.endedAt).toBeGreaterThanOrEqual(final.timing!.firstChunkAt!);
  });

  it('uses the settings pair by default and reuses the cached session', async () => {
    const state = newState(['Hola']);
    installTranslator(state);
    const model = new ChromeAITranslator({ sourceLanguage: 'en', targetLanguage: 'es' });

    await collect(model.doStreamTranslate({ text: 'Hi' }));
    await model.doTranslate({ texts: ['Hi'] });
    expect(state.createCalls).toHaveLength(1);
    expect(state.createCalls[0]).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'es' });
  });

  it('surfaces an abort mid-stream as an AbortError', async () => {
    const state = newState(['a ', 'b ', 'c']);
    installTranslator(state);
    const model = new ChromeAITranslator();
    const controller = new AbortController();

    const run = (async () => {
      for await (const c of model.doStreamTranslate({ text: 'x', abortSignal: controller.signal })) {
        if (!c.done) controller.abort();
      }
    })();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws a non-retryable TranslationError when the session has no translateStreaming()', async () => {
    const state = newState(['a']);
    installTranslator(state, { withStreaming: false });
    const model = new ChromeAITranslator();

    const err = await collect(model.doStreamTranslate({ text: 'x' })).catch((e) => e);
    expect(err.name).toBe('TranslationError');
    expect(err.code).toBe('chrome-ai-streaming-not-supported');
    expect(err.retryable).toBe(false);
  });

  it('keeps the per-pair download gate', async () => {
    const state = newState(['a'], 'downloadable');
    installTranslator(state);
    const model = new ChromeAITranslator();
    await expect(collect(model.doStreamTranslate({ text: 'x', targetLanguage: 'de' }))).rejects.toThrow(
      /language pack/
    );
  });
});

describe('ChromeAITranslator input quota and model info', () => {
  it('measureInputUsage() and getInputQuota() read the session for the pair', async () => {
    const state = newState(['a']);
    installTranslator(state);
    const model = new ChromeAITranslator();

    expect(await model.measureInputUsage('hello', { sourceLanguage: 'en', targetLanguage: 'de' })).toBe(5);
    expect(await model.getInputQuota({ sourceLanguage: 'en', targetLanguage: 'de' })).toBe(Infinity);
    expect(state.createCalls).toHaveLength(1);
    expect(state.createCalls[0]).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'de' });
  });

  it('getModelInfo() captures the pair, availability at creation, quota and the Chrome build', async () => {
    const state = newState(['a']);
    installTranslator(state);
    const model = new ChromeAITranslator({ sourceLanguage: 'en', targetLanguage: 'de' });

    const info = await model.getModelInfo();
    expect(info.api).toBe('Translator');
    expect(info.availabilityAtCreate).toBe('available');
    expect(info.requestedOptions).toEqual({ sourceLanguage: 'en', targetLanguage: 'de' });
    expect(info.sessionOptions).toEqual({ sourceLanguage: 'en', targetLanguage: 'de' });
    expect(info.inputQuota).toBe(Infinity);
    expect(info.modelVersion).toBeNull();
    expect(info.browser.fullVersionList?.[0]).toEqual({ brand: 'Google Chrome', version: '156.0.8078.48' });
  });
});

// ---------------------------------------------------------------------------
// getChromeBuildInfo()
// ---------------------------------------------------------------------------

describe('getChromeBuildInfo()', () => {
  it('reads brands, fullVersionList, platform and the user agent', async () => {
    const info = await getChromeBuildInfo();
    expect(info.userAgent).toBe(fakeNavigator.userAgent);
    expect(info.brands).toEqual(fakeNavigator.userAgentData.brands);
    expect(info.fullVersionList?.map((b) => b.version)).toContain('156.0.8078.48');
    expect(info.platform).toBe('macOS');
    expect(info.platformVersion).toBe('26.3.0');
    expect(info.architecture).toBe('arm');
    expect(fakeNavigator.userAgentData.getHighEntropyValues).toHaveBeenCalledWith(
      expect.arrayContaining(['fullVersionList'])
    );
  });

  it('returns nulls where navigator.userAgentData is missing (non-Chromium)', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/140.0' });
    const info = await getChromeBuildInfo();
    expect(info.userAgent).toBe('Mozilla/5.0 Firefox/140.0');
    expect(info.brands).toBeNull();
    expect(info.fullVersionList).toBeNull();
  });

  it('keeps the low-entropy brands when getHighEntropyValues() rejects', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'UA',
      userAgentData: {
        brands: [{ brand: 'Chromium', version: '156' }],
        platform: 'macOS',
        getHighEntropyValues: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    });
    const info = await getChromeBuildInfo();
    expect(info.brands).toEqual([{ brand: 'Chromium', version: '156' }]);
    expect(info.fullVersionList).toBeNull();
    expect(info.platform).toBe('macOS');
  });
});
