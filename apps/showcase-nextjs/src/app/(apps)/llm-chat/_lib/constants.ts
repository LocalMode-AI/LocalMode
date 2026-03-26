/**
 * @file constants.ts
 * @description App constants and configuration for local-chat
 */

import type { AgentToolInfo, BackendDisplayInfo, BackendFilter, CategoryInfo, ModelBackend, ModelCategory } from './types';

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

/** Semantic cache configuration */
export const CACHE_CONFIG = {
  /** Embedding model used for cache key generation */
  embeddingModel: 'Xenova/bge-small-en-v1.5',
  /** Cosine similarity threshold for cache hits */
  threshold: 0.92,
  /** Maximum number of cached entries */
  maxEntries: 100,
  /** Time-to-live for cached entries in milliseconds (1 hour) */
  ttlMs: 3600000,
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

/** Agent mode configuration */
export const AGENT_CONFIG = {
  /** Maximum ReAct loop iterations */
  maxSteps: 6,
  /** Temperature for deterministic tool selection */
  temperature: 0,
} as const;

/** System prompt used when agent mode is active */
export const AGENT_SYSTEM_PROMPT =
  'You are a helpful assistant with access to tools. Use the available tools to answer questions accurately. ' +
  'Always search for information before answering factual questions. ' +
  'Use the calculate tool for any math. ' +
  'After gathering information, provide a clear and comprehensive final answer.';

/** Minimum model size in bytes required for agent mode (500MB) */
export const MIN_AGENT_MODEL_SIZE_BYTES = 500 * 1024 * 1024;

/** Tool display metadata for header badges */
export const AGENT_TOOLS_INFO: AgentToolInfo[] = [
  { name: 'search', description: 'Search knowledge base', color: 'text-poster-accent-teal bg-poster-accent-teal/10' },
  { name: 'calculate', description: 'Evaluate math', color: 'text-poster-accent-orange bg-poster-accent-orange/10' },
  { name: 'summarize', description: 'Summarize text', color: 'text-poster-accent-purple bg-poster-accent-purple/10' },
];

/** Knowledge base articles for the search_web agent tool */
export const AGENT_KNOWLEDGE_BASE = [
  {
    id: 'qc-1',
    title: 'Introduction to Quantum Computing',
    content: 'Quantum computing uses quantum bits (qubits) that can exist in superposition, representing both 0 and 1 simultaneously. This enables quantum computers to solve certain problems exponentially faster than classical computers. Key concepts include entanglement, where qubits become correlated, and quantum gates that manipulate qubit states. Current quantum computers have 50-1000+ qubits but are error-prone.',
    category: 'quantum-computing',
  },
  {
    id: 'qc-2',
    title: 'Quantum Computing Applications',
    content: 'Quantum computing has promising applications in cryptography (breaking and creating encryption), drug discovery (simulating molecular interactions), optimization problems (logistics, finance), and machine learning (quantum neural networks). Google demonstrated quantum supremacy in 2019, and IBM offers cloud quantum computing services.',
    category: 'quantum-computing',
  },
  {
    id: 'bio-1',
    title: 'Photosynthesis Process',
    content: 'Photosynthesis converts sunlight, water, and CO2 into glucose and oxygen. It occurs in chloroplasts using chlorophyll pigments. The light-dependent reactions in the thylakoid membranes capture light energy to produce ATP and NADPH. The Calvin cycle in the stroma uses these to fix CO2 into glucose. Efficiency is approximately 3-6%.',
    category: 'biology',
  },
  {
    id: 'bio-2',
    title: 'CRISPR Gene Editing',
    content: 'CRISPR-Cas9 is a gene editing tool adapted from bacterial immune systems. It uses a guide RNA to direct the Cas9 enzyme to a specific DNA sequence, where it makes a precise cut. Applications include treating genetic diseases (sickle cell, muscular dystrophy), creating disease-resistant crops, and studying gene function.',
    category: 'genetics',
  },
  {
    id: 'ai-1',
    title: 'Machine Learning Fundamentals',
    content: 'Machine learning enables computers to learn from data without explicit programming. Supervised learning uses labeled data for classification and regression. Unsupervised learning finds patterns in unlabeled data. Deep learning uses neural networks with many layers for complex pattern recognition in images, text, and audio.',
    category: 'artificial-intelligence',
  },
  {
    id: 'ai-2',
    title: 'Large Language Models',
    content: 'Large language models (LLMs) are neural networks trained on vast text corpora to generate and understand human language. They use the transformer architecture with self-attention mechanisms. Modern LLMs can perform translation, summarization, code generation, and reasoning. Running LLMs locally in the browser is now possible via WebGPU and WASM.',
    category: 'artificial-intelligence',
  },
  {
    id: 'env-1',
    title: 'Climate Change and Carbon Cycle',
    content: 'The carbon cycle describes the movement of carbon through the atmosphere, oceans, soil, and living organisms. Human activities, particularly burning fossil fuels, have increased atmospheric CO2 from 280ppm (pre-industrial) to over 420ppm. This enhanced greenhouse effect is causing global temperatures to rise, with consequences including sea level rise, extreme weather, and ecosystem disruption.',
    category: 'environment',
  },
  {
    id: 'space-1',
    title: 'Mars Exploration',
    content: 'Mars has been explored by numerous spacecraft including rovers (Curiosity, Perseverance), orbiters, and landers. Evidence suggests Mars once had liquid water and a thicker atmosphere. Current research focuses on searching for signs of ancient microbial life, studying Martian geology, and preparing for future human missions. SpaceX and NASA plan crewed missions in the 2030s-2040s.',
    category: 'space',
  },
] as const;

/** Display configuration for each inference backend */
export const BACKEND_INFO: Record<ModelBackend, BackendDisplayInfo> = {
  webgpu: {
    label: 'WebLLM',
    detail: 'MLC WebGPU',
    accel: 'WebGPU',
    format: 'MLC',
    color: 'text-poster-accent-purple',
    bgColor: 'bg-poster-accent-purple/10',
    borderColor: 'border-poster-accent-purple/30',
  },
  onnx: {
    label: 'TJS v4',
    detail: 'ONNX WebGPU',
    accel: 'WebGPU',
    format: 'ONNX',
    color: 'text-poster-accent-teal',
    bgColor: 'bg-poster-accent-teal/10',
    borderColor: 'border-poster-accent-teal/30',
  },
  wasm: {
    label: 'wllama',
    detail: 'GGUF WASM',
    accel: 'WASM',
    format: 'GGUF',
    color: 'text-poster-accent-orange',
    bgColor: 'bg-poster-accent-orange/10',
    borderColor: 'border-poster-accent-orange/30',
  },
};

/** Image upload configuration for vision models */
export const IMAGE_CONFIG = {
  /** Maximum file size per image in bytes (10MB) */
  maxSizeBytes: 10 * 1024 * 1024,
  /** Maximum number of images per message */
  maxCount: 4,
  /** Accepted MIME types */
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as readonly string[],
  /** Human-readable max size label */
  maxSizeLabel: '10MB',
} as const;

/** Backend filter tabs in display order */
export const BACKEND_FILTER_TABS: { value: BackendFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'webgpu', label: 'WebLLM' },
  { value: 'onnx', label: 'TJS v4' },
  { value: 'wasm', label: 'wllama' },
];
