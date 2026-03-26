/**
 * @file chat-model.test.ts
 * @description Tests for ChatLocalMode adapter
 */

import { describe, it, expect, vi } from 'vitest';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatLocalMode } from '../src/chat-model.js';
import type { LanguageModel, DoGenerateOptions } from '@localmode/core';

function createMockLanguageModel(opts?: {
  doStream?: boolean;
}): LanguageModel {
  const model: LanguageModel = {
    modelId: 'mock-llm',
    provider: 'mock',
    contextLength: 4096,
    doGenerate: vi.fn(async (options: DoGenerateOptions) => ({
      text: `response to: ${options.prompt}`,
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    })),
  };

  if (opts?.doStream) {
    (model as Record<string, unknown>).doStream = vi.fn(async function* (options: DoGenerateOptions) {
      yield { text: 'chunk1', done: false };
      yield { text: 'chunk2', done: true, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    });
  }

  return model;
}

describe('ChatLocalMode', () => {
  it('_llmType returns localmode', () => {
    const llm = new ChatLocalMode({ model: createMockLanguageModel() });
    expect(llm._llmType()).toBe('localmode');
  });

  it('_generate returns ChatResult with text', async () => {
    const model = createMockLanguageModel();
    const llm = new ChatLocalMode({ model });

    const result = await llm._generate([new HumanMessage('hello')]);

    expect(result.generations).toHaveLength(1);
    expect(result.generations[0].text).toContain('response to');
    expect(result.llmOutput?.finishReason).toBe('stop');
  });

  it('maps Human/AI/System messages correctly', async () => {
    const model = createMockLanguageModel();
    const llm = new ChatLocalMode({ model });

    await llm._generate([
      new SystemMessage('You are helpful'),
      new HumanMessage('hello'),
      new AIMessage('hi there'),
      new HumanMessage('how are you'),
    ]);

    const call = (model.doGenerate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.systemPrompt).toBe('You are helpful');
    expect(call.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'how are you' },
    ]);
  });

  it('forwards temperature and maxTokens', async () => {
    const model = createMockLanguageModel();
    const llm = new ChatLocalMode({ model, temperature: 0.5, maxTokens: 100 });

    await llm._generate([new HumanMessage('test')]);

    const call = (model.doGenerate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.temperature).toBe(0.5);
    expect(call.maxTokens).toBe(100);
  });

  it('streams via _streamResponseChunks when doStream available', async () => {
    const model = createMockLanguageModel({ doStream: true });
    const llm = new ChatLocalMode({ model });

    const chunks: string[] = [];
    for await (const chunk of llm._streamResponseChunks([new HumanMessage('test')])) {
      chunks.push(chunk.text);
    }

    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });

  it('falls back to single chunk when doStream unavailable', async () => {
    const model = createMockLanguageModel({ doStream: false });
    const llm = new ChatLocalMode({ model });

    const chunks: string[] = [];
    for await (const chunk of llm._streamResponseChunks([new HumanMessage('test')])) {
      chunks.push(chunk.text);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('response to');
  });
});
