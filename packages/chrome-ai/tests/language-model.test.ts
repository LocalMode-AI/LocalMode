/**
 * @file language-model.test.ts
 * @description Tests for ChromeAILanguageModel implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChromeAILanguageModel } from '../src/implementations/language-model.js';
import type { AILanguageModel, AILanguageModelCreateOptions } from '../src/types.js';

// ---------- Test helpers ----------

/** Build a ReadableStream<string> from an array of deltas. */
function streamFrom(deltas: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const d of deltas) {
        controller.enqueue(d);
      }
      controller.close();
    },
  });
}

/** Build a ReadableStream that signals abort partway through. */
function abortableStream(deltas: string[], signal: AbortSignal): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      for (const d of deltas) {
        if (signal.aborted) {
          controller.error(new DOMException('Aborted', 'AbortError'));
          return;
        }
        controller.enqueue(d);
        // Yield to allow the consumer to abort between chunks.
        await new Promise((r) => setTimeout(r, 0));
      }
      controller.close();
    },
  });
}

interface MockSetup {
  factory: {
    create: ReturnType<typeof vi.fn>;
    availability: ReturnType<typeof vi.fn>;
  };
  session: AILanguageModel & {
    prompt: ReturnType<typeof vi.fn>;
    promptStreaming: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

function setupMockSession(opts: {
  promptResult?: string;
  streamingResult?: string[];
  inputUsageBefore?: number;
  inputUsageAfter?: number;
  inputQuota?: number;
  availability?: 'available' | 'downloadable' | 'downloading' | 'unavailable';
  surface?: 'top' | 'legacy';
} = {}): MockSetup {
  const promptResult = opts.promptResult ?? 'Hello world';
  const streamingResult = opts.streamingResult ?? ['Hel', 'lo', ' world'];
  const availability = opts.availability ?? 'available';

  let calls = 0;
  const session = {
    prompt: vi.fn().mockImplementation(async (_input: string, _options?: { signal?: AbortSignal }) => {
      calls += 1;
      // Simulate inputUsage growing after each call when configured
      if (opts.inputUsageAfter !== undefined) {
        (session as unknown as { inputUsage: number }).inputUsage = opts.inputUsageAfter;
      }
      return promptResult;
    }),
    promptStreaming: vi.fn().mockImplementation((_input: string) => {
      calls += 1;
      return streamFrom(streamingResult);
    }),
    destroy: vi.fn(),
    inputUsage: opts.inputUsageBefore,
    inputQuota: opts.inputQuota,
  } as unknown as MockSetup['session'];

  const factory = {
    create: vi.fn().mockResolvedValue(session),
    availability: vi.fn().mockResolvedValue(availability),
  };

  const stub: any = {};
  if (opts.surface === 'legacy') {
    stub.ai = { languageModel: factory };
  } else {
    stub.LanguageModel = factory;
  }

  vi.stubGlobal('self', stub);

  // Avoid 'unused' warnings
  void calls;

  return { factory, session };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChromeAILanguageModel', () => {
  it('has correct modelId, provider, contextLength, and supportsVision', () => {
    setupMockSession();
    const model = new ChromeAILanguageModel();
    expect(model.modelId).toBe('chrome-ai:gemini-nano');
    expect(model.provider).toBe('chrome-ai');
    expect(model.contextLength).toBe(6144);
    expect(model.supportsVision).toBe(false);
  });

  it('honors a custom contextLength setting', () => {
    setupMockSession();
    const model = new ChromeAILanguageModel({ contextLength: 4096 });
    expect(model.contextLength).toBe(4096);
  });

  it('returns { text, finishReason, usage } from doGenerate()', async () => {
    setupMockSession({ promptResult: 'Hello world' });
    const model = new ChromeAILanguageModel();
    const result = await model.doGenerate({ prompt: 'Hi' });

    expect(result.text).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(result.usage.inputTokens + result.usage.outputTokens);
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.usage.durationMs)).toBe(true);
  });

