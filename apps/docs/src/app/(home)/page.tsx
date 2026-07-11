import Link from 'next/link';
import {
  Brain,
  Shield,
  Zap,
  HardDrive,
  MessageSquare,
  ArrowRight,
  Package,
  Terminal,
  Code,
  Bot,
  Eye,
  Mic,
  Search,
  Lock,
  Layers,
  BarChart3,
  Globe,
  Puzzle,
  Cpu,
  Newspaper,
} from 'lucide-react';
import { HighlightedCode } from '@/components/highlighted-code';

// --- Code examples ---

const terminalCodeTransformers = `$ pnpm install @localmode/core @localmode/transformers`;

const exampleCodeTransformers = `import { createVectorDB, embed, embedMany, chunk } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const model = transformers.embedding('Xenova/bge-small-en-v1.5');

// Create vector database with typed metadata
const db = await createVectorDB<{ text: string }>({
  name: 'docs',
  dimensions: 384,
});

// Chunk and embed documents
const chunks = chunk(documentText, { size: 512, overlap: 50 });
const { embeddings } = await embedMany({
  model,
  values: chunks.map((c) => c.text),
});

// Store vectors
await db.addMany(
  chunks.map((c, i) => ({
    id: \`chunk-\${i}\`,
    vector: embeddings[i],
    metadata: { text: c.text },
  }))
);

// Search
const { embedding: query } = await embed({ model, value: 'What is AI?' });
const results = await db.search(query, { k: 5 });`;

const terminalCodeLLM = `$ pnpm install @localmode/core @localmode/webllm`;

const exampleCodeLLM = `import { streamText, generateObject, jsonSchema } from '@localmode/core';
import { webllm } from '@localmode/webllm';
// import { wllama } from '@localmode/wllama'; // alternative provider
import { z } from 'zod';

// Stream text from a local LLM
const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
// const model = wllama.languageModel('Qwen2.5-0.5B-Instruct-Q4_K_M');

const result = await streamText({
  model,
  prompt: 'Explain quantum computing simply',
  maxTokens: 500,
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}

// Structured output with Zod schema
const { object } = await generateObject({
  model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  schema: jsonSchema(
    z.object({
      name: z.string(),
      age: z.number(),
      interests: z.array(z.string()),
    })
  ),
  prompt: 'Generate a profile for a software engineer named Alex',
});`;

// --- Data ---

const features = [
  {
    icon: Brain,
    title: 'AI in the Browser',
    description:
      'Run embeddings, LLMs, classification, vision, audio, and agents directly in the browser with WebGPU and WASM.',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description:
      'Zero telemetry. No data leaves your device. Built-in encryption, PII redaction, and differential privacy.',
  },
  {
    icon: Zap,
    title: 'Zero-Dependency Core',
    description:
      'Core package has no external dependencies. Built entirely on native Web APIs.',
  },
  {
    icon: HardDrive,
    title: 'Offline-Ready',
    description:
      'Models cached in IndexedDB. Works without internet after initial download. Automatic fallbacks.',
  },
  {
    icon: Puzzle,
    title: 'Interoperable',
    description:
      'Vercel AI SDK patterns. LangChain.js adapters. Import vectors from Pinecone and ChromaDB.',
  },
  {
    icon: Cpu,
    title: 'Device-Aware',
    description:
      'Adaptive batching, model recommendations, and WebGPU acceleration based on device capabilities.',
  },
];

const corePackages = [
  {
    name: '@localmode/core',
    description:
      'VectorDB (HNSW + WebGPU), pipelines, inference queue, model cache, agent framework, evaluation SDK, all interfaces.',
    href: '/docs/core',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    name: '@localmode/react',
    description:
      '56 React hooks, 10 pipeline step factories, batch/list processing, and browser helpers.',
    href: '/docs/react',
    color: 'from-cyan-500 to-teal-500',
  },
];

