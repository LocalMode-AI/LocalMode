'use client';

/**
 * @file chat.tsx
 * @description CHAT block body (`/blocks/chat`) — the flagship multi-provider chat surface (transformers / webllm / wllama / litert) with vision attachments, reasoning, semantic response cache, and agent mode.
 */

import { Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Bot,
  Boxes,
  FileJson,
  FileSearch,
  Link2,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  downloadBlob,
  getTextContent,
  useAgent,
  useChat,
  useModelLoad,
  useSemanticCache,
  type UseModelLoadReturn,
} from '@localmode/react';
import {
  embed,
  globalEventBus,
  isWebGPUSupported,
  semanticCacheMiddleware,
  wrapLanguageModel,
  type CacheStats,
  type ContentPart,
  type EmbeddingModel,
  type LanguageModel,
  type ObjectSchema,
  type SemanticCache,
  type SummarizationModel,
  type ToolDefinition,
} from '@localmode/core';
import {
  transformers,
  TRANSFORMERS_LLM_MODELS,
  isModelCached as transformersIsModelCached,
  clearModelCache as transformersClearModelCache,
} from '@localmode/transformers';
import {
  webllm,
  WEBLLM_MODELS,
  isModelCached as webllmIsModelCached,
  deleteModelCache as webllmDeleteModelCache,
} from '@localmode/webllm';
import {
  wllama,
  WLLAMA_MODELS,
  getModelCategory,
  isCrossOriginIsolated,
  isModelCached as wllamaIsModelCached,
  deleteModelCache as wllamaDeleteModelCache,
  checkGGUFBrowserCompat,
  parseGGUFMetadata,
  type WllamaModelEntry,
  type GGUFBrowserCompat,
  type GGUFMetadata,
} from '@localmode/wllama';
import {
  litert,
  LITERT_MODELS,
  isModelCached as litertIsModelCached,
  deleteModelCache as litertDeleteModelCache,
  type LiteRTModelEntry,
} from '@localmode/litert';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollAnchor,
  ConversationScrollButton,
} from '@/components/conversation';
import {
  Message,
  MessageAvatar,
  MessageContent,
  type MessagePart,
} from '@/components/message';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptAttachment,
} from '@/components/prompt-input';
import { PromptInputAttachments } from '@/components/prompt-input-attachments';
import { Response } from '@/components/response';
import {
  Branch,
  BranchMessages,
  BranchNext,
  BranchPage,
  BranchPrevious,
  BranchSelector,
} from '@/components/branch';
import { Actions, CopyAction, RegenerateAction } from '@/components/actions';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { Context, ContextTrigger } from '@/components/context-usage-meter';
import { ModelSelector, type ModelBackend, type SelectableModel } from '@/components/model-selector';
import { CapabilityGate } from '@/components/capability-gate';
import { ProviderFallbackBadge } from '@/components/provider-fallback-badge';
import { NetworkBadge } from '@/components/network-badge';
import { CacheBadge } from '@/components/cache-badge';
import { SemanticCacheStatusBar } from '@/components/semantic-cache-status-bar';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/reasoning';
import {
  AgentStepTimeline,
  type AgentFinishReason,
  type AgentStep as TimelineAgentStep,
} from '@/components/agent-step-timeline';
import { ParameterSlider } from '@/components/parameter-slider';
import {
  SlashCommandPalette,
  type SlashCommand,
} from '@/components/slash-command-palette';
import { BrowserCompatCard } from '@/components/browser-compat-card';
import { OptionList, type Option } from '@/components/option-list';
import { cn } from '@/lib/utils';

/* ────────────────────────────── model catalog ────────────────────────────── */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** The four chat inference backends. */
export type ChatBackend = 'transformers' | 'webllm' | 'wllama' | 'litert';

/** Size category buckets (thresholds match wllama's `getModelCategory`). */
export type ChatModelCategory = 'tiny' | 'small' | 'medium' | 'large';

/** One entry in the unified chat model catalog. */
export interface ChatModelEntry {
  /** Provider-native model ID (unique across all four catalogs). */
  id: string;
  /** Which provider serves this model. */
  backend: ChatBackend;
  /** Human-readable model name. */
  name: string;
  /** File size in bytes (from the provider catalog). */
  sizeBytes?: number;
  /** Human-readable size (e.g. '530MB'). */
  sizeLabel: string;
  /** Size category — tiny (<500MB), small (0.5–1GB), medium (1–2GB), large (≥2GB). */
  category: ChatModelCategory;
  /** Maximum context window in tokens. */
  contextLength?: number;
  /** Short description from the provider catalog. */
  description?: string;
  /** Accepts image attachments (multimodal). */
  supportsVision?: boolean;
  /** Supports tool calling. */
  supportsTools?: boolean;
  /** Reasoning/thinking model (wllama DeepSeek-R1 distills). */
  supportsReasoning?: boolean;
  /** Hard WebGPU requirement (litert Gemma 4 GPU-compiled builds only). */
  requiresWebGPU?: boolean;
  /** Vision projector URL (wllama multimodal GGUFs). */
  mmprojUrl?: string;
}

/** Options for {@link createChatLanguageModel}. */
export interface CreateChatModelOptions {
  /** Which provider to create the model with. */
  backend: ChatBackend;
  /** Provider-native model ID (or a derived ID when `customUrl` is set). */
  modelId: string;
  /**
   * Load-progress callback. Receives the provider's native progress object
   * (all four providers emit a structurally-compatible
   * `{ status, progress?, loaded?, total? }` shape; transformers additionally
   * carries `name`/`file` instead of `text`).
   */
  onProgress?: (p: unknown) => void;
  /**
   * Inference device for the transformers backend. Callers MUST pass the
   * adapter-probed value (`isWebGPUSupported()`): headless/adapterless
   * browsers expose `navigator.gpu` with zero adapters, and the provider's
   * own presence check would pick webgpu and fail the load.
   * Ignored by the other backends (they self-manage device selection).
   */
  device?: 'webgpu' | 'wasm';
  /** Custom GGUF URL (wllama `modelUrl` custom-model loading). */
  customUrl?: string;
  /** Vision projector URL (wllama `mmprojUrl`). */
  mmprojUrl?: string;
  /**
   * Enable wllama reasoning mode. Uses `reasoningFormat: 'none'` so thinking
   * arrives inline with explicit `<think>…</think>` delimiters that the block
   * segments client-side.
   */
  enableReasoning?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Catalog merge
// ─────────────────────────────────────────────────────────────

/** Shape shared by the webllm catalog entries (no exported entry type upstream). */
interface WebLLMCatalogEntry {
  name: string;
  contextLength: number;
  sizeBytes: number;
  size: string;
  description: string;
  vision?: boolean;
}

/** Widened views of the `as const` provider catalogs for uniform iteration. */
const WLLAMA_ENTRIES = WLLAMA_MODELS as Record<string, WllamaModelEntry>;
const WEBLLM_ENTRIES = WEBLLM_MODELS as Record<string, WebLLMCatalogEntry>;
const LITERT_ENTRIES = LITERT_MODELS as Record<string, LiteRTModelEntry>;

/** Lazily built merged catalog (static data — safe to build once). */
let cachedCatalog: ChatModelEntry[] | null = null;

/**
 * The unified chat model catalog: every language model from all four provider
 * catalogs. wllama embedding (`isEmbeddingModel`) and reranker
 * (`isRerankerModel`) entries are excluded — this catalog is chat-only.
 *
 * @returns A stable, memoized array ordered transformers → webllm → wllama → litert.
 */
export function getChatCatalog(): ChatModelEntry[] {
  if (cachedCatalog) return cachedCatalog;

  const entries: ChatModelEntry[] = [];

  // 1. transformers — 16 ONNX language models (5 vision-capable).
  for (const [id, entry] of Object.entries(TRANSFORMERS_LLM_MODELS)) {
    entries.push({
      id,
      backend: 'transformers',
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      sizeLabel: entry.size,
      category: getModelCategory(entry.sizeBytes),
      contextLength: entry.contextLength,
      description: entry.description,
      supportsVision: entry.vision === true ? true : undefined,
    });
  }

  // 2. webllm — 32 MLC models (WebGPU-only as a provider; the block dims them
  //    without WebGPU via `model-selector hasWebGPU` rather than a hard gate,
  //    so entries deliberately do NOT carry `requiresWebGPU`).
  for (const [id, entry] of Object.entries(WEBLLM_ENTRIES)) {
    entries.push({
      id,
      backend: 'webllm',
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      sizeLabel: entry.size,
      category: getModelCategory(entry.sizeBytes),
      contextLength: entry.contextLength,
      description: entry.description,
      supportsVision: entry.vision === true ? true : undefined,
    });
  }

  // 3. wllama — language models only (embedding + reranker entries excluded).
  for (const [id, entry] of Object.entries(WLLAMA_ENTRIES)) {
    if (entry.isEmbeddingModel || entry.isRerankerModel) continue;
    entries.push({
      id,
      backend: 'wllama',
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      sizeLabel: entry.size,
      category: getModelCategory(entry.sizeBytes),
      contextLength: entry.contextLength,
      description: entry.description,
      supportsVision: entry.vision === true ? true : undefined,
      supportsTools: entry.supportsToolCalling === true ? true : undefined,
      supportsReasoning: entry.supportsReasoning === true ? true : undefined,
      mmprojUrl: entry.mmprojUrl,
    });
  }

  // 4. litert — 3 `.litertlm` models; Gemma 4 builds are GPU-compiled and
  //    carry the hard `requiresWebGPU` flag (capability-gated in the block).
  for (const [id, entry] of Object.entries(LITERT_ENTRIES)) {
    entries.push({
      id,
      backend: 'litert',
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      sizeLabel: entry.size,
      category: getModelCategory(entry.sizeBytes),
      contextLength: entry.contextLength,
      description: entry.description,
      requiresWebGPU: entry.requiresWebGPU === true ? true : undefined,
    });
  }

  cachedCatalog = entries;
  return entries;
}

// ─────────────────────────────────────────────────────────────
// Backend inference
// ─────────────────────────────────────────────────────────────

/**
 * Infer the backend for a model ID — used on reload so a persisted selection
 * resolves before (and without) the catalog cache check.
 *
 * Exact catalog-key lookups first, then format heuristics for custom /
 * non-catalog IDs (raw GGUF URLs, `.litertlm` URLs, MLC/ONNX naming).
 *
 * @param id - A model ID or model URL
 * @returns The backend, or `null` when the ID matches no known convention
 */
export function inferBackendFromModelId(id: string): ChatBackend | null {
  if (id in TRANSFORMERS_LLM_MODELS) return 'transformers';
  if (id in WEBLLM_ENTRIES) return 'webllm';
  if (id in WLLAMA_ENTRIES) return 'wllama';
  if (id in LITERT_ENTRIES) return 'litert';

  const lower = id.toLowerCase();
  if (lower.endsWith('.litertlm')) return 'litert';
  if (lower.includes('.gguf') || lower.includes('-gguf')) return 'wllama';
  if (id.endsWith('-MLC')) return 'webllm';
  if (lower.includes('onnx')) return 'transformers';
  return null;
}

// ─────────────────────────────────────────────────────────────
// Model creation
// ─────────────────────────────────────────────────────────────

/**
 * Create a `LanguageModel` instance for the given backend. This is the single
 * factory `useModelLoad` keys on (`backend:modelId`) — one active model at a
 * time, disposed on switch via {@link disposeChatModel}.
 *
 * No model bytes are fetched here — providers download lazily on first
 * generate/warmup, behind the block's explicit Load action.
 *
 * @param opts - Backend, model ID, and optional progress/custom-URL/vision/reasoning settings
 * @returns An unloaded `LanguageModel` for the requested backend
 */
export function createChatLanguageModel(opts: CreateChatModelOptions): LanguageModel {
  const { backend, modelId, onProgress, device, customUrl, mmprojUrl, enableReasoning } = opts;

  switch (backend) {
    case 'transformers':
      return transformers.languageModel(modelId, { onProgress, ...(device ? { device } : {}) });

    case 'webllm':
      return webllm.languageModel(modelId, { onProgress });

    case 'wllama': {
      // Fall back to the catalog's projector for curated vision GGUFs when the
      // caller did not pass one explicitly.
      const effectiveMmproj = mmprojUrl ?? WLLAMA_ENTRIES[modelId]?.mmprojUrl;
      return wllama.languageModel(modelId, {
        onProgress,
        ...(customUrl ? { modelUrl: customUrl } : {}),
        ...(effectiveMmproj ? { mmprojUrl: effectiveMmproj } : {}),
        // reasoningFormat 'none' keeps <think>…</think> delimiters inline in
        // the text stream so the block can segment thinking client-side (core
        // StreamChunk has no reasoning channel).
        ...(enableReasoning ? { reasoning: true, reasoningFormat: 'none' as const } : {}),
      });
    }

    case 'litert':
      // litert fail-fasts with a ModelLoadError when a requiresWebGPU model is
      // loaded without WebGPU — the block additionally gates the load
      // affordance behind `capability-gate` (belt + suspenders).
      return litert.languageModel(modelId, { onProgress });
  }
}

// ─────────────────────────────────────────────────────────────
// Cache service
// ─────────────────────────────────────────────────────────────

/**
 * Check whether a model's weights are already cached locally, via the
 * backend's own cache API.
 *
 * @param backend - The provider that owns the cache
 * @param modelId - Provider-native model ID (wllama also accepts raw GGUF URLs)
 * @returns `true` when the model can load without a network download
 */
export function isChatModelCached(backend: ChatBackend, modelId: string): Promise<boolean> {
  switch (backend) {
    case 'transformers':
      return transformersIsModelCached(modelId);
    case 'webllm':
      return webllmIsModelCached(modelId);
    case 'wllama':
      return wllamaIsModelCached(modelId);
    case 'litert':
      return litertIsModelCached(modelId);
  }
}

/**
 * Delete a model's cached weights via the backend's cache-delete API.
 *
 * NOTE (transformers limitation): `@localmode/transformers` exposes only
 * `clearModelCache()` — there is no per-model delete — so deleting any
 * transformers model clears the whole `transformers-cache` (every cached
 * transformers model loses its cached badge).
 *
 * @param backend - The provider that owns the cache
 * @param modelId - Provider-native model ID
 */
export async function deleteChatModelCache(backend: ChatBackend, modelId: string): Promise<void> {
  switch (backend) {
    case 'transformers':
      await transformersClearModelCache();
      return;
    case 'webllm':
      await webllmDeleteModelCache(modelId);
      return;
    case 'wllama':
      await wllamaDeleteModelCache(modelId);
      return;
    case 'litert':
      await litertDeleteModelCache(modelId);
      return;
  }
}

// ─────────────────────────────────────────────────────────────
// Disposal (one active model)
// ─────────────────────────────────────────────────────────────

/**
 * Best-effort teardown of a previously active model before switching to the
 * next one — four engines on one page risk WASM/GPU memory pressure, so only
 * one model stays live.
 *
 * All four provider model classes expose an `unload()` method outside the
 * core `LanguageModel` interface, so this duck-types it:
 * - wllama: `WllamaLanguageModel.unload()` → `wllamaInstance.exit()` (frees WASM memory)
 * - webllm: `WebLLMLanguageModel.unload()` → `engine.unload()` (GPU teardown)
 * - litert: `LiteRTLanguageModel.unload()` (engine/device release)
 * - transformers: `TransformersLanguageModel.unload()` (pipeline/model dispose)
 * If a future provider instance lacks `unload`, this is a documented no-op —
 * cached weights are never touched (that is {@link deleteChatModelCache}).
 *
 * @param backend - The backend the model was created with (context for callers/logging)
 * @param model - The model instance returned by {@link createChatLanguageModel}
 */
export async function disposeChatModel(backend: ChatBackend, model: LanguageModel): Promise<void> {
  const disposable = model as LanguageModel & { unload?: () => Promise<void> };
  if (typeof disposable.unload !== 'function') {
    // No teardown surface on this instance — nothing to release (see JSDoc).
    return;
  }
  try {
    await disposable.unload();
  } catch (err) {
    // Best-effort: a failed unload must never break the model switch itself.
    console.warn(`[chat-block] ${backend} model unload failed`, err);
  }
}

/* ────────────────────────────── agent tools ────────────────────────────── */

// ─────────────────────────────────────────────────────────────
// Agent system prompt
// ─────────────────────────────────────────────────────────────

/**
 * System prompt for the ReAct agent loop (`useAgent`, maxSteps 6,
 * temperature 0 — wired in chat.tsx).
 */
export const AGENT_SYSTEM_PROMPT =
  'You are a helpful assistant with access to tools. Use the available tools to answer questions accurately. ' +
  'Always use the search_knowledge_base tool before answering factual questions. ' +
  'Use the calculate tool for any math. ' +
  'Use the summarize tool to shorten long text. ' +
  'After gathering information, provide a clear and comprehensive final answer.';

// ─────────────────────────────────────────────────────────────
// Static knowledge base
// ─────────────────────────────────────────────────────────────

/** One article in the built-in knowledge base. */
interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
}

