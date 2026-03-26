/**
 * LangChain BaseChatModel adapter for @localmode/core LanguageModel.
 *
 * @packageDocumentation
 */

import {
  BaseChatModel,
  type BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
  ChatMessage as LCChatMessage,
} from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { LanguageModel, ChatMessage } from '@localmode/core';
import type { ChatLocalModeOptions } from './types.js';

/**
 * LangChain BaseChatModel backed by a LocalMode LanguageModel.
 *
 * Drop-in replacement for `ChatOpenAI` or any LangChain chat model,
 * powered by local LLM inference via `@localmode/webllm`.
 *
 * @example
 * ```ts
 * import { ChatLocalMode } from '@localmode/langchain';
 * import { webllm } from '@localmode/webllm';
 *
 * const llm = new ChatLocalMode({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 * });
 *
 * const result = await llm.invoke('What is the capital of France?');
 * ```
 */
export class ChatLocalMode extends BaseChatModel {
  private localModel: LanguageModel;
  private defaultTemperature?: number;
  private defaultMaxTokens?: number;
  private defaultSystemPrompt?: string;

  constructor(options: ChatLocalModeOptions) {
    super({});
    this.localModel = options.model;
    this.defaultTemperature = options.temperature;
    this.defaultMaxTokens = options.maxTokens;
    this.defaultSystemPrompt = options.systemPrompt;
  }

  _llmType(): string {
    return 'localmode';
  }

  /**
   * Generate a chat response.
   */
  async _generate(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const { chatMessages, systemPrompt } = this.mapMessages(messages);

    const lastContent = chatMessages[chatMessages.length - 1]?.content ?? '';
    const prompt = typeof lastContent === 'string' ? lastContent : '';

    const result = await this.localModel.doGenerate({
      prompt,
      messages: chatMessages,
      systemPrompt: systemPrompt ?? this.defaultSystemPrompt,
      temperature: (options as Record<string, unknown>)?.temperature as number | undefined ?? this.defaultTemperature,
      maxTokens: (options as Record<string, unknown>)?.maxTokens as number | undefined ?? this.defaultMaxTokens,
      abortSignal: options?.signal,
    });

    return {
      generations: [
        {
          message: new AIMessage(result.text),
          text: result.text,
          generationInfo: { finishReason: result.finishReason },
        },
      ],
      llmOutput: { finishReason: result.finishReason },
    };
  }

  /**
   * Stream a chat response.
   */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    if (!this.localModel.doStream) {
      // Fallback: generate full response and yield as single chunk
      const result = await this._generate(messages, options);
      const gen = result.generations[0];
      yield new ChatGenerationChunk({
        message: new AIMessageChunk(gen.text),
        text: gen.text,
        generationInfo: gen.generationInfo,
      });
      return;
    }

    const { chatMessages, systemPrompt } = this.mapMessages(messages);

    const lastContent = chatMessages[chatMessages.length - 1]?.content ?? '';
    const prompt = typeof lastContent === 'string' ? lastContent : '';

    const stream = this.localModel.doStream({
      prompt,
      messages: chatMessages,
      systemPrompt: systemPrompt ?? this.defaultSystemPrompt,
      temperature: (options as Record<string, unknown>)?.temperature as number | undefined ?? this.defaultTemperature,
      maxTokens: (options as Record<string, unknown>)?.maxTokens as number | undefined ?? this.defaultMaxTokens,
      abortSignal: options?.signal,
    });

    for await (const chunk of stream) {
      if (options?.signal?.aborted) break;

      yield new ChatGenerationChunk({
        message: new AIMessageChunk(chunk.text),
        text: chunk.text,
        generationInfo: chunk.done ? { finishReason: chunk.finishReason ?? 'stop' } : undefined,
      });
    }
  }

  /** Map LangChain BaseMessage[] to LocalMode ChatMessage[]. */
  private mapMessages(messages: BaseMessage[]): {
    chatMessages: ChatMessage[];
    systemPrompt: string | undefined;
  } {
    let systemPrompt: string | undefined;
    const chatMessages: ChatMessage[] = [];

    for (const msg of messages) {
      const role = this.getRole(msg);
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      if (role === 'system' && chatMessages.length === 0) {
        systemPrompt = content;
      } else {
        chatMessages.push({ role, content });
      }
    }

    return { chatMessages, systemPrompt };
  }

  /** Map a LangChain BaseMessage to a LocalMode role. */
  private getRole(msg: BaseMessage): 'user' | 'assistant' | 'system' {
    const type = msg._getType();
    switch (type) {
      case 'human':
        return 'user';
      case 'ai':
        return 'assistant';
      case 'system':
        return 'system';
      default:
        if (msg instanceof LCChatMessage) {
          const role = msg.role;
          if (role === 'user' || role === 'assistant' || role === 'system') return role;
        }
        return 'user';
    }
  }
}
