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
import { z } from 'zod';

// Stream text from a local LLM
const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');

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
      '46 React hooks, 10 pipeline step factories, batch/list processing, and browser helpers.',
    href: '/docs/react',
    color: 'from-cyan-500 to-teal-500',
  },
];

const providerPackages = [
  {
    name: '@localmode/transformers',
    description:
      'HuggingFace Transformers.js - 25 model factories for embeddings, vision, audio, OCR, and LLM inference.',
    href: '/docs/transformers',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    name: '@localmode/webllm',
    description:
      'WebLLM via WebGPU - 30 curated models including DeepSeek-R1, Qwen3, Llama 3.2, Phi 3.5 Vision.',
    href: '/docs/webllm',
    color: 'from-purple-500 to-pink-500',
  },
  {
    name: '@localmode/wllama',
    description:
      'GGUF models via llama.cpp WASM - curated catalog + 135K+ HuggingFace models, universal browser support.',
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
      '3 providers: WebGPU, WASM, ONNX',
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
      'Document & table QA',
      'Image-to-image & depth',
    ],
    href: '/docs/core/vision',
  },
  {
    icon: Mic,
    title: 'Audio',
    items: [
      'Speech-to-text transcription',
      'Text-to-speech synthesis',
      'Audio classification',
      'Offline voice notes',
      'Meeting summarization',
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
      'Embedding drift detection',
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

const demoCategories = [
  {
    icon: MessageSquare,
    title: 'Chat, Agents & Audio',
    count: 6,
    apps: [
      { name: 'LLM Chat', slug: 'llm-chat' },
      { name: 'Research Agent', slug: 'research-agent' },
      { name: 'GGUF Explorer', slug: 'gguf-explorer' },
      { name: 'Voice Notes', slug: 'voice-notes' },
      { name: 'Meeting Assistant', slug: 'meeting-assistant' },
      { name: 'Audiobook Creator', slug: 'audiobook-creator' },
    ],
  },
  {
    icon: Brain,
    title: 'Text & NLP',
    count: 9,
    apps: [
      { name: 'Smart Writer', slug: 'smart-writer' },
      { name: 'Data Extractor', slug: 'data-extractor' },
      { name: 'Sentiment Analyzer', slug: 'sentiment-analyzer' },
      { name: 'Email Classifier', slug: 'email-classifier' },
      { name: 'Translator', slug: 'translator' },
      { name: 'Text Summarizer', slug: 'text-summarizer' },
      { name: 'Q&A Bot', slug: 'qa-bot' },
      { name: 'Smart Autocomplete', slug: 'smart-autocomplete' },
      { name: 'Invoice Q&A', slug: 'invoice-qa' },
    ],
  },
  {
    icon: Eye,
    title: 'Vision & Images',
    count: 9,
    apps: [
      { name: 'Background Remover', slug: 'background-remover' },
      { name: 'Smart Gallery', slug: 'smart-gallery' },
      { name: 'Product Search', slug: 'product-search' },
      { name: 'Cross-Modal Search', slug: 'cross-modal-search' },
      { name: 'Image Captioner', slug: 'image-captioner' },
      { name: 'OCR Scanner', slug: 'ocr-scanner' },
      { name: 'Object Detector', slug: 'object-detector' },
      { name: 'Duplicate Finder', slug: 'duplicate-finder' },
      { name: 'Photo Enhancer', slug: 'photo-enhancer' },
    ],
  },
  {
    icon: Search,
    title: 'RAG, Search & Tools',
    count: 8,
    apps: [
      { name: 'PDF Search', slug: 'pdf-search' },
      { name: 'Semantic Search', slug: 'semantic-search' },
      { name: 'LangChain RAG', slug: 'langchain-rag' },
      { name: 'Data Migrator', slug: 'data-migrator' },
      { name: 'Document Redactor', slug: 'document-redactor' },
      { name: 'Encrypted Vault', slug: 'encrypted-vault' },
      { name: 'Model Advisor', slug: 'model-advisor' },
      { name: 'Model Evaluator', slug: 'model-evaluator' },
    ],
  },
];

const providerComparison = [
  {
    provider: 'WebLLM',
    runtime: 'WebGPU',
    models: '30 curated (MLC)',
    speed: 'Fastest (GPU)',
    browsers: 'Chrome/Edge 113+',
    bestFor: 'Maximum performance',
  },
  {
    provider: 'Wllama',
    runtime: 'WASM (llama.cpp)',
    models: '135K+ GGUF from HF',
    speed: 'Good (CPU)',
    browsers: 'All modern browsers',
    bestFor: 'Universal compatibility',
  },
  {
    provider: 'Transformers.js',
    runtime: 'ONNX Runtime',
    models: '14 curated ONNX (TJS v4)',
    speed: 'Good (CPU/GPU)',
    browsers: 'All modern browsers',
    bestFor: 'Multi-task (embed + LLM)',
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

export default async function HomePage() {
  return (
    <main className="flex flex-col min-h-screen">
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
            href="https://localmode.ai"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
          >
            Try 32 Demo Apps
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
          <h2 className="text-3xl font-bold text-center mb-4">13 Packages</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          <div className="grid gap-12 lg:grid-cols-2">
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
              <div className="overflow-x-auto">
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
              <div className="overflow-x-auto">
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
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">3 LLM Providers, 1 Interface</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
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

      {/* Demo Apps */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">32 Demo Applications</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
            See every feature in action at{' '}
            <Link
              href="https://localmode.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fd-primary hover:underline"
            >
              localmode.ai
            </Link>
            . All apps run 100% in the browser.
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
                    {cat.count} apps
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cat.apps.map((app) => (
                    <Link
                      key={app.slug}
                      href={`https://localmode.ai/${app.slug}`}
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
              href="https://localmode.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-fd-primary hover:underline"
            >
              Try all demos at localmode.ai
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Blog */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <Newspaper className="w-12 h-12 mx-auto mb-6 text-fd-primary" />
          <h2 className="text-3xl font-bold mb-4">Blog</h2>
          <p className="text-fd-muted-foreground mb-8 max-w-xl mx-auto">
            Guides, tutorials, and deep dives on local-first AI, browser ML, RAG patterns,
            privacy-preserving inference, and more.
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg border border-fd-border hover:bg-fd-accent transition-colors"
          >
            Read the Blog
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <Globe className="w-12 h-12 mx-auto mb-6 text-fd-primary" />
          <h2 className="text-3xl font-bold mb-4">Ready to Build?</h2>
          <p className="text-fd-muted-foreground mb-8 max-w-xl mx-auto">
            Start building local-first AI applications with comprehensive documentation, 32 example
            apps, and guides for every feature.
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