const providerPackages = [
  {
    name: '@localmode/transformers',
    description:
      'HuggingFace Transformers.js v4 - 26 model factories for embeddings, vision, audio, OCR, LLM inference.',
    href: '/docs/transformers',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    name: '@localmode/webllm',
    description:
      'WebLLM via WebGPU - 32 curated models including DeepSeek-R1, Qwen3, Llama 3.2, Phi 3.5 Vision.',
    href: '/docs/webllm',
    color: 'from-purple-500 to-pink-500',
  },
  {
    name: '@localmode/litert',
    description:
      'Google LiteRT-LM provider - 3 verified models (Gemma 4 E2B/E4B, Qwen3 0.6B); WebGPU + CPU WASM fallback. Text-only.',
    href: '/docs/litert',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    name: '@localmode/mediapipe',
    description:
      'Google MediaPipe Tasks - 13 verified models for landmarks, gestures, face detection, classification, segmentation, language detection, and streaming trackers.',
    href: '/docs/mediapipe',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    name: '@localmode/wllama',
    description:
      'GGUF models via llama.cpp WASM - curated catalog + 160K+ HuggingFace models, universal browser support.',
    href: '/docs/wllama',
    color: 'from-green-500 to-emerald-500',
  },
  {
    name: '@localmode/chrome-ai',
    description:
      'Chrome Built-in AI - zero-download inference via Gemini Nano with automatic fallback.',
    href: '/docs/chrome-ai',
    color: 'from-sky-500 to-blue-500',
  },
];

const ecosystemPackages = [
  {
    name: '@localmode/ai-sdk',
    description: 'Vercel AI SDK provider for local models.',
    href: '/docs/ai-sdk',
    color: 'from-indigo-500 to-violet-500',
  },
  {
    name: '@localmode/langchain',
    description:
      'LangChain.js adapters — drop-in local embeddings, chat, vector store, and reranker.',
    href: '/docs/langchain',
    color: 'from-teal-500 to-green-500',
  },
  {
    name: '@localmode/devtools',
    description:
      'In-app DevTools widget for model cache, VectorDB stats, and inference queue observability.',
    href: '/docs/devtools',
    color: 'from-amber-500 to-orange-500',
  },
  {
    name: '@localmode/pdfjs',
    description: 'PDF text extraction with PDF.js for document processing pipelines.',
    href: '/docs/pdfjs',
    color: 'from-red-500 to-orange-500',
  },
];

const storagePackages = [
  {
    name: '@localmode/dexie',
    description: 'Dexie.js storage adapter with schema versioning and transactions.',
    href: '/docs/dexie',
    color: 'from-rose-500 to-pink-500',
  },
  {
    name: '@localmode/idb',
    description: 'Minimal IndexedDB storage adapter using the idb library.',
    href: '/docs/idb',
    color: 'from-fuchsia-500 to-purple-500',
  },
  {
    name: '@localmode/localforage',
    description: 'Cross-browser storage adapter with automatic fallback.',
    href: '/docs/localforage',
    color: 'from-lime-500 to-green-500',
  },
];