  it('forwards temperature and topK to LanguageModel.create()', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel({ temperature: 0.3, topK: 20 });
    await model.doGenerate({ prompt: 'x', temperature: 0.5 });

    expect(factory.create).toHaveBeenCalledTimes(1);
    const opts = factory.create.mock.calls[0]![0] as AILanguageModelCreateOptions;
    expect(opts.temperature).toBe(0.5);
    expect(opts.topK).toBe(20);
  });

  it('forwards systemPrompt as an initialPrompts system entry', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.doGenerate({ prompt: 'Hi', systemPrompt: 'You are concise.' });

    const opts = factory.create.mock.calls[0]![0] as AILanguageModelCreateOptions;
    expect(opts.initialPrompts).toEqual([{ role: 'system', content: 'You are concise.' }]);
  });

  it('forwards messages as ordered initialPrompts entries', async () => {
    const { factory, session } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.doGenerate({
      prompt: 'follow-up',
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    });

    const opts = factory.create.mock.calls[0]![0] as AILanguageModelCreateOptions;
    expect(opts.initialPrompts).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
    // Latest prompt is delivered via session.prompt(), NOT in initialPrompts.
    expect(session.prompt).toHaveBeenCalledWith('follow-up', undefined);
  });

  it('truncates output at stopSequences and reports finishReason: stop', async () => {
    setupMockSession({ promptResult: 'hello END more' });
    const model = new ChromeAILanguageModel();
    const result = await model.doGenerate({ prompt: 'x', stopSequences: ['END'] });

    expect(result.text).toBe('hello ');
    expect(result.text.includes('END')).toBe(false);
    expect(result.finishReason).toBe('stop');
  });

  it('ignores topP without throwing and warns once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.doGenerate({ prompt: 'x', topP: 0.9 });
    await model.doGenerate({ prompt: 'y', topP: 0.5 });

    const opts = factory.create.mock.calls[0]![0] as AILanguageModelCreateOptions;
    expect(opts).not.toHaveProperty('topP');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('rejects pre-aborted AbortSignal without invoking LanguageModel.create()', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.doGenerate({ prompt: 'x', abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('rejects when prompt() rejects with an AbortError after signal fires', async () => {
    const { session } = setupMockSession();
    const controller = new AbortController();
    session.prompt.mockImplementation(async (_input: string, opts?: { signal?: AbortSignal }) => {
      // Mid-call abort.
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    const model = new ChromeAILanguageModel();
    await expect(model.doGenerate({ prompt: 'x', abortSignal: controller.signal })).rejects.toThrow();
  });

  it('doStream yields per-chunk deltas and a terminal done chunk', async () => {
    setupMockSession({ streamingResult: ['Hel', 'lo', ' world'] });
    const model = new ChromeAILanguageModel();

    const chunks: { text: string; done: boolean }[] = [];
    for await (const chunk of model.doStream({ prompt: 'Hi' })) {
      chunks.push({ text: chunk.text, done: chunk.done });
    }

    expect(chunks.length).toBeGreaterThanOrEqual(4); // 3 deltas + final done
    expect(chunks[0]).toEqual({ text: 'Hel', done: false });
    expect(chunks[1]).toEqual({ text: 'lo', done: false });
    expect(chunks[2]).toEqual({ text: ' world', done: false });
    const last = chunks[chunks.length - 1]!;
    expect(last.done).toBe(true);
    expect(last.text).toBe('');
  });

  it('doStream final chunk carries cumulative usage', async () => {
    setupMockSession({ streamingResult: ['Hel', 'lo'] });
    const model = new ChromeAILanguageModel();

    let final: { usage?: { outputTokens: number; totalTokens: number; durationMs: number } } | null = null;
    for await (const chunk of model.doStream({ prompt: 'Hi' })) {
      if (chunk.done) final = chunk;
    }
    expect(final?.usage).toBeDefined();
    expect(final!.usage!.outputTokens).toBeGreaterThan(0);
    expect(final!.usage!.totalTokens).toBeGreaterThan(0);
    expect(Number.isFinite(final!.usage!.durationMs)).toBe(true);
  });

  it('doStream applies stopSequences and ends iteration early', async () => {
    setupMockSession({ streamingResult: ['hello ', 'END', ' more'] });
    const model = new ChromeAILanguageModel();

    const texts: string[] = [];
    for await (const chunk of model.doStream({ prompt: 'x', stopSequences: ['END'] })) {
      if (!chunk.done) texts.push(chunk.text);
    }
    const combined = texts.join('');
    expect(combined.includes('END')).toBe(false);
    expect(combined.endsWith(' ')).toBe(true);
  });

  it('doStream aborts when signal fires mid-stream', async () => {
    const { session } = setupMockSession();
    const controller = new AbortController();
    session.promptStreaming.mockImplementation(() => abortableStream(['a', 'b', 'c', 'd'], controller.signal));

    const model = new ChromeAILanguageModel();
    const iter = model.doStream({ prompt: 'x', abortSignal: controller.signal });

    let threw = false;
    try {
      let count = 0;
      for await (const chunk of iter) {
        count += 1;
        if (count === 1) controller.abort();
        if (chunk.done) break;
      }
    } catch (err) {
      threw = true;
      expect((err as Error).name).toBe('AbortError');
    }
    expect(threw).toBe(true);
  });

  it('throws chrome-ai-multimodal-not-supported on ImagePart content BEFORE create()', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();

    await expect(
      model.doGenerate({
        prompt: 'desc',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', data: 'iVBORw0KGgo', mimeType: 'image/png' },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'chrome-ai-multimodal-not-supported' });
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('throws chrome-ai-multimodal-not-supported when text+image are mixed', async () => {
    setupMockSession();
    const model = new ChromeAILanguageModel();

    await expect(
      model.doGenerate({
        prompt: 'desc',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'caption this' },
              { type: 'image', data: 'iVBOR', mimeType: 'image/jpeg' },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'chrome-ai-multimodal-not-supported' });
  });

  it('accepts pure-text ContentPart[] messages', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();

    await model.doGenerate({
      prompt: 'go',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    });
    const opts = factory.create.mock.calls[0]![0] as AILanguageModelCreateOptions;
    expect(opts.initialPrompts).toEqual([{ role: 'user', content: 'hello world' }]);
  });

  it('throws chrome-ai-not-supported when no API surface is present', async () => {
    vi.stubGlobal('self', {});
    const model = new ChromeAILanguageModel();
    await expect(model.doGenerate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'chrome-ai-not-supported',
    });
  });

  it('throws chrome-ai-model-not-available when availability() reports unavailable', async () => {
    setupMockSession({ availability: 'unavailable' });
    const model = new ChromeAILanguageModel();
    await expect(model.warmUp()).rejects.toMatchObject({ code: 'chrome-ai-model-not-available' });
  });

  it('throws chrome-ai-download-required when availability is downloadable without allowDownload', async () => {
    setupMockSession({ availability: 'downloadable' });
    const model = new ChromeAILanguageModel();
    await expect(model.doGenerate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'chrome-ai-download-required',
    });
  });

  it('proceeds when availability is downloadable and allowDownload=true is set', async () => {
    const { factory } = setupMockSession({ availability: 'downloadable' });
    const model = new ChromeAILanguageModel();
    const result = await model.doGenerate({
      prompt: 'x',
      providerOptions: { chromeAI: { allowDownload: true } },
    });
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(result.text).toBeTypeOf('string');
  });

  it('maps "too long" prompt errors to chrome-ai-quota-exceeded', async () => {
    const { session } = setupMockSession();
    session.prompt.mockRejectedValue(new Error('Input is too long for this model'));
    const model = new ChromeAILanguageModel();
    await expect(model.doGenerate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'chrome-ai-quota-exceeded',
    });
  });

  it('warmUp() calls LanguageModel.create() once and sets isReady() true', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();
    expect(model.isReady()).toBe(false);
    await model.warmUp();
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(model.isReady()).toBe(true);
  });

  it('warmUp() is idempotent (sequential and concurrent)', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();

    // Concurrent
    await Promise.all([model.warmUp(), model.warmUp(), model.warmUp()]);
    expect(factory.create).toHaveBeenCalledTimes(1);

    // Sequential
    await model.warmUp();
    expect(factory.create).toHaveBeenCalledTimes(1);
  });

  it('doGenerate after warmUp does not re-invoke create() for matching settings', async () => {
    const { factory } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.warmUp();
    await model.doGenerate({ prompt: 'a' });
    await model.doGenerate({ prompt: 'b' });
    expect(factory.create).toHaveBeenCalledTimes(1);
  });

  it('changing messages destroys the cached session and creates a new one', async () => {
    const { factory, session } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.doGenerate({ prompt: 'a', messages: [{ role: 'user', content: 'first' }] });
    expect(factory.create).toHaveBeenCalledTimes(1);

    await model.doGenerate({ prompt: 'b', messages: [{ role: 'user', content: 'second' }] });
    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(session.destroy).toHaveBeenCalled();
  });

  it('destroy() releases the session and resets state', async () => {
    const { factory, session } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.warmUp();
    expect(model.isReady()).toBe(true);

    model.destroy();
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(model.isReady()).toBe(false);

    // Subsequent calls recreate.
    await model.doGenerate({ prompt: 'x' });
    expect(factory.create).toHaveBeenCalledTimes(2);
  });

  it('destroy() is idempotent', async () => {
    const { session } = setupMockSession();
    const model = new ChromeAILanguageModel();
    await model.warmUp();
    model.destroy();
    model.destroy();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('works on the legacy self.ai.languageModel surface', async () => {
    const { factory } = setupMockSession({ surface: 'legacy' });
    const model = new ChromeAILanguageModel();
    const result = await model.doGenerate({ prompt: 'Hi' });
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(result.text).toBeTypeOf('string');
  });
});