/** Static corpus searched by the `search_knowledge_base` tool. */
const AGENT_KNOWLEDGE_BASE: readonly KnowledgeBaseArticle[] = [
  {
    id: 'qc-1',
    title: 'Introduction to Quantum Computing',
    content:
      'Quantum computing uses quantum bits (qubits) that can exist in superposition, representing both 0 and 1 simultaneously. This enables quantum computers to solve certain problems exponentially faster than classical computers. Key concepts include entanglement, where qubits become correlated, and quantum gates that manipulate qubit states. Current quantum computers have 50-1000+ qubits but are error-prone.',
    category: 'quantum-computing',
  },
  {
    id: 'qc-2',
    title: 'Quantum Computing Applications',
    content:
      'Quantum computing has promising applications in cryptography (breaking and creating encryption), drug discovery (simulating molecular interactions), optimization problems (logistics, finance), and machine learning (quantum neural networks). Google demonstrated quantum supremacy in 2019, and IBM offers cloud quantum computing services.',
    category: 'quantum-computing',
  },
  {
    id: 'bio-1',
    title: 'Photosynthesis Process',
    content:
      'Photosynthesis converts sunlight, water, and CO2 into glucose and oxygen. It occurs in chloroplasts using chlorophyll pigments. The light-dependent reactions in the thylakoid membranes capture light energy to produce ATP and NADPH. The Calvin cycle in the stroma uses these to fix CO2 into glucose. Efficiency is approximately 3-6%.',
    category: 'biology',
  },
  {
    id: 'bio-2',
    title: 'CRISPR Gene Editing',
    content:
      'CRISPR-Cas9 is a gene editing tool adapted from bacterial immune systems. It uses a guide RNA to direct the Cas9 enzyme to a specific DNA sequence, where it makes a precise cut. Applications include treating genetic diseases (sickle cell, muscular dystrophy), creating disease-resistant crops, and studying gene function.',
    category: 'genetics',
  },
  {
    id: 'ai-1',
    title: 'Machine Learning Fundamentals',
    content:
      'Machine learning enables computers to learn from data without explicit programming. Supervised learning uses labeled data for classification and regression. Unsupervised learning finds patterns in unlabeled data. Deep learning uses neural networks with many layers for complex pattern recognition in images, text, and audio.',
    category: 'artificial-intelligence',
  },
  {
    id: 'ai-2',
    title: 'Large Language Models',
    content:
      'Large language models (LLMs) are neural networks trained on vast text corpora to generate and understand human language. They use the transformer architecture with self-attention mechanisms. Modern LLMs can perform translation, summarization, code generation, and reasoning. Running LLMs locally in the browser is now possible via WebGPU and WASM.',
    category: 'artificial-intelligence',
  },
  {
    id: 'env-1',
    title: 'Climate Change and Carbon Cycle',
    content:
      'The carbon cycle describes the movement of carbon through the atmosphere, oceans, soil, and living organisms. Human activities, particularly burning fossil fuels, have increased atmospheric CO2 from 280ppm (pre-industrial) to over 420ppm. This enhanced greenhouse effect is causing global temperatures to rise, with consequences including sea level rise, extreme weather, and ecosystem disruption.',
    category: 'environment',
  },
  {
    id: 'space-1',
    title: 'Mars Exploration',
    content:
      'Mars has been explored by numerous spacecraft including rovers (Curiosity, Perseverance), orbiters, and landers. Evidence suggests Mars once had liquid water and a thicker atmosphere. Current research focuses on searching for signs of ancient microbial life, studying Martian geology, and preparing for future human missions. SpaceX and NASA plan crewed missions in the 2030s-2040s.',
    category: 'space',
  },
];

// ─────────────────────────────────────────────────────────────
// Parameter schemas (ObjectSchema literals — parse + jsonSchema)
// ─────────────────────────────────────────────────────────────

/** Parsed parameters for `search_knowledge_base`. */
interface SearchParams {
  query: string;
  maxResults: number;
}

const searchParameters: ObjectSchema<SearchParams> = {
  parse: (value: unknown): SearchParams => {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Expected an object with a "query" field');
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.query !== 'string' || !obj.query) {
      throw new Error('"query" must be a non-empty string');
    }
    return {
      query: obj.query,
      maxResults: typeof obj.maxResults === 'number' ? obj.maxResults : 3,
    };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      maxResults: { type: 'number', description: 'Maximum results to return (default: 3)' },
    },
    required: ['query'],
  },
  description: 'Knowledge-base search parameters',
};

/** Parsed parameters for `calculate`. */
interface CalculateParams {
  expression: string;
}

const calculateParameters: ObjectSchema<CalculateParams> = {
  parse: (value: unknown): CalculateParams => {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Expected an object with an "expression" field');
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.expression !== 'string' || !obj.expression) {
      throw new Error('"expression" must be a non-empty string');
    }
    return { expression: obj.expression };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Mathematical expression to evaluate' },
    },
    required: ['expression'],
  },
  description: 'Calculation parameters',
};

/** Parsed parameters for `summarize`. */
interface SummarizeParams {
  text: string;
  maxLength: number;
}

const summarizeParameters: ObjectSchema<SummarizeParams> = {
  parse: (value: unknown): SummarizeParams => {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Expected an object with a "text" field');
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.text !== 'string' || !obj.text) {
      throw new Error('"text" must be a non-empty string');
    }
    return {
      text: obj.text,
      maxLength: typeof obj.maxLength === 'number' ? obj.maxLength : 100,
    };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to summarize' },
      maxLength: { type: 'number', description: 'Maximum summary length in tokens (default: 100)' },
    },
    required: ['text'],
  },
  description: 'Summarization parameters',
};

