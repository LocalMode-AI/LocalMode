import Link from 'next/link';
import {
  Brain,
  Shield,
  Zap,
  HardDrive,
  FileText,
  MessageSquare,
  ArrowRight,
  Package,
  Terminal,
  Code,
} from 'lucide-react';
import { HighlightedCode } from '@/components/highlighted-code';

// Core + Transformers example
const terminalCodeTransformers = `$ pnpm install @localmode/core @localmode/transformers`;

const exampleCodeTransformers = `import { createVectorDB, embed, embedMany, chunk } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const model = transformers.embedding('Xenova/all-MiniLM-L6-v2');

// Create vector database
const db = await createVectorDB({
  name: 'documents',
  dimensions: 384,
});

// Chunk and embed document
const chunks = chunk(documentText, { strategy: 'recursive', size: 512 });
const { embeddings } = await embedMany({ model, values: chunks.map(c => c.text) });

// Store in database
await db.addMany(
  chunks.map((c, i) => ({
    id: \`chunk-\${i}\`,
    vector: embeddings[i],
    metadata: { text: c.text },
  }))
);

// Search
const { embedding: queryVector } = await embed({ model, value: 'What is AI?' });
const results = await db.search(queryVector, { k: 5 });`;

// Core + WebLLM example
const terminalCodeWebLLM = `$ pnpm install @localmode/core @localmode/webllm`;

const exampleCodeWebLLM = `import { generateText, streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

// Create a WebLLM model instance
const model = webllm.chat('Llama-3.2-3B-Instruct-q4f16_1-MLC');

// Generate text (non-streaming)
const { text } = await generateText({
  model,
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is machine learning?' },
  ],
});

console.log(text);

// Stream text for real-time responses
const { textStream } = await streamText({
  model,
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms.' },
  ],
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}`;

const features = [
  {
    icon: Brain,
    title: 'AI in the Browser',
    description:
      'Run embeddings, classification, vision, and LLMs directly in the browser with WebGPU/WASM.',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description: 'Zero telemetry. No data leaves your device. All processing happens locally.',
  },
  {
    icon: Zap,
    title: 'Zero Dependencies',
    description: 'Core package has no external dependencies. Built on native Web APIs.',
  },
  {
    icon: HardDrive,
    title: 'Offline-Ready',
    description: 'Models cached in IndexedDB. Works without network after first load.',
  },
];

const packages = [
  {
    name: '@localmode/core',
    description: 'Vector DB, embeddings, RAG utilities, storage, security, and all core functions.',
    href: '/docs/core',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    name: '@localmode/transformers',
    description: 'HuggingFace Transformers.js provider for ML models in the browser.',
    href: '/docs/transformers',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    name: '@localmode/webllm',
    description: 'WebLLM provider for local LLM inference with 4-bit quantized models.',
    href: '/docs/webllm',
    color: 'from-purple-500 to-pink-500',
  },
  {
    name: '@localmode/pdfjs',
    description: 'PDF text extraction using PDF.js for document processing pipelines.',
    href: '/docs/pdfjs',
    color: 'from-red-500 to-orange-500',
  },
];

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

        <p className="max-w-2xl mt-6 text-lg text-fd-muted-foreground sm:text-xl">
          Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision,
          and LLMs - all locally in the browser.
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <h2 className="text-3xl font-bold text-center mb-4">Packages</h2>
          <p className="text-center text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
            Modular architecture - use only what you need.
            <br />
            Core provides everything; providers add framework integrations.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {packages.map((pkg) => (
              <Link
                key={pkg.name}
                href={pkg.href}
                className="group relative p-6 rounded-xl bg-fd-card border border-fd-border hover:border-fd-primary/50 transition-all hover:shadow-lg"
              >
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-5 rounded-xl bg-gradient-to-br ${pkg.color} transition-opacity`}
                />
                <div className="relative">
                  <h3 className="text-lg font-mono font-semibold mb-2 group-hover:text-fd-primary transition-colors">
                    {pkg.name}
                  </h3>
                  <p className="text-sm text-fd-muted-foreground">{pkg.description}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fd-primary">
                    Learn more
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples */}
      <section className="px-6 py-20 bg-fd-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Simple, Powerful API</h2>
          <p className="text-center text-fd-muted-foreground mb-12">
            Function-first design with TypeScript. All operations return structured results.
          </p>

          <div className="grid gap-12 lg:grid-cols-2">
            {/* Core + Transformers Example */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center mb-4">Embeddings & Vector Search</h3>
              <HighlightedCode
                code={terminalCodeTransformers}
                lang="bash"
                title="Terminal"
                icon={<Terminal className="w-4 h-4" />}
              />
              <HighlightedCode
                code={exampleCodeTransformers}
                lang="typescript"
                title="embeddings.ts"
                icon={<Code className="w-4 h-4" />}
              />
            </div>

            {/* Core + WebLLM Example */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center mb-4">Local LLM Inference</h3>
              <HighlightedCode
                code={terminalCodeWebLLM}
                lang="bash"
                title="Terminal"
                icon={<Terminal className="w-4 h-4" />}
              />
              <HighlightedCode
                code={exampleCodeWebLLM}
                lang="typescript"
                title="chat.ts"
                icon={<Code className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-6 text-fd-primary" />
          <h2 className="text-3xl font-bold mb-4">Ready to Build?</h2>
          <p className="text-fd-muted-foreground mb-8 max-w-xl mx-auto">
            Start building local-first AI applications with comprehensive documentation, examples,
            and guides.
          </p>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-lg bg-fd-foreground text-fd-background hover:opacity-90 transition-opacity"
          >
            Read the Documentation
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-fd-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-fd-muted-foreground">
            © {new Date().getFullYear()} LocalMode. MIT License.
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
              href="https://LocalMode.ai"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              Demo Apps
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
