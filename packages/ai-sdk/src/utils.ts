/**
 * @file utils.ts
 * @description Utility functions for mapping between LocalMode and AI SDK types
 */

import type { FinishReason, ChatMessage } from '@localmode/core';
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';

/**
 * Map a LocalMode FinishReason to an AI SDK LanguageModelV3FinishReason.
 *
 * @param reason - LocalMode finish reason
 * @returns AI SDK finish reason object with unified and raw fields
 */
export function mapFinishReason(reason: FinishReason): LanguageModelV3FinishReason {
  const mapping: Record<string, LanguageModelV3FinishReason['unified']> = {
    stop: 'stop',
    length: 'length',
    content_filter: 'content-filter',
    error: 'error',
  };

  return {
    unified: mapping[reason] ?? 'other',
    raw: reason,
  };
}

/**
 * Convert an AI SDK LanguageModelV3Prompt to LocalMode DoGenerateOptions fields.
 *
 * Extracts system prompt, user/assistant messages, and builds a simple prompt string.
 *
 * @param prompt - AI SDK prompt messages
 * @returns Object with systemPrompt, messages, and prompt string
 */
export function convertPrompt(prompt: LanguageModelV3Prompt) {
  let systemPrompt: string | undefined;
  const messages: ChatMessage[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      systemPrompt = message.content;
    } else if (message.role === 'user') {
      const textParts = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text);
      if (textParts.length > 0) {
        messages.push({ role: 'user', content: textParts.join('\n') });
      }
    } else if (message.role === 'assistant') {
      const textParts = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text);
      if (textParts.length > 0) {
        messages.push({ role: 'assistant', content: textParts.join('\n') });
      }
    }
  }

  // Build a simple prompt string from the last user message
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  const content = lastUserMessage?.content ?? '';
  const promptText = typeof content === 'string' ? content : content.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('\n');

  return { systemPrompt, messages, prompt: promptText };
}
