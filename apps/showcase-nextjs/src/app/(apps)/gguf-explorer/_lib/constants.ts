/**
 * @file constants.ts
 * @description Constants for the GGUF Explorer application
 */

import type { ExplorerTab } from './types';

/** Ordered tab list */
export const TABS: ExplorerTab[] = ['browse', 'inspect', 'chat'];

/** Display labels for each tab */
export const TAB_LABELS: Record<ExplorerTab, string> = {
  browse: 'Browse',
  inspect: 'Inspect',
  chat: 'Chat',
};

/** Default chat configuration */
export const CHAT_CONFIG = {
  maxTokens: 512,
  temperature: 0.7,
  systemPrompt: 'You are a helpful assistant.',
} as const;

/** Size category display info */
export const SIZE_CATEGORY_LABELS: Record<
  'tiny' | 'small' | 'medium' | 'large',
  { title: string; subtitle: string; color: string; bgColor: string }
> = {
  tiny: {
    title: 'Tiny Models',
    subtitle: '< 500MB',
    color: 'text-poster-accent-teal',
    bgColor: 'bg-poster-accent-teal/10',
  },
  small: {
    title: 'Small Models',
    subtitle: '500MB - 1GB',
    color: 'text-poster-primary',
    bgColor: 'bg-poster-primary/10',
  },
  medium: {
    title: 'Medium Models',
    subtitle: '1GB - 2GB',
    color: 'text-poster-accent-orange',
    bgColor: 'bg-poster-accent-orange/10',
  },
  large: {
    title: 'Large Models',
    subtitle: '2GB+',
    color: 'text-poster-accent-purple',
    bgColor: 'bg-poster-accent-purple/10',
  },
};

/** Example GGUF URLs for the custom URL input hint */
export const SAMPLE_URLS = [
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
] as const;
