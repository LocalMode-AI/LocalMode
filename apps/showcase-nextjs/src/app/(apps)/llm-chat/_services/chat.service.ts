/**
 * @file chat.service.ts
 * @description Service for LLM chat interactions using @localmode/webllm
 */
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';
import { CHAT_CONFIG } from '../_lib/constants';

/** Parameters for streaming a chat response */
interface StreamChatParams {
  /** The model ID to use for generation */
  modelId: string;
  /** The prompt to send to the model */
  prompt: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Error thrown when a request is aborted */
export class ChatAbortError extends Error {
  constructor() {
    super('Chat request was aborted');
    this.name = 'ChatAbortError';
  }
}

/**
 * Stream a chat response from the LLM
 * @param params - The parameters for the chat request
 * @yields Text chunks as they are generated
 * @throws ChatAbortError if the request is aborted
 */
export async function* streamChatResponse(params: StreamChatParams) {
  const { modelId, prompt, signal } = params;

  // Check if already aborted
  if (signal?.aborted) {
    throw new ChatAbortError();
  }

  const model = webllm.languageModel(modelId);

  const result = await streamText({
    model,
    prompt,
    maxTokens: CHAT_CONFIG.maxTokens,
    temperature: CHAT_CONFIG.temperature,
  });

  for await (const chunk of result.stream) {
    // Check for abort signal between chunks
    if (signal?.aborted) {
      throw new ChatAbortError();
    }
    yield chunk.text;
  }
}