const capabilities = [
  {
    icon: Search,
    title: 'Embeddings & Vector Search',
    items: [
      'Text and streaming embeddings',
      'HNSW index with WebGPU',
      'SQ8 + PQ compression (4–32x)',
      'Hybrid BM25 + semantic search',
      'Multimodal search via CLIP',
    ],
    href: '/docs/core/embeddings',
  },
  {
    icon: MessageSquare,
    title: 'LLM Generation',
    items: [
      'Streaming text generation',
      'Typed JSON output with Zod',
      'Semantic response caching',
      'Language model middleware',
      '5 providers: WebGPU, WASM, ONNX, LiteRT, Chrome AI',
    ],
    href: '/docs/core/generation',
  },
  {
    icon: Bot,
    title: 'Agents & Pipelines',
    items: [
      'ReAct loop with tool registry',
      'VectorDB-backed memory',
      'Multi-step pipelines',
      'Priority inference queue',
      '10 built-in step types',
    ],
    href: '/docs/core/agents',
  },
  {
    icon: Eye,
    title: 'Vision & OCR',
    items: [
      'Image classification & captioning',
      'Object detection & segmentation',
      'Optical character recognition',
      'Hand, pose & face landmarks',
      'Gesture recognition (8 classes)',
    ],
    href: '/docs/core/vision',
  },
  {
    icon: Mic,
    title: 'Audio',
    items: [
      'Speech-to-text transcription',
      'Live transcription with VAD',
      'Streaming TTS (29 English voices)',
      'Audio classification',
      'Kokoro TTS with speed control',
    ],
    href: '/docs/core/audio',
  },
  {
    icon: Lock,
    title: 'Security & Privacy',
    items: [
      'AES-GCM encryption',
      'Named-entity PII redaction',
      'Differential privacy noise',
      'Append-only hash-chained audit log',
      'Zero telemetry or tracking',
    ],
    href: '/docs/core/security',
  },
  {
    icon: Layers,
    title: 'RAG & Chunking',
    items: [
      'Recursive & semantic chunkers',
      'End-to-end ingestion pipeline',
      'Reranking for better retrieval',
      'Import from Pinecone & Chroma',
      'Export to CSV and JSONL',
    ],
    href: '/docs/core/rag',
  },
  {
    icon: BarChart3,
    title: 'Evaluation & Tooling',
    items: [
      'Classification & retrieval metrics',
      'Threshold calibration',
      'Device-aware model registry',
      'Adaptive batch sizing',
      'In-app DevTools widget',
    ],
    href: '/docs/core/evaluation',
  },
];

// Featured UI component families (9 of the 10 shipped families; DevTools is
// browsable at /docs/components but not featured here). `id` matches the family
// filter on the components browser, so each card deep-links to that filtered view.
// Sample names are real registry items.
const componentFamilies = [
  {
    id: 'conversation',
    icon: MessageSquare,
    name: 'Conversation',
    count: 24,
    samples: ['message', 'prompt-input', 'agent-step-timeline', 'reasoning', 'tool'],
  },
  {
    id: 'local-first',
    icon: HardDrive,
    name: 'Local-First',
    count: 25,
    samples: ['model-downloader', 'browser-compat-card', 'capability-gate'],
  },
  {
    id: 'audio',
    icon: Mic,
    name: 'Audio',
    count: 10,
    samples: ['voice-button', 'streaming-speech-panel', 'transcribed-note-card'],
  },
  {
    id: 'results',
    icon: BarChart3,
    name: 'Results & Insights',
    count: 12,
    samples: ['confidence-score-badge', 'cosine-similarity-meter', 'entity-stats-bar'],
  },
  {
    id: 'input-controls',
    icon: Terminal,
    name: 'Input Controls',
    count: 11,
    samples: ['slash-command-palette', 'parameter-slider', 'copy-button'],
  },
  {
    id: 'media-vision',
    icon: Eye,
    name: 'Media & Vision',
    count: 7,
    samples: ['media-dropzone', 'bounding-box-overlay', 'video-canvas'],
  },
  {
    id: 'data-documents',
    icon: Layers,
    name: 'Data & Documents',
    count: 5,
    samples: ['file-dropzone', 'indexed-document-card', 'category-facet-list'],
  },
  {
    id: 'artifacts',
    icon: Code,
    name: 'Artifacts & Canvas',
    count: 4,
    samples: ['artifact', 'data-table-artifact', 'chart-artifact'],
  },
  {
    id: 'security-privacy',
    icon: Lock,
    name: 'Security & Privacy',
    count: 5,
    samples: ['passphrase-gate', 'differential-privacy-controls', 'lock-status-badge'],
  },
];