// ─────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────

/** Lazily-created summarizer, shared across `summarize` tool calls. */
let summarizerModel: SummarizationModel | null = null;

/** search_knowledge_base — keyword search over the static corpus. */
const searchKnowledgeBaseTool: ToolDefinition = {
  name: 'search_knowledge_base',
  description:
    'Search for information on a topic. Returns relevant article snippets from a built-in knowledge base covering quantum computing, biology, genetics, AI, climate, and space.',
  parameters: searchParameters,
  execute: async (params) => {
    const { query, maxResults } = searchParameters.parse(params);
    const queryWords = query.toLowerCase().split(/\s+/);

    const scored = AGENT_KNOWLEDGE_BASE.map((article) => {
      const text = `${article.title} ${article.content}`.toLowerCase();
      const score = queryWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
      return { article, score };
    });

    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.article);

    if (results.length === 0) {
      return 'No relevant articles found. Try different search terms.';
    }

    return results.map((r) => `[${r.title}] (${r.category})\n${r.content}`).join('\n\n');
  },
};

/**
 * calculate — sanitized math-expression evaluation. The expression is reduced
 * to a strict character allowlist (digits, `+ - * / ( ) . %`, whitespace)
 * BEFORE evaluation, so no identifiers, property access, or function calls can
 * survive into the evaluated string (never eval of arbitrary code).
 */
const calculateTool: ToolDefinition = {
  name: 'calculate',
  description: 'Evaluate a mathematical expression. Returns the numeric result.',
  parameters: calculateParameters,
  execute: async (params) => {
    const { expression } = calculateParameters.parse(params);
    try {
      // Allowlist: digits, operators, parentheses, decimal points, %, whitespace.
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      if (!sanitized.trim()) {
        return 'Invalid expression. Use numbers and operators: + - * / ( ) %';
      }
      const result = new Function(`"use strict"; return (${sanitized});`)() as unknown;
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        return `Could not evaluate: ${expression}`;
      }
      return String(result);
    } catch {
      return `Could not evaluate: ${expression}`;
    }
  },
};

/**
 * summarize — lazily loads a `@localmode/transformers` summarizer INSIDE
 * execute (dynamic imports; the ~284MB DistilBART download happens only when
 * the agent first calls this tool — never on page or block load). The model
 * instance is reused across calls; failures return an actionable observation
 * string so the ReAct loop can recover instead of crashing the run.
 */
