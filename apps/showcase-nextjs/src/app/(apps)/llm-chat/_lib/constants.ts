/**
 * @file constants.ts
 * @description App constants and configuration for local-chat
 */

import type { CategoryInfo, ModelCategory } from './types';

/** Default system prompt for the chat */
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

/** Chat generation configuration */
export const CHAT_CONFIG = {
  /** Maximum tokens to generate per response */
  maxTokens: 1000,
  /** Temperature for generation (0-1) */
  temperature: 0.7,
  /** Number of recent messages to include in context */
  contextMessageCount: 10,
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Chat store persistence key */
  chat: 'llm-chat-storage',
  /** UI store persistence key */
  ui: 'llm-chat-ui',
} as const;

/** Model categories in display order */
export const MODEL_CATEGORIES = ['tiny', 'small', 'medium', 'large'] as const;

/** Category info mapping for display */
export const CATEGORY_INFO: Record<ModelCategory, CategoryInfo> = {
  tiny: {
    title: 'Tiny Models',
    subtitle: '< 500MB - Fast loading',
    color: 'text-poster-accent-teal',
    bgColor: 'bg-poster-accent-teal/10',
    borderColor: 'border-poster-accent-teal/30',
  },
  small: {
    title: 'Small Models',
    subtitle: '500MB - 1GB - Good balance',
    color: 'text-poster-primary',
    bgColor: 'bg-poster-primary/10',
    borderColor: 'border-poster-primary/30',
  },
  medium: {
    title: 'Medium Models',
    subtitle: '1GB - 2GB - Better quality',
    color: 'text-poster-accent-purple',
    bgColor: 'bg-poster-accent-purple/10',
    borderColor: 'border-poster-accent-purple/30',
  },
  large: {
    title: 'Large Models',
    subtitle: '2GB+ - Best quality',
    color: 'text-poster-accent-orange',
    bgColor: 'bg-poster-accent-orange/10',
    borderColor: 'border-poster-accent-orange/30',
  },
};
