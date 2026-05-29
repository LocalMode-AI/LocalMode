import Link from 'next/link';
import type { Metadata } from 'next';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LocalMode',
    url: baseUrl,
    logo: `${baseUrl}/icon.svg`,
    description:
      'Open-source TypeScript library for running ML models entirely in the browser. Embeddings, vector search, LLM chat, classification, vision, audio, and agents - all offline, all private.',
    sameAs: [
      'https://github.com/LocalMode-AI/LocalMode',
      'https://www.npmjs.com/org/localmode',
      'https://localmode.ai',
    ],
    foundingDate: '2025',
    knowsAbout: [
      'Browser-based machine learning',
      'Local-first AI',
      'WebGPU inference',
      'WebAssembly ML',
      'Vector databases',
      'Privacy-preserving AI',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'About', item: `${baseUrl}/about` },
    ],
  },
];

export const metadata: Metadata = {
  title: 'About | LocalMode',
  description:
    'LocalMode is an open-source TypeScript library for running ML models entirely in the browser. No servers, no API keys, data never leaves the device.',
  alternates: {
    canonical: `${baseUrl}/about`,
  },
  openGraph: {
    title: 'About LocalMode',
    description:
      'Open-source, privacy-first AI for the browser. Run embeddings, vector search, LLM chat, vision, and audio - all locally.',
    type: 'website',
    url: `${baseUrl}/about`,
    siteName: 'LocalMode',
  },
};

export default function AboutPage() {
  return (
    <main className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <nav aria-label="Breadcrumb" className="text-sm text-fd-muted-foreground mb-8">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-fd-primary transition-colors">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-fd-foreground" aria-current="page">About</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-bold mb-6">About LocalMode</h1>

      <div className="prose prose-fd min-w-0">
        <p className="text-lg text-fd-muted-foreground mb-8">
          LocalMode is an open-source TypeScript library for building AI-powered browser applications.
          Everything from embeddings and vector search to LLM chat and real-time hand tracking works
          offline after the initial model download. No servers, no API keys - data never leaves the device.
        </p>

        <h2>What LocalMode Does</h2>
        <p>
          LocalMode provides a unified API across multiple ML runtimes. A single <code>LanguageModel</code> interface
          works with WebLLM (WebGPU), Transformers.js (ONNX), wllama (llama.cpp WASM), and LiteRT (Google on-device).
          The same pattern applies to embeddings, classification, vision, audio, and every other ML task - write once,
          swap providers freely.
        </p>

        <h2>Key Facts</h2>
        <ul>
          <li><strong>License:</strong> MIT - free for commercial and personal use</li>
          <li><strong>Language:</strong> TypeScript, zero dependencies in the core package</li>
          <li><strong>Models:</strong> 60+ curated models across 18 task categories, plus access to 180,000+ GGUF models via wllama</li>
          <li><strong>Providers:</strong> 6 provider packages (Transformers.js, WebLLM, wllama, LiteRT, MediaPipe, Chrome AI)</li>
          <li><strong>React:</strong> 56 hooks in <code>@localmode/react</code> for every core function</li>
          <li><strong>Privacy:</strong> Zero telemetry, zero network requests from the core package, all inference runs on-device</li>
        </ul>

        <h2>Links</h2>
        <ul>
          <li><Link href="https://github.com/LocalMode-AI/LocalMode">GitHub Repository</Link></li>
          <li><Link href="https://www.npmjs.com/org/localmode">npm Packages</Link></li>
          <li><Link href="https://localmode.ai">Live Demo (34 showcase apps)</Link></li>
          <li><Link href="/docs">Documentation</Link></li>
          <li><Link href="/blog">Blog</Link></li>
        </ul>
      </div>
    </main>
  );
}