// Installable blocks at localmode.ai/blocks — 36 route-served blocks across 12
// categories, grouped here into four themes. `route` is the canonical block path.
const demoCategories = [
  {
    icon: MessageSquare,
    title: 'Chat, Agents & Audio',
    count: 9,
    apps: [
      { name: 'Chat', route: '/blocks/chat' },
      { name: 'Research Agent', route: '/blocks/agents/research-agent' },
      { name: 'Data Extractor', route: '/blocks/agents/data-extractor' },
      { name: 'Voice Notes', route: '/blocks/audio/voice-notes' },
      { name: 'Live Transcription', route: '/blocks/audio/live-transcription' },
      { name: 'Meeting Assistant', route: '/blocks/audio/meeting-assistant' },
      { name: 'Voice Explorer', route: '/blocks/audio/voice-explorer' },
      { name: 'Audiobook Reader', route: '/blocks/audio/audiobook-reader' },
      { name: 'Audio Classifier', route: '/blocks/audio/audio-classifier' },
    ],
  },
  {
    icon: Brain,
    title: 'Text, Writing & NLP',
    count: 9,
    apps: [
      { name: 'Write', route: '/blocks/writing-tools/write' },
      { name: 'Translate', route: '/blocks/writing-tools/translate' },
      { name: 'Summarize', route: '/blocks/writing-tools/summarize' },
      { name: 'Complete', route: '/blocks/writing-tools/complete' },
      { name: 'Language Detector', route: '/blocks/text/language-detector' },
      { name: 'Sentiment Analyzer', route: '/blocks/text-insights/sentiment-analyzer' },
      { name: 'Text Classifier', route: '/blocks/text-insights/text-classifier' },
      { name: 'Model Evaluator', route: '/blocks/text-insights/model-evaluator' },
      { name: 'Threshold Calibrator', route: '/blocks/text-insights/threshold-calibrator' },
    ],
  },
  {
    icon: Eye,
    title: 'Vision, Photo & Images',
    count: 9,
    apps: [
      { name: 'Object Detector', route: '/blocks/vision/object-detector' },
      { name: 'Live Tracker', route: '/blocks/vision/live-tracker' },
      { name: 'Smart Gallery', route: '/blocks/photo/smart-gallery' },
      { name: 'Image Search', route: '/blocks/photo/image-search' },
      { name: 'Duplicate Finder', route: '/blocks/photo/duplicate-finder' },
      { name: 'Photo Categorizer', route: '/blocks/photo/photo-categorizer' },
      { name: 'Background Remover', route: '/blocks/image-studio/background-remover' },
      { name: 'Image Enhancer', route: '/blocks/image-studio/image-enhancer' },
      { name: 'Image Captioner', route: '/blocks/image-studio/image-captioner' },
    ],
  },
  {
    icon: Search,
    title: 'Knowledge, Device & Privacy',
    count: 9,
    apps: [
      { name: 'Semantic Search', route: '/blocks/knowledge/semantic-search' },
      { name: 'Document QA', route: '/blocks/knowledge/document-qa' },
      { name: 'RAG Chat', route: '/blocks/knowledge/rag-chat' },
      { name: 'Vector Data Manager', route: '/blocks/knowledge/vector-data-manager' },
      { name: 'Device Report', route: '/blocks/device/device-report' },
      { name: 'Model Advisor', route: '/blocks/device/model-advisor' },
      { name: 'GGUF Explorer', route: '/blocks/device/gguf-explorer' },
      { name: 'PII Redactor', route: '/blocks/privacy/pii-redactor' },
      { name: 'Encrypted Vault', route: '/blocks/privacy/encrypted-vault' },
    ],
  },
];

const providerComparison = [
  {
    provider: 'WebLLM',
    runtime: 'WebGPU',
    models: '32 curated (MLC)',
    speed: 'Fastest (GPU)',
    browsers: 'Chrome/Edge 113+',
    bestFor: 'Maximum performance',
  },
  {
    provider: 'Wllama',
    runtime: 'WASM (llama.cpp)',
    models: '160K+ GGUF from HF',
    speed: 'Good (CPU)',
    browsers: 'All modern browsers',
    bestFor: 'Universal compatibility',
  },
  {
    provider: 'Transformers.js',
    runtime: 'ONNX Runtime',
    models: '16 curated ONNX (TJS v4)',
    speed: 'Good (CPU/GPU)',
    browsers: 'All modern browsers',
    bestFor: 'Multi-task (embed + LLM)',
  },
  {
    provider: 'LiteRT',
    runtime: 'WebGPU / CPU WASM',
    models: '3 verified (.litertlm)',
    speed: 'Fast (GPU) / Good (CPU)',
    browsers: 'Chrome/Edge (WebGPU)',
    bestFor: 'Google on-device models',
  },
  {
    provider: 'Chrome AI',
    runtime: 'Built-in (Gemini Nano)',
    models: '1 built-in (Gemini Nano)',
    speed: 'Fast (Chrome-managed)',
    browsers: 'Chrome 148+ desktop',
    bestFor: 'Shipping no model files',
  },
];