const summarizeTool: ToolDefinition = {
  name: 'summarize',
  description: 'Summarize a block of text into a shorter version.',
  parameters: summarizeParameters,
  execute: async (params, { abortSignal }) => {
    const { text, maxLength } = summarizeParameters.parse(params);
    try {
      const { summarize } = await import('@localmode/core');
      let model = summarizerModel;
      if (!model) {
        const { transformers } = await import('@localmode/transformers');
        model = transformers.summarizer('Xenova/distilbart-cnn-6-6');
        summarizerModel = model;
      }
      const result = await summarize({ model, text, maxLength, abortSignal });
      return result.summary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Summarization failed: ${msg}`;
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

/**
 * The Chat block's three built-in agent tools, in the order the agent system
 * prompt introduces them. Passed straight to `useAgent({ tools })`.
 */
export const AGENT_TOOLS: ToolDefinition[] = [searchKnowledgeBaseTool, calculateTool, summarizeTool];

/* ────────────────────────────── system prompt editor ────────────────────────────── */

/** The default assistant prompt. */
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

/** One selectable system-prompt preset. */
export interface SystemPromptPreset {
  /** Stable preset identifier. */
  id: string;
  /** Short visible label. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** The full system prompt applied on selection. */
  prompt: string;
}

/** Built-in presets — the default assistant prompt plus three focused modes. */
export const SYSTEM_PROMPT_PRESETS: readonly SystemPromptPreset[] = [
  {
    id: 'default',
    label: 'Helpful assistant',
    description: 'Balanced, general-purpose default',
    prompt: DEFAULT_SYSTEM_PROMPT,
  },
  {
    id: 'concise',
    label: 'Concise answers',
    description: 'Short, direct replies, no filler',
    prompt:
      'You are a helpful assistant. Keep every answer short and direct, at most three sentences unless the user explicitly asks for more detail.',
  },
  {
    id: 'coding',
    label: 'Coding assistant',
    description: 'Code-first answers with working examples',
    prompt:
      'You are an expert programming assistant. Answer with working, runnable code examples first, then a brief explanation. Prefer modern idioms and point out pitfalls.',
  },
  {
    id: 'teacher',
    label: 'Step-by-step teacher',
    description: 'Patient explanations that build up from basics',
    prompt:
      'You are a patient teacher. Explain concepts step by step, starting from first principles, using simple language and one concrete example per concept. Check understanding before moving on.',
  },
];

/** Props for {@link SystemPromptEditor}. */
export interface SystemPromptEditorProps {
  /** The current system prompt. */
  value: string;
  /** Fired with the new prompt on every edit or preset selection. */
  onChange: (v: string) => void;
}

/**
 * Editable system prompt with preset quick-picks. Selecting a preset replaces
 * the textarea value; free-form edits simply deselect all presets.
 */
export function SystemPromptEditor({ value, onChange }: SystemPromptEditorProps) {
  const presetOptions: Option[] = SYSTEM_PROMPT_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
  }));

  // A preset is "active" only while the textarea matches it exactly.
  const selectedId = SYSTEM_PROMPT_PRESETS.find((preset) => preset.prompt === value)?.id;

  const handlePresetSelect = (option: Option) => {
    const preset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === option.id);
    if (preset) onChange(preset.prompt);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">System prompt</span>
        <textarea
          aria-label="System prompt"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={DEFAULT_SYSTEM_PROMPT}
          spellCheck={false}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <div>
        <OptionList
          prompt="Presets"
          options={presetOptions}
          selectedId={selectedId}
          onSelect={handlePresetSelect}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────── custom model panel ────────────────────────────── */

/** Props for {@link CustomModelPanel}. */
export interface CustomModelPanelProps {
  /** Whether the panel is visible. */
  open: boolean;
  /** Fired when the panel asks to open/close (e.g. its close button). */
  onOpenChange: (open: boolean) => void;
  /** Pre-filled GGUF URL from the handoff (`?model=`). */
  initialUrl?: string;
  /** Pre-filled vision projector (mmproj) URL from the handoff. */
  initialMmproj?: string;
  /** Fired on the explicit Load action with the URL(s) to load via wllama `modelUrl`. */
  onLoad: (opts: { url: string; mmproj?: string }) => void;
  /** True while the block is loading the custom model (disables Load). */
  loading?: boolean;
}

const GB = 1024 * 1024 * 1024;

/** Round bytes to GB with one decimal for the compat card props. */
function toGB(bytes: number): number {
  return Math.round((bytes / GB) * 10) / 10;
}

/** Human-readable parameter count (e.g. '1.2B', '360M'). */
function formatParams(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  return `${Math.round(count / 1_000_000)}M`;
}

/** Best-effort display name for a GGUF URL (file name without extension). */
function nameFromUrl(url: string): string {
  const last = url.split('/').pop() ?? url;
  return last.replace(/\.gguf$/i, '') || url;
}

/**
 * URL input → inspect → compat verdict → explicit load, for arbitrary GGUF
 * models. Presentational + self-contained inspection state; the consuming
 * block owns the actual model load lifecycle.
 */
export function CustomModelPanel({
  open,
  onOpenChange,
  initialUrl,
  initialMmproj,
  onLoad,
  loading = false,
}: CustomModelPanelProps) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [mmproj, setMmproj] = useState(initialMmproj ?? '');
  const [inspecting, setInspecting] = useState(false);
  const [metadata, setMetadata] = useState<GGUFMetadata | null>(null);
  const [compat, setCompat] = useState<GGUFBrowserCompat | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** In-flight inspection abort handle (re-inspect / unmount cancels). */
  const abortRef = useRef<AbortController | null>(null);
  /** The handoff auto-inspect runs at most once per mount (never a load). */
  const autoInspectedRef = useRef(false);

  /** Inspect a GGUF URL: ~4KB header Range request + device compat check. */
  const runInspect = async (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInspecting(true);
    setMetadata(null);
    setCompat(null);
    setError(null);

    try {
      const meta = await parseGGUFMetadata(trimmed, { abortSignal: controller.signal });
      const verdict = await checkGGUFBrowserCompat(meta, { abortSignal: controller.signal });
      if (controller.signal.aborted) return;
      setMetadata(meta);
      setCompat(verdict);
    } catch (err) {
      if (controller.signal.aborted) return;
      // Surface wllama's error message verbatim — it is already actionable
      // (invalid GGUF magic, missing Range support, bad URL, network failure).
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) {
        setInspecting(false);
      }
    }
  };

  // Handoff arrival: pre-fill and auto-inspect ONCE when the
  // panel opens with an initialUrl. Metadata fetch only — never a model load.
  useEffect(() => {
    if (!open || !initialUrl || autoInspectedRef.current) return;
    autoInspectedRef.current = true;
    setUrl(initialUrl);
    if (initialMmproj) setMmproj(initialMmproj);
    void runInspect(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runInspect is stable per render; the ref guard makes this once-only
  }, [open, initialUrl, initialMmproj]);

  // Cancel any in-flight inspection on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (!open) return null;

  /** Editing the URL invalidates the previous verdict — it belongs to the old file. */
  const handleUrlChange = (next: string) => {
    setUrl(next);
    setMetadata(null);
    setCompat(null);
    setError(null);
  };

  const inspected = metadata !== null && compat !== null;
  const canRun = compat?.canRun === true;
  const loadDisabled = loading || inspecting || !inspected;

  const handleLoad = () => {
    const trimmed = url.trim();
    if (!trimmed || loadDisabled) return;
    const trimmedMmproj = mmproj.trim();
    onLoad({ url: trimmed, mmproj: trimmedMmproj ? trimmedMmproj : undefined });
  };

  return (
    <section
      aria-label="Load a custom GGUF model"
      className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="size-4" aria-hidden="true" />
            Custom GGUF model
          </h2>
          <p className="text-xs text-muted-foreground">
            Paste any GGUF file URL. Inspect fetches only a ~4KB header, no model download until
            you click Load.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close custom model panel"
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="url"
            aria-label="GGUF model URL"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim() && !inspecting) void runInspect(url);
            }}
            placeholder="https://huggingface.co/…/resolve/main/model-Q4_K_M.gguf"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={() => void runInspect(url)}
            disabled={!url.trim() || inspecting}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {inspecting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSearch className="size-4" aria-hidden="true" />
            )}
            {inspecting ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>

        <input
          type="url"
          aria-label="mmproj (vision projector) URL"
          value={mmproj}
          onChange={(e) => setMmproj(e.target.value)}
          placeholder="Optional mmproj (vision projector) GGUF URL"
          spellCheck={false}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      {error && (
        <div
          role="alert"
          aria-label="Custom model error"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words [overflow-wrap:anywhere]">{error}</span>
        </div>
      )}

      {metadata && (
        <dl
          className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
        >
          {(
            [
              ['Architecture', metadata.architecture],
              ['Parameters', formatParams(metadata.parameterCount)],
              ['Quantization', metadata.quantization],
              ['Context', metadata.contextLength.toLocaleString()],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-1.5"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {metadata && compat && (
        <div role="status" aria-label="Compatibility verdict">
          <BrowserCompatCard
            className="max-w-none"
            modelName={metadata.modelName ?? nameFromUrl(url)}
            requiredGB={toGB(compat.estimatedRAM)}
            // checkGGUFBrowserCompat assumes 4GB when navigator.deviceMemory is
            // unavailable (its warnings already say so) — mirror that here.
            deviceGB={compat.deviceRAM !== null ? toGB(compat.deviceRAM) : 4}
            availableStorageGB={
              compat.availableStorage !== null ? toGB(compat.availableStorage) : undefined
            }
            crossOriginIsolated={compat.hasCORS}
            estimatedSpeed={compat.estimatedSpeed}
            warnings={[...compat.warnings, ...compat.recommendations]}
            canRun={compat.canRun}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loadDisabled}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            inspected && !canRun
              ? 'border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {loading ? 'Loading model…' : inspected && !canRun ? 'Load anyway' : 'Load model'}
        </button>
        {inspected && !canRun && !loading && (
          <p className="text-xs text-muted-foreground">
            The compatibility check estimates this model will not run here - loading anyway may
            crash the tab. The estimate is a heuristic; you keep the final say.
          </p>
        )}
        {!inspected && !error && !inspecting && (
          <p className="text-xs text-muted-foreground">
            Inspect the URL first - Load unlocks after a successful metadata check.
          </p>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────── constants ────────────────────────────── */

/** The default model — preselected so the load → chat flow works out of the box. */
const DEFAULT_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/** localStorage keys for the persisted session (selection + generation prefs). */
const LS_MODEL = 'localmode-blocks-chat:model';
const LS_SYSTEM_PROMPT = 'localmode-blocks-chat:system-prompt';
const LS_TEMPERATURE = 'localmode-blocks-chat:temperature';
const LS_MAX_TOKENS = 'localmode-blocks-chat:max-tokens';
/** Per-model `useChat` persistKey prefix (messages restore per model on reload). */
const PERSIST_PREFIX = 'localmode-blocks-chat:messages:';

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1000;
const FALLBACK_CONTEXT_WINDOW = 4096;

/** Vision attachment limits (llm-chat parity). */
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Agent mode is gated to models of at least this size (llm-chat parity). */
const AGENT_MIN_BYTES = 500 * 1024 * 1024;

/** Semantic cache configuration (llm-chat's proven config). */
const CACHE_EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';
const CACHE_THRESHOLD = 0.92;
const CACHE_MAX_ENTRIES = 100;
const CACHE_TTL_MS = 3_600_000;

/** Human-readable provider names for the header badge. */
const BACKEND_LABELS: Record<ChatBackend, string> = {
  transformers: 'Transformers.js',
  webllm: 'WebLLM',
  wllama: 'wllama',
  litert: 'LiteRT',
};

/** ChatBackend → model-selector backend chip (drives filter tabs + WebGPU dimming). */
const SELECTOR_BACKEND: Record<ChatBackend, ModelBackend> = {
  transformers: 'onnx',
  webllm: 'webgpu',
  wllama: 'wasm',
  litert: 'litert',
};

const CATEGORY_ORDER: ChatModelEntry['category'][] = ['tiny', 'small', 'medium', 'large'];
const CATEGORY_LABELS: Record<ChatModelEntry['category'], string> = {
  tiny: 'Tiny · under 500 MB',
  small: 'Small · 0.5-2 GB',
  medium: 'Medium · 2-4 GB',
  large: 'Large · 4 GB+',
};

/* ─────────────────────────────── helpers ─────────────────────────────── */

/** Rough local token estimate: characters / 4 (used only before the first turn completes). */
function estimateTokens(charCount: number) {
  return Math.ceil(charCount / 4);
}

/** Short context-window label (4096 → "4K"). */
function ctxLabel(tokens: number) {
  return tokens >= 1024 ? `${Math.round(tokens / 1024)}K` : String(tokens);
}

/** SSR-safe localStorage read. */
function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** SSR-safe localStorage write (null removes the key). */
function lsSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort.
  }
}

/** Thinking/answer segments of a streamed reply. */
interface ThinkingSegments {
  /** Content inside `<think>…</think>` ('' when absent). */
  thinking: string;
  /** Everything outside the thinking delimiters. */
  answer: string;
  /** True while `<think>` is open but `</think>` has not streamed yet. */
  thinkingOpen: boolean;
}

/**
 * Segment `<think>…</think>` delimiters out of streamed text. Lossless: when
 * no delimiters appear the full text is the answer; while the tag is open the
 * partial thinking streams live.
 */
function segmentThinking(text: string): ThinkingSegments {
  const start = text.indexOf('<think>');
  if (start === -1) return { thinking: '', answer: text, thinkingOpen: false };
  const afterOpen = start + '<think>'.length;
  const end = text.indexOf('</think>', afterOpen);
  if (end === -1) {
    return {
      thinking: text.slice(afterOpen),
      answer: text.slice(0, start).trim(),
      thinkingOpen: true,
    };
  }
  return {
    thinking: text.slice(afterOpen, end).trim(),
    answer: (text.slice(0, start) + text.slice(end + '</think>'.length)).trim(),
    thinkingOpen: false,
  };
}

/** Derive a stable session model id from a custom GGUF URL (its basename). */
function deriveCustomModelId(url: string) {
  try {
    const base = new URL(url).pathname.split('/').pop() ?? url;
    return decodeURIComponent(base).replace(/\.gguf$/i, '') || url;
  } catch {
    return url;
  }
}

/** Convert `useChat` content into `MessageContent`-renderable parts (text + images). */
function toMessageParts(content: string | ContentPart[]): string | MessagePart[] {
  if (typeof content === 'string') return content;
  const parts: MessagePart[] = [];
  for (const part of content) {
    if (part.type === 'text') parts.push({ type: 'text', text: part.text });
    else if (part.type === 'image' && typeof part.data === 'string') {
      parts.push({ type: 'image', data: part.data, mimeType: part.mimeType });
    }
  }
  return parts;
}

/** The normalized active-model descriptor (catalog entry or custom GGUF URL). */
interface ActiveChatModel {
  /** `${backend}:${modelId}` — the `useModelLoad` key and persistKey suffix. */
  key: string;
  backend: ChatBackend;
  modelId: string;
  name: string;
  sizeLabel: string;
  sizeBytes?: number;
  contextLength?: number;
  category: string;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
  requiresWebGPU?: boolean;
  /** Set for custom GGUF URL models (wllama `modelUrl` mechanism). */
  customUrl?: string;
  mmprojUrl?: string;
  isCustom: boolean;
}

/** Build the active-model descriptor from a catalog entry. */
function toActiveModel(entry: ChatModelEntry): ActiveChatModel {
  return {
    key: `${entry.backend}:${entry.id}`,
    backend: entry.backend,
    modelId: entry.id,
    name: entry.name,
    sizeLabel: entry.sizeLabel,
    sizeBytes: entry.sizeBytes,
    contextLength: entry.contextLength,
    category: CATEGORY_LABELS[entry.category],
    supportsVision: entry.supportsVision,
    supportsTools: entry.supportsTools,
    supportsReasoning: entry.supportsReasoning,
    requiresWebGPU: entry.requiresWebGPU,
    isCustom: false,
  };
}

/** Bridge state lifted from the `CacheHost` (which owns `useSemanticCache`). */
interface CacheBridgeState {
  cache: SemanticCache | null;
  stats: CacheStats;
  isLoading: boolean;
  error: Error | null;
  refreshStats: () => void;
  clear: () => Promise<{ entriesRemoved: number }>;
}

/** A completed (or aborted) agent run in the session-only agent transcript. */
interface AgentRunRecord {
  id: string;
  prompt: string;
  steps: TimelineAgentStep[];
  result: string;
  finishReason: AgentFinishReason;
}

type ChatPhase = 'unloaded' | 'loading' | 'ready' | 'generating' | 'error';

/** Small status pill summarizing the chat phase with a colored dot. */
function StatusPill({ phase, progress }: { phase: ChatPhase; progress: number }) {
  const config: Record<ChatPhase, { dot: string; label: string; pulse?: boolean }> = {
    unloaded: { dot: 'bg-muted-foreground/50', label: 'Not loaded' },
    loading: { dot: 'bg-amber-500', label: `Loading ${(progress * 100).toFixed(0)}%`, pulse: true },
    ready: { dot: 'bg-emerald-500', label: 'Ready' },
    generating: { dot: 'bg-primary', label: 'Generating…', pulse: true },
    error: { dot: 'bg-destructive', label: 'Error' },
  };
  const { dot, label, pulse } = config[phase];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

/* ─────────────────────────────── ChatBlock ────────────────────────────── */

export function ChatBlock() {
  // WebGPU must be probed via requestAdapter(): headless/CI Chromium and some
  // Linux setups expose `navigator.gpu` with zero adapters, and provider
  // auto-detection would then pick webgpu and fail the load outright. The
  // probe result drives the selector's WebLLM dimming; the litert Gemma 4 gate
  // does its own detection inside `capability-gate` (belt) with the provider
  // fail-fast as suspenders.
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  useEffect(() => {
    let alive = true;
    void isWebGPUSupported().then((ok) => {
      if (alive) setDevice(ok ? 'webgpu' : 'wasm');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!device) return null;
  return <ChatBlockInner hasWebGPU={device === 'webgpu'} />;
}

/** Reads the gguf-explorer handoff query params (`model`, `mmproj`) once. */
function HandoffReceiver({
  onHandoff,
}: {
  onHandoff: (handoff: { url: string; mmproj?: string }) => void;
}) {
  const searchParams = useSearchParams();
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const url = searchParams.get('model');
    if (url) onHandoff({ url, mmproj: searchParams.get('mmproj') ?? undefined });
  }, [searchParams, onHandoff]);
  return null;
}

/**
 * Owns `useSemanticCache` — mounted only while the cache is enabled AND keyed
 * by the active model, so toggling off destroys the cache and a model switch
 * clears it (fresh instance). Mounting warms the embedding model with one real
 * embed so the explicit toggle-on action performs (and surfaces) the download.
 */
function CacheHost({ onBridge }: { onBridge: (bridge: CacheBridgeState | null) => void }) {
  // Created once, client-only (CacheHost never renders during SSR — it mounts
  // behind a user toggle). Shared between the cache and the warmup embed.
  const embeddingModelRef = useRef<EmbeddingModel | null>(null);
  if (embeddingModelRef.current === null) {
    embeddingModelRef.current = transformers.embedding(CACHE_EMBEDDING_MODEL_ID);
  }

  const { cache, stats, isLoading, error, refreshStats, clear } = useSemanticCache({
    embeddingModel: embeddingModelRef.current,
    threshold: CACHE_THRESHOLD,
    maxEntries: CACHE_MAX_ENTRIES,
    ttlMs: CACHE_TTL_MS,
  });

  // Warm the embedding model so enabling the cache visibly downloads it now
  // (explicit user action) instead of stalling the first store() later.
  const [warming, setWarming] = useState(true);
  useEffect(() => {
    const embeddingModel = embeddingModelRef.current;
    if (!embeddingModel) return;
    let alive = true;
    void (async () => {
      try {
        await embed({ model: embeddingModel, value: 'warmup' });
      } catch {
        // Download/initialization failures surface via the first lookup.
      }
      if (alive) setWarming(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // `refreshStats`/`clear` from useSemanticCache are re-created per render —
  // route them through a ref so the published bridge only changes on data.
  const apiRef = useRef({ refreshStats, clear });
  apiRef.current = { refreshStats, clear };
  const stableApiRef = useRef({
    refreshStats: () => apiRef.current.refreshStats(),
    clear: (filter?: { modelId?: string }) => apiRef.current.clear(filter),
  });

  const loading = isLoading || warming;
  useEffect(() => {
    onBridge({
      cache,
      stats,
      isLoading: loading,
      error,
      refreshStats: stableApiRef.current.refreshStats,
      clear: stableApiRef.current.clear,
    });
  }, [cache, stats, loading, error, onBridge]);

  useEffect(() => () => onBridge(null), [onBridge]);

  return null;
}

const EMPTY_CACHE_STATS: CacheStats = {
  entries: 0,
  hits: 0,
  misses: 0,
  hitRate: 0,
  oldestEntryMs: null,
  newestEntryMs: null,
};

/* ──────────────────────────── ChatBlockInner ──────────────────────────── */

/** The orchestrator: catalog + selection + prefs + gating + layout. */
function ChatBlockInner({ hasWebGPU }: { hasWebGPU: boolean }) {
  const [catalog] = useState(() => getChatCatalog());

  // ── selection (persisted; degrades to the default model, then to unselected) ──
  const [active, setActive] = useState<ActiveChatModel | null>(() => {
    const persistedId = lsGet(LS_MODEL);
    if (persistedId) {
      const entry = catalog.find((e) => e.id === persistedId);
      // Backend resolves from the id even before any async cache check —
      // `inferBackendFromModelId` validates the persisted id's provenance.
      if (entry && (entry.backend === (inferBackendFromModelId(persistedId) ?? entry.backend))) {
        return toActiveModel(entry);
      }
      // Persisted selection no longer in the catalog → degrade to default.
    }
    const fallback =
      catalog.find((e) => e.id === DEFAULT_MODEL_ID) ??
      catalog.find((e) => e.backend === 'transformers') ??
      catalog[0];
    return fallback ? toActiveModel(fallback) : null;
  });

  useEffect(() => {
    if (active && !active.isCustom) lsSet(LS_MODEL, active.modelId);
    else if (!active) lsSet(LS_MODEL, null);
  }, [active]);

  // ── persisted generation prefs ──
  const [systemPrompt, setSystemPrompt] = useState(() => lsGet(LS_SYSTEM_PROMPT) ?? '');
  const [temperature, setTemperature] = useState(() => {
    const raw = Number(lsGet(LS_TEMPERATURE));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TEMPERATURE;
  });
  const [maxTokens, setMaxTokens] = useState(() => {
    const raw = Number(lsGet(LS_MAX_TOKENS));
    return Number.isFinite(raw) && raw >= 64 ? Math.round(raw) : DEFAULT_MAX_TOKENS;
  });
  useEffect(() => lsSet(LS_SYSTEM_PROMPT, systemPrompt), [systemPrompt]);
  useEffect(() => lsSet(LS_TEMPERATURE, String(temperature)), [temperature]);
  useEffect(() => lsSet(LS_MAX_TOKENS, String(maxTokens)), [maxTokens]);

  // ── per-model cache status ──
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [manageError, setManageError] = useState<string | null>(null);

  const refreshCached = async () => {
    const entries = await Promise.all(
      catalog.map(async (e) => {
        try {
          return [e.id, await isChatModelCached(e.backend, e.id)] as const;
        } catch {
          return [e.id, false] as const;
        }
      })
    );
    setCachedMap(Object.fromEntries(entries));
  };
  // Cache-status probes are metadata-scale (no model bytes) — safe on mount.
  useEffect(() => {
    void refreshCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── single-active-model lifecycle ──
  const activeInstanceRef = useRef<{ key: string; backend: ChatBackend; model: LanguageModel } | null>(null);
  // `useModelLoad`'s module registry never forgets a key (entries are
  // singletons that survive remount), but this block disposes the previous
  // model instance on switch — so re-selecting a previously loaded model
  // would resurface a stale 'ready' registry entry holding the DEAD instance
  // and never render the explicit Load affordance again. Every dispose bumps
  // a per-key generation; the generation is suffixed onto the useModelLoad
  // key so the next mount of that model gets a fresh registry entry (fresh
  // create + explicit load). Never-disposed keys keep the plain key, so the
  // single-model flow is byte-identical.
  const [loadGenerations, setLoadGenerations] = useState<Record<string, number>>({});
  const registerInstance = (key: string, backend: ChatBackend, model: LanguageModel) => {
    activeInstanceRef.current = { key, backend, model };
  };
  const disposePrevious = (nextKey: string | null) => {
    const prev = activeInstanceRef.current;
    if (prev && prev.key !== nextKey) {
      activeInstanceRef.current = null;
      setLoadGenerations((gens) => ({ ...gens, [prev.key]: (gens[prev.key] ?? 0) + 1 }));
      void disposeChatModel(prev.backend, prev.model).catch(() => {
        // Best-effort teardown — the next load proceeds regardless.
      });
    }
  };

  // Key whose next ChatLab mount starts with a cleared conversation (set on
  // every user-initiated switch; the reload-restore path never sets it).
  const [freshKey, setFreshKey] = useState<string | null>(null);
  // Key allowed to auto-start its load (set only by explicit download/Load actions).
  const [autoLoadKey, setAutoLoadKey] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string>('idle');

  const handleSelect = (id: string, opts?: { autoLoad?: boolean }) => {
    const entry = catalog.find((e) => e.id === id);
    if (!entry) return;
    const next = toActiveModel(entry);
    if (active?.key === next.key) return;
    disposePrevious(next.key);
    setActive(next);
    setFreshKey(next.key);
    setAutoLoadKey(opts?.autoLoad && !(entry.requiresWebGPU && !hasWebGPU) ? next.key : null);
    setManageError(null);
  };

  const handleDelete = async (id: string) => {
    const entry = catalog.find((e) => e.id === id);
    if (!entry) return;
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await deleteChatModelCache(entry.backend, id);
      setManageError(null);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    if (active && !active.isCustom && active.modelId === id) {
      // Deleting the selected model resets the selection and clears its conversation.
      disposePrevious(null);
      setActive(null);
      setFreshKey(`${entry.backend}:${id}`);
      setAutoLoadKey(null);
    }
    void refreshCached();
  };

  // Refresh cache badges once a load reaches ready (the model is now cached).
  useEffect(() => {
    if (activeStatus === 'ready') void refreshCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus]);

  // ── custom GGUF URL + gguf-explorer handoff ──
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [handoff, setHandoff] = useState<{ url: string; mmproj?: string } | null>(null);
  const handleHandoff = (h: { url: string; mmproj?: string }) => {
    // Pre-fill and open the panel; metadata inspection may run, the model NEVER auto-loads.
    setHandoff(h);
    setCustomPanelOpen(true);
  };
  const handleCustomLoad = ({ url, mmproj }: { url: string; mmproj?: string }) => {
    const modelId = deriveCustomModelId(url);
    const key = `wllama:${modelId}`;
    disposePrevious(key);
    setActive({
      key,
      backend: 'wllama',
      modelId,
      name: modelId,
      sizeLabel: 'Custom GGUF',
      category: 'Custom',
      supportsVision: Boolean(mmproj),
      customUrl: url,
      mmprojUrl: mmproj,
      isCustom: true,
    });
    setFreshKey(key);
    // The panel's Load button IS the explicit load action.
    setAutoLoadKey(key);
    setCustomPanelOpen(false);
  };

  // ── agent mode gating (≥500MB, auto-disable on smaller-model switch) ──
  const [agentMode, setAgentMode] = useState(false);
  const agentCapable = !!active && (active.sizeBytes ?? 0) >= AGENT_MIN_BYTES;
  const agentReason = !active
    ? 'Select a model first.'
    : active.sizeBytes == null
      ? 'Agent mode needs a model of at least 500 MB (unknown size selected).'
      : active.sizeBytes < AGENT_MIN_BYTES
        ? `Agent mode needs a model of at least 500 MB - ${active.name} is ${active.sizeLabel}.`
        : null;
  useEffect(() => {
    if (agentMode && !agentCapable) setAgentMode(false);
  }, [agentMode, agentCapable]);

  // ── semantic cache ──
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheBridge, setCacheBridge] = useState<CacheBridgeState | null>(null);

  // ── slash-command focus targets ──
  const modelPanelRef = useRef<HTMLDivElement | null>(null);
  const promptEditorRef = useRef<HTMLDivElement | null>(null);
  const focusInto = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    ref.current?.focus();
  };

  // ── selector view-model ──
  const selectorModels: SelectableModel[] = [...catalog]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .map((e) => ({
      id: e.id,
      name: e.name,
      backend: SELECTOR_BACKEND[e.backend],
      category: CATEGORY_LABELS[e.category],
      size: [
        BACKEND_LABELS[e.backend],
        e.sizeLabel,
        e.contextLength ? `${ctxLabel(e.contextLength)} ctx` : null,
        e.supportsReasoning ? 'reasoning' : null,
        e.requiresWebGPU ? 'WebGPU-only' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      vision: e.supportsVision,
      tools: e.supportsTools,
      cached: cachedMap[e.id] ?? false,
    }));
  const cachedCount = catalog.filter((e) => cachedMap[e.id]).length;
  const qwenFallbackEntry = catalog.find((e) => e.backend === 'litert' && !e.requiresWebGPU);

  // Fresh registry entry after a dispose (see loadGenerations above).
  const activeGeneration = active ? (loadGenerations[active.key] ?? 0) : 0;
  const activeLoadKey = active
    ? activeGeneration > 0
      ? `${active.key}#gen${activeGeneration}`
      : active.key
    : null;

  const chatArea = active ? (
    <ChatModel
      key={activeLoadKey ?? active.key}
      loadKey={activeLoadKey ?? active.key}
      active={active}
      device={hasWebGPU ? 'webgpu' : 'wasm'}
      autoLoad={autoLoadKey === active.key}
      freshStart={freshKey === active.key}
      systemPrompt={systemPrompt}
      temperature={temperature}
      maxTokens={maxTokens}
      agentMode={agentMode}
      agentCapable={agentCapable}
      agentReason={agentReason}
      onAgentModeChange={setAgentMode}
      cacheEnabled={cacheEnabled}
      cacheBridge={cacheBridge}
      onToggleCache={() => setCacheEnabled((v) => !v)}
      onFocusModelPicker={() => focusInto(modelPanelRef)}
      onFocusSystemPrompt={() => focusInto(promptEditorRef)}
      onInstance={registerInstance}
      onStatusChange={setActiveStatus}
    />
  ) : null;

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Suspense fallback={null}>
        <HandoffReceiver onHandoff={handleHandoff} />
      </Suspense>

      {/* Environment + selection chrome */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex">
          <NetworkBadge />
        </span>
        {active && (
          <span role="status" aria-label="Active provider" className="inline-flex">
            <ProviderFallbackBadge
              tier="download"
              providerName={BACKEND_LABELS[active.backend]}
              hideThreading={active.backend !== 'wllama'}
              crossOriginIsolated={active.backend === 'wllama' ? isCrossOriginIsolated() : undefined}
            />
          </span>
        )}
        <span role="status" aria-label="Selected model" className="sr-only">
          {active ? active.key : 'none'}
        </span>
        <button
          type="button"
          onClick={() => setCustomPanelOpen(true)}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Link2 className="size-3.5" />
          Custom GGUF URL
        </button>
      </div>

      <div role="region" aria-label="Custom GGUF model loader" data-open={customPanelOpen || undefined}>
        <CustomModelPanel
          open={customPanelOpen}
          onOpenChange={setCustomPanelOpen}
          initialUrl={handoff?.url}
          initialMmproj={handoff?.mmproj}
          onLoad={handleCustomLoad}
          loading={active?.isCustom === true && activeStatus === 'loading'}
        />
      </div>

      {/* Top: control grid - left = models + generation, right = system prompt + cache */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── left column: models + generation ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <div
            ref={modelPanelRef}
            tabIndex={-1}
            role="region"
            aria-label="Models"
            className="flex flex-col gap-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 rounded-xl"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Models
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{cachedCount} cached</span>
                <button
                  type="button"
                  aria-label="Refresh cache status"
                  onClick={() => void refreshCached()}
                  className="rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </span>
            </div>
            <ModelSelector
              models={selectorModels}
              selectedId={active && !active.isCustom ? active.modelId : undefined}
              hasWebGPU={hasWebGPU}
              busyIds={busyIds}
              onSelect={(id) => handleSelect(id)}
              onDownload={(id) => handleSelect(id, { autoLoad: true })}
              onDelete={(id) => void handleDelete(id)}
              className="max-h-96 max-w-none overflow-y-auto"
            />
            {manageError && (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
              >
                {manageError}
              </p>
            )}
            {/* sr-only per-entry driver mirror (the selector primitive exposes no per-row testids) */}
            <ul role="list" aria-label="Model catalog mirror" className="sr-only">
              {catalog.map((e) => (
                <li
                  key={e.id}
                  data-model-id={e.id}
                  data-backend={e.backend}
                  data-cached={cachedMap[e.id] ? 'true' : 'false'}
                  data-vision={e.supportsVision ? 'true' : 'false'}
                  data-tools={e.supportsTools ? 'true' : 'false'}
                  data-reasoning={e.supportsReasoning ? 'true' : 'false'}
                  data-requires-webgpu={e.requiresWebGPU ? 'true' : 'false'}
                >
                  {e.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 pb-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Generation
            </span>
            <div>
              <ParameterSlider
                label="Temperature"
                value={temperature}
                onChange={setTemperature}
                min={0}
                max={2}
                step={0.1}
                precision={1}
              />
            </div>
            <div>
              <ParameterSlider
                label="Max tokens"
                value={maxTokens}
                onChange={(v) => setMaxTokens(Math.round(v))}
                min={64}
                max={4096}
                step={64}
                unit="tokens"
              />
            </div>
          </div>
        </div>

        {/* ── right column: system prompt + semantic cache ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* The editor sub-component owns the `system-prompt-editor` testid
              at its root — the wrapper deliberately carries none (unique-id
              driver contract). */}
          <div
            ref={promptEditorRef}
            tabIndex={-1}
            className="rounded-xl border border-border bg-card p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <SystemPromptEditor value={systemPrompt} onChange={setSystemPrompt} />
          </div>

          <div role="region" aria-label="Semantic cache" className="flex flex-col gap-1.5">
            <SemanticCacheStatusBar
              stats={cacheBridge?.stats ?? EMPTY_CACHE_STATS}
              enabled={cacheEnabled && !agentMode}
              isLoading={cacheEnabled && (cacheBridge?.isLoading ?? true) && !agentMode}
              onToggle={(next) => {
                if (!agentMode) setCacheEnabled(next);
              }}
              onClear={() => void cacheBridge?.clear()}
            />
            <p className="px-1 text-[11px] text-muted-foreground">
              {agentMode
                ? 'Semantic cache is unavailable in agent mode.'
                : cacheEnabled
                  ? 'Semantically similar prompts are answered from the on-device cache. Cleared on model switch.'
                  : `Enabling downloads the ${CACHE_EMBEDDING_MODEL_ID} embedding model (one-time, on-device).`}
            </p>
            {/* 'on' asserts a USABLE cache: instance present, loading done, no
                error. A failed creation must surface as 'error' (with the
                cause in the error testid), never masquerade as 'on' while
                sends silently bypass the middleware. */}
            <span role="status" aria-label="Semantic cache state" className="sr-only">
              {agentMode
                ? 'agent-disabled'
                : cacheEnabled
                  ? cacheBridge?.error
                    ? 'error'
                    : cacheBridge?.isLoading !== false || !cacheBridge?.cache
                      ? 'loading'
                      : 'on'
                  : 'off'}
            </span>
          </div>
        </div>
      </div>

      {/* Chat panel: full width, below the control grid */}
      <div className="min-w-0">
        {active ? (
          active.requiresWebGPU ? (
            <CapabilityGate
              requires="webgpu"
              fallback={
                <div
                  role="status"
                  aria-label="Model gate"
                  className="flex h-[34rem] w-full flex-col items-center justify-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 text-center"
                >
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    WebGPU required
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {active.name} is a GPU-compiled LiteRT build and only runs with WebGPU,
                    which this browser or device does not expose. It cannot fall back to CPU.
                  </p>
                  {qwenFallbackEntry && (
                    <button
                      type="button"
                      onClick={() => handleSelect(qwenFallbackEntry.id)}
                      className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Use {qwenFallbackEntry.name} instead (runs on CPU)
                    </button>
                  )}
                </div>
              }
            >
              {chatArea}
            </CapabilityGate>
          ) : (
            chatArea
          )
        ) : (
          <div
            className="flex h-[34rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center"
          >
            <Bot className="size-8 text-muted-foreground" />
            <p className="font-medium">Pick a model to start chatting</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Choose one of the curated models above, or load any GGUF by URL.
              Everything runs locally. No server, no API key.
            </p>
          </div>
        )}
      </div>

      {cacheEnabled && active && <CacheHost key={active.key} onBridge={setCacheBridge} />}
    </div>
  );
}

/* ─────────────────────────────── ChatModel ────────────────────────────── */

/** Shared props flowing from the orchestrator into the per-model chat card. */
interface ChatSessionProps {
  active: ActiveChatModel;
  /** Adapter-probed device for the transformers backend (headless-safety). */
  device: 'webgpu' | 'wasm';
  freshStart: boolean;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  agentMode: boolean;
  agentCapable: boolean;
  agentReason: string | null;
  onAgentModeChange: (on: boolean) => void;
  cacheEnabled: boolean;
  cacheBridge: CacheBridgeState | null;
  onToggleCache: () => void;
  onFocusModelPicker: () => void;
  onFocusSystemPrompt: () => void;
  onInstance: (key: string, backend: ChatBackend, model: LanguageModel) => void;
  onStatusChange: (status: string) => void;
}

/**
 * Binds `useModelLoad` for the active model — keyed `${backend}:${modelId}`,
 * created through the block-local catalog service (`createChatLanguageModel`),
 * with the provider cache probe and reasoning/custom-URL/mmproj settings.
 */
function ChatModel(props: ChatSessionProps & { autoLoad: boolean; loadKey: string }) {
  const { active, device, autoLoad, loadKey, onInstance, onStatusChange } = props;

  const modelLoad = useModelLoad<LanguageModel>({
    // `${backend}:${modelId}` plus a `#gen<n>` suffix after a dispose — a
    // disposed instance must never be resurfaced from the registry.
    key: loadKey,
    create: (onProgress) =>
      createChatLanguageModel({
        backend: active.backend,
        modelId: active.modelId,
        // Providers emit the AnyLoadProgress-compatible shape useModelLoad
        // normalizes; the catalog contract keeps the param `unknown`.
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
        device,
        ...(active.customUrl ? { customUrl: active.customUrl } : {}),
        ...(active.mmprojUrl ? { mmprojUrl: active.mmprojUrl } : {}),
        ...(active.supportsReasoning ? { enableReasoning: true } : {}),
      }),
    isCached: () => isChatModelCached(active.backend, active.modelId),
    autoLoad,
  });

  useEffect(() => {
    onStatusChange(modelLoad.status);
  }, [modelLoad.status, onStatusChange]);

  // DevTools instrumentation (the wiring layer's job):
  // surface the provider model-load lifecycle on the core event bus so the
  // blocks devtools drawer's Models/Events surfaces observe real loads —
  // nothing in core or the providers emits `modelLoad` (it exists only in the
  // core event map), so the block emits it at the lifecycle source. No
  // devtools dependency and no guard needed: with no subscribers (devtools
  // never enabled) `globalEventBus.emit` is a no-op.
  const loadStartedAtRef = useRef<number | null>(null);
  const loadSettledRef = useRef(false);
  useEffect(() => {
    if (modelLoad.status === 'loading') {
      if (loadStartedAtRef.current === null) loadStartedAtRef.current = performance.now();
      return;
    }
    if (loadSettledRef.current) return;
    if (modelLoad.status === 'ready') {
      loadSettledRef.current = true;
      globalEventBus.emit('modelLoad', {
        modelId: active.modelId,
        durationMs: Math.round(
          performance.now() - (loadStartedAtRef.current ?? performance.now()),
        ),
      });
    } else if (modelLoad.status === 'error') {
      loadSettledRef.current = true;
      globalEventBus.emit('modelLoadError', {
        modelId: active.modelId,
        error: modelLoad.error ?? new Error('model load failed'),
      });
    }
  }, [modelLoad.status, modelLoad.error, active.modelId]);

  // Register the live instance for dispose-on-switch.
  useEffect(() => {
    if (modelLoad.model) onInstance(active.key, active.backend, modelLoad.model);
  }, [modelLoad.model, active.key, active.backend, onInstance]);

  // useModelLoad creates the model instance in a client mount effect, so it is
  // null for exactly one pre-hydration tick — render nothing for that tick so
  // useChat always receives a real LanguageModel.
  if (!modelLoad.model) return null;
  return <ChatLab {...props} modelLoad={modelLoad} model={modelLoad.model} />;
}

/* ──────────────────────────────── ChatLab ─────────────────────────────── */

function ChatLab({
  active,
  modelLoad,
  model,
  freshStart,
  systemPrompt,
  temperature,
  maxTokens,
  agentMode,
  agentCapable,
  agentReason,
  onAgentModeChange,
  cacheEnabled,
  cacheBridge,
  onToggleCache,
  onFocusModelPicker,
  onFocusSystemPrompt,
}: ChatSessionProps & {
  modelLoad: UseModelLoadReturn<LanguageModel>;
  model: LanguageModel;
}) {
  const { status: modelStatus, progress, cached, error: loadError, load } = modelLoad;

  // ── semantic cache wrapping (unavailable in agent mode) ──
  const activeCache = cacheEnabled && !agentMode ? (cacheBridge?.cache ?? null) : null;
  const chatModel = activeCache
    ? wrapLanguageModel({ model, middleware: semanticCacheMiddleware(activeCache) })
    : model;

  const {
    messages,
    isStreaming,
    error: chatError,
    usage,
    totalUsage,
    status,
    streamingMessageId,
    variants,
    variantIndex,
    setVariantIndex,
    send,
    cancel,
    regenerate,
    clearMessages,
    setSystemPrompt,
  } = useChat({
    model: chatModel,
    systemPrompt,
    maxTokens,
    temperature,
    persist: true,
    persistKey: `${PERSIST_PREFIX}${active.key}`,
  });

  // Apply system-prompt edits made after mount to subsequent generations.
  useEffect(() => {
    setSystemPrompt(systemPrompt);
  }, [systemPrompt, setSystemPrompt]);

  // ── fresh start on user-initiated model switch ──
  // The persisted-messages load is async, so clear again if it repopulates
  // before the user's first interaction on this mount.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    if (!freshStart || userInteractedRef.current) return;
    if (messages.length > 0) clearMessages();
  }, [freshStart, messages, clearMessages]);

  // Local flag so the status can keep showing 'regenerating' (the hook's
  // lifecycle status reports regeneration as submitted/streaming).
  const [isRegenerating, setIsRegenerating] = useState(false);

  // ── agent mode ──
  const agent = useAgent({
    model,
    tools: AGENT_TOOLS,
    maxSteps: 6,
    temperature: 0,
    systemPrompt: AGENT_SYSTEM_PROMPT,
  });
  const agentStepsRef = useRef(agent.steps);
  agentStepsRef.current = agent.steps;
  const [agentHistory, setAgentHistory] = useState<AgentRunRecord[]>([]);
  const [currentAgentPrompt, setCurrentAgentPrompt] = useState<string | null>(null);
  const agentRunning = agentMode && agent.isRunning;

  const runAgentTurn = async (prompt: string) => {
    setCurrentAgentPrompt(prompt);
    const res = await agent.run(prompt);
    if (res) {
      setAgentHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          prompt,
          steps: res.steps,
          result: res.result,
          finishReason: res.finishReason,
        },
      ]);
    } else if (agentStepsRef.current.length > 0) {
      // Cancelled mid-run — keep the partial trace, honestly labeled.
      setAgentHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          prompt,
          steps: agentStepsRef.current,
          result: '',
          finishReason: 'aborted',
        },
      ]);
    }
    setCurrentAgentPrompt(null);
  };

  // ── vision attachments ──
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const showAttachments = Boolean(active.supportsVision) && !agentMode;

  // Agent turns are text-only — drop composed attachments when agent mode turns on.
  useEffect(() => {
    if (agentMode) {
      setAttachments([]);
      setAttachmentError(null);
    }
  }, [agentMode]);

  const handleAttachmentsChange = (next: PromptAttachment[]) => {
    const problems: string[] = [];
    const valid: PromptAttachment[] = [];
    for (const att of next) {
      const label = att.name ?? 'image';
      if (!IMAGE_MIME_TYPES.includes(att.mimeType)) {
        problems.push(
          `"${label}" is ${att.mimeType || 'an unknown type'} - use JPEG, PNG, WebP, or GIF.`
        );
        continue;
      }
      const bytes = att.size ?? Math.floor(att.data.length * 0.75);
      if (bytes > MAX_IMAGE_BYTES) {
        problems.push(
          `"${label}" is ${(bytes / (1024 * 1024)).toFixed(1)} MB - the limit is 10 MB per image.`
        );
        continue;
      }
      if (valid.length >= MAX_IMAGES_PER_MESSAGE) {
        problems.push(
          `"${label}" was not added - at most ${MAX_IMAGES_PER_MESSAGE} images per message.`
        );
        continue;
      }
      valid.push(att);
    }
    setAttachments(valid);
    setAttachmentError(problems.length > 0 ? problems.join(' ') : null);
  };

  // ── cache-hit annotation (globalEventBus 'cacheHit' → cache-badge) ──
  const sendStartedRef = useRef<number | null>(null);
  const pendingHitRef = useRef<{ latencyMs: number } | null>(null);
  const [cacheHits, setCacheHits] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!cacheBridge?.cache) return;
    const unsubscribe = globalEventBus.on('cacheHit', () => {
      const started = sendStartedRef.current;
      pendingHitRef.current = {
        latencyMs: started != null ? Math.max(0, Math.round(performance.now() - started)) : 0,
      };
    });
    return unsubscribe;
  }, [cacheBridge?.cache]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  // Attach the pending hit to the answering message once the turn settles.
  useEffect(() => {
    if (status === 'ready' && pendingHitRef.current && lastAssistant) {
      const { latencyMs } = pendingHitRef.current;
      pendingHitRef.current = null;
      const id = lastAssistant.id;
      setCacheHits((prev) => ({ ...prev, [id]: latencyMs }));
      cacheBridge?.refreshStats();
    }
  }, [status, lastAssistant, cacheBridge]);

  // Refresh cache stats after each settled turn (store() is fire-and-forget).
  const bridgeRef = useRef(cacheBridge);
  bridgeRef.current = cacheBridge;
  useEffect(() => {
    if (status !== 'ready') return;
    const t1 = window.setTimeout(() => bridgeRef.current?.refreshStats(), 500);
    const t2 = window.setTimeout(() => bridgeRef.current?.refreshStats(), 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [status]);

  // ── reasoning duration measurement ──
  const thinkStartRef = useRef<Map<string, number>>(new Map());
  const [thinkDurations, setThinkDurations] = useState<Record<string, number>>({});
  const activeText = lastAssistant ? getTextContent(lastAssistant.content) : '';

  // A new turn/regeneration restarts the measurement for that message.
  useEffect(() => {
    if (status === 'submitted' && streamingMessageId) {
      thinkStartRef.current.delete(streamingMessageId);
      setThinkDurations((prev) => {
        if (!(streamingMessageId in prev)) return prev;
        const next = { ...prev };
        delete next[streamingMessageId];
        return next;
      });
    }
  }, [status, streamingMessageId]);

  useEffect(() => {
    if (!streamingMessageId || !isStreaming) return;
    const seg = segmentThinking(activeText);
    if (seg.thinkingOpen) {
      if (!thinkStartRef.current.has(streamingMessageId)) {
        thinkStartRef.current.set(streamingMessageId, performance.now());
      }
    } else if (seg.thinking) {
      const started = thinkStartRef.current.get(streamingMessageId);
      if (started != null && !(streamingMessageId in thinkDurations)) {
        setThinkDurations((prev) => ({
          ...prev,
          [streamingMessageId]: Math.round(performance.now() - started),
        }));
      }
    }
  }, [activeText, streamingMessageId, isStreaming, thinkDurations]);

  // ── composer + slash palette ──
  const [draft, setDraft] = useState('');
  const paletteOpen = draft.startsWith('/');

  const handleClear = () => {
    clearMessages();
    setAgentHistory([]);
    agent.reset();
    setCacheHits({});
    setThinkDurations({});
    thinkStartRef.current.clear();
  };

  const handleExport = () => {
    const payload = {
      block: 'chat',
      model: active.modelId,
      backend: active.backend,
      systemPrompt,
      temperature,
      maxTokens,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => {
        const text = getTextContent(m.content);
        const imageCount = Array.isArray(m.content)
          ? m.content.filter((p) => p.type === 'image').length
          : 0;
        return {
          role: m.role,
          // Copy/export operate on the answer text — thinking is display-only.
          content: m.role === 'assistant' ? segmentThinking(text).answer : text,
          ...(imageCount > 0 ? { images: imageCount } : {}),
          timestamp: m.timestamp,
        };
      }),
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `localmode-chat-${active.backend}-${Date.now()}.json`,
      'application/json'
    );
  };

  const slashCommands: SlashCommand[] = [
    { id: 'clear', name: 'clear', description: 'Clear the conversation', icon: Trash2 },
    { id: 'export', name: 'export', description: 'Export conversation as JSON', icon: FileJson },
    { id: 'system-prompt', name: 'system-prompt', description: 'Edit the system prompt', icon: PenLine },
    { id: 'model', name: 'model', description: 'Focus the model picker', icon: Boxes },
    {
      id: 'cache',
      name: 'cache',
      description: cacheEnabled
        ? 'Disable the semantic cache'
        : 'Enable the semantic cache (downloads the embedding model)',
      icon: Zap,
    },
  ];

  const runSlashCommand = (cmd: SlashCommand) => {
    switch (cmd.id) {
      case 'clear':
        handleClear();
        break;
      case 'export':
        handleExport();
        break;
      case 'system-prompt':
        onFocusSystemPrompt();
        break;
      case 'model':
        onFocusModelPicker();
        break;
      case 'cache':
        onToggleCache();
        break;
    }
    setDraft('');
  };

  // ── send / regenerate ──
  const handleSubmit = (text: string) => {
    if (paletteOpen || modelStatus !== 'ready') return;
    userInteractedRef.current = true;
    if (agentMode) {
      void runAgentTurn(text);
      return;
    }
    pendingHitRef.current = null;
    sendStartedRef.current = performance.now();
    const images = attachments.map((a) => ({ data: a.data, mimeType: a.mimeType, name: a.name }));
    setAttachments([]);
    setAttachmentError(null);
    void send(text, images.length > 0 ? { images } : undefined);
  };

  const handleRegenerate = async () => {
    if (isStreaming || isRegenerating || modelStatus !== 'ready' || agentMode) return;
    userInteractedRef.current = true;
    pendingHitRef.current = null;
    sendStartedRef.current = performance.now();
    setIsRegenerating(true);
    try {
      await regenerate(); // errors surface via the hook's error state
    } finally {
      setIsRegenerating(false);
    }
  };

  // The hook reflects the ACTIVE variant as the last assistant message's
  // content (it streams there during send AND regenerate), so render the live
  // content in the active branch slot and the frozen texts in the others.
  const branchTexts = variants.map((text, i) => (i === variantIndex ? activeText : text));
  const activeAnswer = segmentThinking(activeText).answer;

  // Token meter: real usage from the last completed turn when available. The
  // transformers streaming provider counts OUTPUT tokens for real but estimates
  // INPUT tokens as chars/4 — before the first turn completes, fall back to a
  // transcript-level chars/4 estimate.
  const contextWindow = active.contextLength ?? FALLBACK_CONTEXT_WINDOW;
  const fallbackChars = (role: 'assistant' | 'other') =>
    messages
      .filter((m) => (role === 'assistant' ? m.role === 'assistant' : m.role !== 'assistant'))
      .reduce((sum, m) => sum + getTextContent(m.content).length, 0);
  const meterInput = usage?.inputTokens ?? estimateTokens(fallbackChars('other'));
  const meterOutput = usage?.outputTokens ?? estimateTokens(fallbackChars('assistant'));
  const meterLabel = usage
    ? `Last turn · output measured, input estimated (chars/4) · session total ${totalUsage.totalTokens} tokens`
    : 'Estimated (chars/4) until the first reply completes';

  const busy = isStreaming || isRegenerating || agentRunning;
  const phase: ChatPhase =
    loadError || chatError || agent.error || cacheBridge?.error
      ? 'error'
      : modelStatus === 'loading'
        ? 'loading'
        : modelStatus !== 'ready'
          ? 'unloaded'
          : busy
            ? 'generating'
            : 'ready';

  // Raw state strings for the E2E driver (kept in sr-only spans below).
  const statusText =
    modelStatus === 'ready'
      ? agentRunning
        ? 'agent-running'
        : isRegenerating
          ? 'regenerating'
          : isStreaming
            ? 'streaming'
            : 'ready'
      : modelStatus === 'loading'
        ? `loading model ${(progress * 100).toFixed(0)}%`
        : modelStatus;
  // Surface the underlying cause chain plus the deepest actionable hint —
  // "Failed to load model: X" alone hides the actionable reason (core error
  // philosophy: what happened, why, how to fix). LocalModeError causes carry
  // `hint` (e.g. StructuredOutputError includes the raw model output).
  const withCause = (err: Error | null | undefined): string | null => {
    if (!err) return null;
    let text = err.message;
    let hint = (err as { hint?: string }).hint;
    for (
      let cause: unknown = err.cause;
      cause instanceof Error;
      cause = (cause as { cause?: unknown }).cause
    ) {
      if (!text.includes(cause.message)) text += ` - ${cause.message}`;
      const causeHint = (cause as { hint?: string }).hint;
      if (causeHint) hint = causeHint;
    }
    return hint && !text.includes(hint) ? `${text} - ${hint}` : text;
  };
  const errorText =
    withCause(loadError) ??
    withCause(chatError) ??
    withCause(agent.error) ??
    withCause(cacheBridge?.error) ??
    null;

  const composerStreaming = agentMode ? agent.isRunning : isStreaming;

  return (
    <div className="flex h-[34rem] w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      {/* Header: model identity + status + (load button | context budget) */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold leading-tight">{active.name}</span>
            {modelStatus === 'ready' && <StatusPill phase={phase} progress={progress} />}
          </div>
          <span
            className="block truncate font-mono text-[11px] text-muted-foreground"
            title={active.modelId}
          >
            {active.modelId}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {modelStatus !== 'ready' && (
            <button
              type="button"
              onClick={() => void load().catch(() => {})}
              disabled={modelStatus === 'loading'}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {modelStatus === 'loading' ? 'Loading…' : 'Load model'}
            </button>
          )}
          {modelStatus === 'ready' && (
            <div role="status" aria-label="Token usage" title={meterLabel} className="hidden sm:block">
              <Context
                usage={{ inputTokens: meterInput, outputTokens: meterOutput }}
                contextWindow={contextWindow}
              >
                <ContextTrigger />
              </Context>
            </div>
          )}
        </div>
      </header>

      {/* Toolbar: agent mode + conversation actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <button
          type="button"
          role="switch"
          aria-label="Agent mode"
          aria-checked={agentMode}
          disabled={!agentCapable}
          onClick={() => agentCapable && onAgentModeChange(!agentMode)}
          title={agentReason ?? 'ReAct agent over built-in tools (search · calculate · summarize)'}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
            agentMode
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground hover:bg-accent'
          }`}
        >
          <Sparkles className="size-3.5" />
          Agent mode
        </button>
        {agentMode ? (
          <span className="text-[11px] text-muted-foreground">
            search · calculate · summarize · session only, not persisted
          </span>
        ) : (
          agentReason && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {agentReason}
            </span>
          )
        )}
        <span role="status" aria-label="Agent mode state" className="sr-only">
          {agentMode ? 'on' : agentCapable ? 'off' : 'unavailable'}
        </span>
        <span role="status" aria-label="Agent run state" className="sr-only">
          {agent.isRunning ? 'running' : 'idle'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Export conversation as JSON"
            disabled={messages.length === 0}
            onClick={handleExport}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileJson className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Clear conversation"
            disabled={messages.length === 0 && agentHistory.length === 0 && currentAgentPrompt == null}
            onClick={handleClear}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* sr-only raw-state hooks for the E2E driver (no visible clutter). */}
      <span role="status" aria-label="Chat status" className="sr-only">
        {statusText}
      </span>
      <span role="status" aria-label="Model load status" className="sr-only">
        {modelStatus}
      </span>
      <span role="status" aria-label="Streaming state" className="sr-only">
        {isStreaming ? 'streaming' : 'idle'}
      </span>

      {errorText && (
        <p
          className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          {errorText}
        </p>
      )}

      {modelStatus === 'loading' && (
        <div className="border-b border-border p-4">
          <ModelLoadingPanel
            name={active.name}
            size={active.sizeLabel}
            contextLength={active.contextLength}
            category={active.category}
            progress={modelLoad.progressValue}
            cached={cached === true}
          />
        </div>
      )}

      <Conversation streaming={isStreaming || agentRunning} className="min-h-0 flex-1">
        <ConversationContent className="max-w-none">
          {agentMode ? (
            <>
              {agentHistory.length === 0 && currentAgentPrompt == null && (
                <ConversationEmptyState
                  icon={<Wrench className="size-6" />}
                  title="Agent mode"
                  description="Ask something answerable with the built-in tools: knowledge-base search, calculate, summarize. Agent runs are session-only and never persisted."
                />
              )}
              {agentHistory.map((run) => (
                <AgentRunView
                  key={run.id}
                  prompt={run.prompt}
                  steps={run.steps}
                  finishReason={run.finishReason}
                />
              ))}
              {currentAgentPrompt != null && (
                <AgentRunView
                  prompt={currentAgentPrompt}
                  steps={agent.steps}
                  isRunning={agent.isRunning}
                />
              )}
            </>
          ) : (
            <>
              {messages.length === 0 && (
                <ConversationEmptyState
                  icon={<Bot className="size-6" />}
                  title="Chat with a model in your browser"
                  description="Load the model, then send a message. Everything runs locally, no server, no API key."
                />
              )}
              {messages.map((m) => {
                if (m.role === 'assistant' && m.id === lastAssistant?.id) {
                  return (
                    <Message key={m.id} role="assistant">
                      <MessageAvatar role="assistant" />
                      <div className="min-w-0 max-w-[80%]">
                        <Branch
                          count={Math.max(1, branchTexts.length)}
                          index={variantIndex}
                          onIndexChange={setVariantIndex}
                        >
                          <div role="region" aria-label="Latest assistant reply">
                            <BranchMessages>
                              {branchTexts.map((text, i) => {
                                const seg = segmentThinking(text);
                                const isLive =
                                  isStreaming &&
                                  m.id === streamingMessageId &&
                                  i === variantIndex;
                                return (
                                  <div key={i} className="space-y-2">
                                    {(seg.thinking || seg.thinkingOpen) && (
                                      <div role="region" aria-label="Model reasoning">
                                        <Reasoning
                                          streaming={isLive && seg.thinkingOpen}
                                          durationMs={thinkDurations[m.id]}
                                        >
                                          <ReasoningTrigger />
                                          <ReasoningContent>{seg.thinking}</ReasoningContent>
                                        </Reasoning>
                                      </div>
                                    )}
                                    {!(seg.thinkingOpen && seg.answer.length === 0) && (
                                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                                        <Response streaming={isLive && !seg.thinkingOpen}>
                                          {seg.answer}
                                        </Response>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </BranchMessages>
                          </div>
                          <BranchSelector>
                            <BranchPrevious />
                            <BranchPage />
                            <BranchNext />
                          </BranchSelector>
                        </Branch>
                        {cacheHits[m.id] != null && (
                          <span role="status" aria-label="Cache hit" className="mt-1 inline-flex">
                            <CacheBadge cached latencyMs={cacheHits[m.id]} />
                          </span>
                        )}
                        <Actions className="mt-1">
                          <CopyAction text={activeAnswer} />
                          <RegenerateAction
                            onRegenerate={() => void handleRegenerate()}
                            disabled={isStreaming || isRegenerating || modelStatus !== 'ready'}
                          />
                        </Actions>
                      </div>
                    </Message>
                  );
                }
                if (m.role === 'assistant') {
                  const text = getTextContent(m.content);
                  const seg = segmentThinking(text);
                  return (
                    <Message key={m.id} role="assistant">
                      <MessageAvatar role="assistant" />
                      <div className="min-w-0 max-w-[80%] space-y-1">
                        {seg.thinking && (
                          <div role="region" aria-label="Model reasoning">
                            <Reasoning durationMs={thinkDurations[m.id]}>
                              <ReasoningTrigger />
                              <ReasoningContent>{seg.thinking}</ReasoningContent>
                            </Reasoning>
                          </div>
                        )}
                        <MessageContent role="assistant" content={seg.answer} className="max-w-none" />
                        {cacheHits[m.id] != null && (
                          <span role="status" aria-label="Cache hit" className="inline-flex">
                            <CacheBadge cached latencyMs={cacheHits[m.id]} />
                          </span>
                        )}
                      </div>
                    </Message>
                  );
                }
                if (m.role === 'user') {
                  return (
                    <Message key={m.id} role="user">
                      <MessageAvatar role="user" />
                      <MessageContent role="user" content={toMessageParts(m.content)} />
                    </Message>
                  );
                }
                return (
                  <Message key={m.id} role={m.role}>
                    <MessageAvatar role={m.role} />
                    <MessageContent role={m.role} content={toMessageParts(m.content)} />
                  </Message>
                );
              })}
            </>
          )}
          <ConversationScrollAnchor />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="relative border-t border-border p-3">
        <div
          className={`absolute bottom-full left-3 z-10 mb-2 ${paletteOpen ? '' : 'hidden'}`}
        >
          <SlashCommandPalette
            commands={slashCommands}
            open={paletteOpen}
            query={draft.slice(1)}
            onSelect={runSlashCommand}
            onDismiss={() => setDraft('')}
          />
        </div>

        {showAttachments && (
          <div role="region" aria-label="Attachments" className="mb-2">
            <PromptInputAttachments
              value={attachments}
              onChange={handleAttachmentsChange}
              accept={IMAGE_MIME_TYPES.join(',')}
            />
            {attachmentError && (
              <p role="alert" aria-label="Attachment error" className="mt-1 text-xs text-destructive">
                {attachmentError}
              </p>
            )}
          </div>
        )}

        <PromptInput
          value={draft}
          onValueChange={setDraft}
          attachments={attachments}
          streaming={composerStreaming}
          onStop={agentMode ? agent.cancel : cancel}
          onSubmit={handleSubmit}
          disabled={modelStatus !== 'ready'}
        >
          <PromptInputTextarea
            placeholder={
              modelStatus === 'ready'
                ? agentMode
                  ? 'Ask the agent - it can search, calculate, and summarize…'
                  : 'Ask the local model… ("/" for commands)'
                : 'Load the model to start chatting…'
            }
            onKeyDown={(e) => {
              if (!paletteOpen) return;
              if (e.key === 'Enter') e.preventDefault();
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
              }
            }}
          />
          <PromptInputTools>
            <span className="px-1 text-xs text-muted-foreground">
              {modelStatus === 'ready'
                ? `${contextWindow.toLocaleString()}-token context`
                : 'On-device · no API key'}
            </span>
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInput>
      </div>
    </div>
  );
}

/* ────────────────────────────── AgentRunView ──────────────────────────── */

/** One agent turn: the user's prompt + the live/frozen step timeline. */
function AgentRunView({
  prompt,
  steps,
  isRunning = false,
  finishReason,
}: {
  prompt: string;
  steps: TimelineAgentStep[];
  isRunning?: boolean;
  finishReason?: AgentFinishReason;
}) {
  return (
    <div className="space-y-3">
      <Message role="user">
        <MessageAvatar role="user" />
        <MessageContent role="user" content={prompt} />
      </Message>
      <div role="region" aria-label="Agent steps" className="pl-11">
        <AgentStepTimeline steps={steps} isRunning={isRunning} finishReason={finishReason} />
      </div>
    </div>
  );
}
