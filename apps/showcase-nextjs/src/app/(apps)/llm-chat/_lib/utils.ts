/**
 * @file utils.ts
 * @description Utility functions for the local-chat application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ChatMessage, MessageRole } from './types';
import { CHAT_CONFIG, IMAGE_CONFIG } from './constants';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to relative time (e.g., "2m ago")
 * @param date - Date to format
 */
export function formatRelativeTime(date: Date) {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  return date.toLocaleDateString();
}

/**
 * Create a chat message with auto-generated ID and timestamp
 * @param role - Message role (user, assistant, system)
 * @param content - Message content
 */
export function createMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

/**
 * Build a prompt string from chat history for LLM inference
 * @param messages - Messages in the conversation (should end with the latest user message)
 * @param systemPrompt - Optional system prompt
 */
export function buildPrompt(messages: ChatMessage[], systemPrompt?: string) {
  let prompt = systemPrompt ? `System: ${systemPrompt}\n\n` : '';

  // Include only recent messages for context
  const recentHistory = messages.slice(-CHAT_CONFIG.contextMessageCount);

  for (const msg of recentHistory) {
    const label =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    prompt += `${label}: ${msg.content}\n\n`;
  }

  return prompt + 'Assistant:';
}

/**
 * Group models by category
 * @param models - Array of model info objects
 */
export function groupModelsByCategory<T extends { category: string }>(
  models: T[]
): Record<string, T[]> {
  return models.reduce(
    (acc, model) => {
      if (!acc[model.category]) acc[model.category] = [];
      acc[model.category].push(model);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Validate an image file for upload
 * @param file - File to validate
 * @returns Error message string if invalid, null if valid
 */
export function validateImageFile(file: File): string | null {
  if (!IMAGE_CONFIG.acceptedTypes.includes(file.type)) {
    return `Unsupported format. Accepted: JPEG, PNG, WebP, GIF`;
  }
  if (file.size > IMAGE_CONFIG.maxSizeBytes) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${IMAGE_CONFIG.maxSizeLabel}`;
  }
  return null;
}

/**
 * Extract text content from string or ContentPart[] for display
 * @param content - Message content (string or ContentPart[])
 */
export function getDisplayText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join(' ');
}