// --- Components ---

function PackageCard({
  pkg,
}: {
  pkg: { name: string; description: string; href: string; color: string };
}) {
  return (
    <Link
      href={pkg.href}
      className="group relative p-5 rounded-xl bg-fd-card border border-fd-border hover:border-fd-primary/50 transition-all hover:shadow-lg"
    >
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-5 rounded-xl bg-gradient-to-br ${pkg.color} transition-opacity`}
      />
      <div className="relative">
        <h3 className="text-sm font-mono font-semibold mb-1.5 group-hover:text-fd-primary transition-colors">
          {pkg.name}
        </h3>
        <p className="text-xs text-fd-muted-foreground leading-relaxed">{pkg.description}</p>
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-fd-primary">
          Learn more
          <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

// --- Page ---

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'LocalMode',
    url: 'https://localmode.dev',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LocalMode',
    url: 'https://localmode.dev',
    logo: 'https://localmode.dev/icon.svg',
    sameAs: [
      'https://github.com/LocalMode-AI/LocalMode',
      'https://www.npmjs.com/org/localmode',
      'https://localmode.ai',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'LocalMode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web Browser',
    description:
      'Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision, and LLMs - all locally in the browser.',
    url: 'https://localmode.dev',
    license: 'https://opensource.org/licenses/MIT',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: {
      '@type': 'Organization',
      name: 'LocalMode',
      url: 'https://localmode.dev',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'LocalMode Glossary',
    '@id': 'https://localmode.dev/#glossary',
    hasDefinedTerm: [
      {
        '@type': 'DefinedTerm',
        name: 'VectorDB',
        description:
          'A browser-native vector database using HNSW indexing for approximate nearest neighbor search, stored in IndexedDB.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'GGUF',
        description:
          'A binary format for storing quantized large language models, used by llama.cpp and wllama for efficient browser-based inference via WebAssembly.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'HNSW',
        description:
          'Hierarchical Navigable Small World — a graph-based algorithm for approximate nearest neighbor search that powers LocalMode\'s VectorDB.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'Embeddings',
        description:
          'Dense vector representations of text, images, or audio that capture semantic meaning, enabling similarity search and classification in the browser.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'RAG',
        description:
          'Retrieval-Augmented Generation — a pattern that retrieves relevant documents from a vector database and includes them in an LLM prompt for grounded answers.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'WebGPU',
        description:
          'A modern browser API for GPU-accelerated compute, used by WebLLM and LiteRT providers for fast LLM inference at 40-90+ tokens per second.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
      {
        '@type': 'DefinedTerm',
        name: 'Local-first AI',
        description:
          'An architecture where ML inference runs entirely on the user\'s device (browser, phone, laptop) with no server round-trips, ensuring privacy and offline capability.',
        inDefinedTermSet: 'https://localmode.dev/#glossary',
      },
    ],
  },
];

export default async function HomePage() {
  return (
    <main className="flex flex-col min-h-screen">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 py-24 text-center overflow-hidden">
        <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 text-sm font-medium rounded-full border border-fd-border text-fd-foreground">
          <Package className="w-4 h-4" />
          <span>Local-First AI for the Web</span>
        </div>

        <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="text-fd-primary">Local</span>Mode
        </h1>

        <p className="max-w-3xl mt-6 text-lg text-fd-muted-foreground sm:text-xl">
          Run ML models entirely in your browser. Embeddings, vector search, LLM chat, vision,
          audio, agents, and structured output - all offline, all private. <br/> No servers. No API keys.
          Your data never leaves your device.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mt-10">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg bg-fd-foreground text-fd-background hover:opacity-90 transition-opacity"
          >
            Read the Docs
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            target="_blank"
            rel="noopener noreferrer"
            href="https://localmode.ai/blocks"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
          >
            Try 36 Live Blocks
          </Link>
          <Link
            target="_blank"
            rel="noopener noreferrer"
            href="https://github.com/LocalMode-AI/LocalMode"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
          >
            View on GitHub
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Built for the Modern Web</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-fd-card border border-fd-border hover:border-fd-primary/50 transition-colors"
              >
                <feature.icon className="w-10 h-10 mb-4 text-fd-primary" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-fd-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">15 Packages</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-3xl mx-auto">
            Modular architecture - use only what you need. Zero-dependency core provides everything;
            providers add ML framework integrations.
          </p>

          {/* Core & React */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground mb-3">
              Core & React
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {corePackages.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>
          </div>

          {/* AI Providers */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground mb-3">
              AI Providers
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {providerPackages.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>
          </div>

          {/* Ecosystem */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground mb-3">
              Ecosystem
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ecosystemPackages.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>
          </div>

          {/* Storage */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground mb-3">
              Storage Adapters
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {storagePackages.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Capabilities</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
            From embeddings and vector search to agents, vision, audio, and security - everything
            runs locally in the browser.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((cap) => (
              <Link
                key={cap.title}
                href={cap.href}
                className="group p-5 rounded-xl bg-fd-card border border-fd-border hover:border-fd-primary/50 transition-colors"
              >
                <cap.icon className="w-8 h-8 mb-3 text-fd-primary" />
                <h3 className="text-base font-semibold mb-2 group-hover:text-fd-primary transition-colors">
                  {cap.title}
                </h3>
                <ul className="space-y-1.5">
                  {cap.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs text-fd-muted-foreground leading-relaxed"
                    >
                      <span className="text-fd-primary mt-0.5 shrink-0">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples */}
      <section className="px-4 sm:px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Simple, Powerful API</h2>
          <p className="text-center text-fd-muted-foreground mb-12">
            Function-first design with TypeScript. All operations return structured results.
          </p>

          <div className="grid gap-10 lg:grid-cols-2">
            {/* Embeddings & Vector Search */}
            <div className="space-y-4 min-w-0">
              <h3 className="text-xl font-semibold text-center mb-4">
                Embeddings & Vector Search
              </h3>
              <div className="overflow-x-auto">
                <HighlightedCode
                  code={terminalCodeTransformers}
                  lang="bash"
                  title="Terminal"
                  icon={<Terminal className="w-4 h-4" />}
                />
              </div>
              <div className="xl:[&_pre]:w-full! xl:[&_pre]:min-w-0! xl:[&_pre]:whitespace-pre-wrap! xl:[&_pre]:break-words xl:[&_code]:whitespace-pre-wrap! [&_figure]:mt-auto! [&_.fd-scroll-container]:max-h-none!">
                <HighlightedCode
                  code={exampleCodeTransformers}
                  lang="typescript"
                  title="embeddings.ts"
                  icon={<Code className="w-4 h-4" />}
                />
              </div>
            </div>

            {/* LLM + Structured Output */}
            <div className="space-y-4 min-w-0">
              <h3 className="text-xl font-semibold text-center mb-4">
                LLM Chat & Structured Output
              </h3>
              <div className="overflow-x-auto">
                <HighlightedCode
                  code={terminalCodeLLM}
                  lang="bash"
                  title="Terminal"
                  icon={<Terminal className="w-4 h-4" />}
                />
              </div>
              <div className="xl:[&_pre]:w-full! xl:[&_pre]:min-w-0! xl:[&_pre]:whitespace-pre-wrap! xl:[&_pre]:break-words xl:[&_code]:whitespace-pre-wrap! [&_figure]:mt-auto! [&_.fd-scroll-container]:max-h-none!">
                <HighlightedCode
                  code={exampleCodeLLM}
                  lang="typescript"
                  title="chat.ts"
                  icon={<Code className="w-4 h-4" />}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LLM Provider Comparison */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">5 LLM Providers, 1 Interface</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-3xl mx-auto">
            All providers implement the same <code className="text-fd-foreground">LanguageModel</code> interface - swap with a single line change.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-fd-border">
                  <th className="text-left py-3 px-4 font-semibold" />
                  {providerComparison.map((p) => (
                    <th key={p.provider} className="text-left py-3 px-4 font-semibold">
                      {p.provider}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-fd-muted-foreground">
                <tr className="border-b border-fd-border/50">
                  <td className="py-2.5 px-4 font-medium text-fd-foreground">Runtime</td>
                  {providerComparison.map((p) => (
                    <td key={p.provider} className="py-2.5 px-4">{p.runtime}</td>
                  ))}
                </tr>
                <tr className="border-b border-fd-border/50">
                  <td className="py-2.5 px-4 font-medium text-fd-foreground">Models</td>
                  {providerComparison.map((p) => (
                    <td key={p.provider} className="py-2.5 px-4">{p.models}</td>
                  ))}
                </tr>
                <tr className="border-b border-fd-border/50">
                  <td className="py-2.5 px-4 font-medium text-fd-foreground">Speed</td>
                  {providerComparison.map((p) => (
                    <td key={p.provider} className="py-2.5 px-4">{p.speed}</td>
                  ))}
                </tr>
                <tr className="border-b border-fd-border/50">
                  <td className="py-2.5 px-4 font-medium text-fd-foreground">Browser Support</td>
                  {providerComparison.map((p) => (
                    <td key={p.provider} className="py-2.5 px-4">{p.browsers}</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-fd-foreground">Best For</td>
                  {providerComparison.map((p) => (
                    <td key={p.provider} className="py-2.5 px-4">{p.bestFor}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Components */}
      <section className="px-6 pt-20 pb-10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">100+ UI Components</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-3xl mx-auto">
            Beyond the packages, LocalMode ships{' '}
            <span className="text-fd-foreground font-medium">107 copy-owned React components</span>{' '}
            across 10 families - composable, local-first AI UI primitives you install with the shadcn
            CLI and own outright.
            <br />
            Browse them all at{' '}
            <Link
              href="https://localmode.ai/docs/components"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fd-primary hover:underline"
            >
              LocalMode.ai
            </Link>
            .
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {componentFamilies.map((fam) => (
              <Link
                key={fam.name}
                href={`https://localmode.ai/docs/components?filter=${fam.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-5 rounded-xl bg-fd-card border border-fd-border hover:border-fd-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <fam.icon className="w-6 h-6 text-fd-primary" />
                  <h3 className="text-base font-semibold group-hover:text-fd-primary transition-colors">
                    {fam.name}
                  </h3>
                  <span className="ml-auto text-xs font-medium text-fd-muted-foreground bg-fd-muted px-2 py-0.5 rounded-full">
                    {fam.count}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fam.samples.map((sample) => (
                    <span
                      key={sample}
                      className="text-[11px] font-mono text-fd-muted-foreground bg-fd-muted/50 px-2 py-0.5 rounded"
                    >
                      {sample}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="https://localmode.ai/docs/components"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-fd-primary hover:underline"
            >
              Browse all 107 components
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Blocks */}
      <section className="px-6 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">36 Interactive Blocks</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
            The components composed into full, installable experiences - each running a real model
            entirely in the browser. See them live at{' '}
            <Link
              href="https://localmode.ai/blocks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fd-primary hover:underline"
            >
              LocalMode.ai/blocks
            </Link>
            .
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {demoCategories.map((cat) => (
              <div
                key={cat.title}
                className="p-6 rounded-xl bg-fd-card border border-fd-border"
              >
                <div className="flex items-center gap-3 mb-4">
                  <cat.icon className="w-6 h-6 text-fd-primary" />
                  <h3 className="text-base font-semibold">{cat.title}</h3>
                  <span className="ml-auto text-xs font-medium text-fd-muted-foreground bg-fd-muted px-2 py-0.5 rounded-full">
                    {cat.count} blocks
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cat.apps.map((app) => (
                    <Link
                      key={app.route}
                      href={`https://localmode.ai${app.route}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-fd-muted-foreground bg-fd-muted/50 px-2.5 py-1 rounded-md hover:bg-fd-primary/10 hover:text-fd-primary transition-colors"
                    >
                      {app.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="https://localmode.ai/blocks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-fd-primary hover:underline"
            >
              Explore all 36 blocks
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Blog */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Newspaper className="w-12 h-12 mx-auto mb-6 text-fd-primary" />
            <h2 className="text-3xl font-bold mb-4">Blog</h2>
            <p className="text-fd-muted-foreground max-w-xl mx-auto">
              Guides, tutorials, and deep dives on local-first AI, browser ML, RAG patterns,
              privacy-preserving inference, and more.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            <Link
              href="/blog/32-ai-features-browser-showcase"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Featured</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                The 36 AI Blocks in Our Open-Source Gallery - All Running in Your Browser Right Now
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                Every feature running in your browser, from embeddings and vector search to LLM chat and real-time hand tracking.
              </p>
            </Link>
            <Link
              href="/blog/hybrid-ai-architecture"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Architecture</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                The Hybrid AI Architecture: Local for 95%, Cloud for the Rest
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                Route embeddings, classification, and summarization locally at $0 cost while reserving cloud APIs for frontier reasoning.
              </p>
            </Link>
            <Link
              href="/blog/20-ai-concerns-architecture-as-policy"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Analysis</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                Architecture as Policy: Why Most AI Criticism Is Really About Where the Compute Happens
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                15 of 20 common AI criticisms target the deployment model, not the technology. Move inference to the browser and they disappear.
              </p>
            </Link>
            <Link
              href="/blog/local-ai-vs-cloud"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Benchmark</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                Near Cloud-Quality AI at $0 Cost
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                18 local browser model categories benchmarked against OpenAI, Google, AWS, and Cohere.
              </p>
            </Link>
            <Link
              href="/blog/three-llm-providers-one-api"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Architecture</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                Browser LLM Providers, One API
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                WebLLM, Transformers.js v4, wllama, and LiteRT-LM behind a single LanguageModel interface.
              </p>
            </Link>
            <Link
              href="/blog/private-rag-chat-no-backend"
              className="group block rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent/50"
            >
              <p className="text-xs text-fd-muted-foreground mb-2">Tutorial</p>
              <h3 className="font-semibold text-sm group-hover:text-fd-primary transition-colors mb-1">
                Private RAG Chat With No Backend
              </h3>
              <p className="text-xs text-fd-muted-foreground line-clamp-2">
                Build a fully private RAG chatbot that runs entirely in the browser.
              </p>
            </Link>
          </div>
          <div className="text-center">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
            >
              View All Articles
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <Globe className="w-12 h-12 mx-auto mb-6 text-fd-primary" />
          <h2 className="text-3xl font-bold mb-4">Ready to Build?</h2>
          <p className="text-fd-muted-foreground mb-8 max-w-xl mx-auto">
            Start building local-first AI applications with comprehensive documentation, 100+ UI
            components, 36 interactive blocks, and guides for every feature.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-lg bg-fd-foreground text-fd-background hover:opacity-90 transition-opacity"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
            >
              Read the Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-fd-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-fd-muted-foreground">
            &copy; {new Date().getFullYear()} LocalMode. MIT License.
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/LocalMode-AI/LocalMode"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              GitHub
            </Link>
            <Link
              target="_blank"
              rel="noopener noreferrer"
              href="https://localmode.ai"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              Demo Apps
            </Link>
            <Link
              href="/blog"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/docs"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              Documentation
            </Link>
            <Link
              href="/about"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              About
            </Link>
            <Link
              href="mailto:info@localmode.ai"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
