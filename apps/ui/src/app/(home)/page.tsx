/**
 * @file page.tsx
 * @description Homepage: a collage-led hero over a live grid of curated
 * presentational component demos (live, not screenshots; no model download) with
 * a trailing "explore all" CTA tile, a featured-blocks grid, a browser-capability
 * panel, and a footer. Nothing here downloads a model.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  MessageSquare,
  FileSearch,
  ScanSearch,
  Mic,
  Images,
  ShieldCheck,
} from 'lucide-react';
import { installCommand } from '@/lib/registry';
import { LiveCollage } from '@/components/live-collage';
import { CopyableCommand } from '@/components/copyable-command';
import { CapabilitiesPanel } from '@/components/capabilities-panel';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { homepageGraph, faqGraph } from '@/lib/structured-data';
import { DEFAULT_OG } from '@/lib/og';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: 'LocalMode UI' }],
  },
  twitter: { images: [DEFAULT_OG] },
};

/**
 * Homepage FAQ — natural-query questions with self-contained, factual answers
 * (seo.md §3.4/§8.2). Rendered as a visible <dl> AND emitted as FAQPage JSON-LD
 * (an AI-citation signal; Google retired FAQ rich results, so no SERP accordion).
 */
const FAQ = [
  {
    q: 'Does LocalMode UI work offline?',
    a: 'Yes. After the initial model download, inference runs entirely in the browser with no network requests, and data never leaves your device. The site is also an installable PWA, so its shell works offline.',
  },
  {
    q: 'Do I need an API key or a server?',
    a: 'No. Blocks run real models on-device via WebGPU or WebAssembly. There is no server and no API key, and installation is client-only.',
  },
  {
    q: 'How do I install a component?',
    a: 'Configure the @localmode namespace in your components.json, then run npx shadcn@latest add @localmode/ui/<name>. Components are copy-owned and inherit your shadcn/ui theme.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'WebGPU-capable browsers (Chrome and Edge 113+, Safari 26+) get GPU-accelerated inference; other modern browsers fall back to WebAssembly.',
  },
  {
    q: 'Is it free and open source?',
    a: 'Yes. LocalMode UI is MIT-licensed and free to use.',
  },
];

/**
 * Presentational, no-download demos for the hero collage — a curated slice of the
 * catalog (each is a mock-prop demo that downloads no model). Ordered tallest →
 * shortest so each grid row holds near-equal-height demos and the short trailing
 * CTA tile lands last. The full set lives in the components browser (CTA links there).
 */
const HERO_COLLAGE = [
  'ui/local-first/browser-compat-card',
  'ui/local-first/model-downloader',
  'ui/conversation/tool',
  'ui/devtools/pipeline-run-inspector',
  'ui/conversation/pipeline-tracker',
  'ui/local-first/model-loading-panel',
  'ui/conversation/message',
  'ui/input-controls/slash-command-palette',
  'ui/audio/transcribed-note-card',
  'ui/local-first/model-recommendation-card',
  'ui/conversation/agent-step-timeline',
  'ui/media-vision/bounding-box-overlay',
  'ui/media-vision/video-canvas',
  'ui/conversation/task',
];

/** Six featured blocks, each from a different category (static links; no block or model code ships here). */
const FEATURED_BLOCKS = [
  {
    title: 'Chat',
    href: '/blocks/chat',
    Icon: MessageSquare,
    description: 'Multi-provider on-device chat over a real model.',
  },
  {
    title: 'RAG Chat',
    href: '/blocks/knowledge/rag-chat',
    Icon: FileSearch,
    description: 'Grounded, cited answers streamed over your own documents, fully in the browser.',
  },
  {
    title: 'Object Detector',
    href: '/blocks/vision/object-detector',
    Icon: ScanSearch,
    description: 'Find and label objects in a photo or webcam frame with boxes and scores.',
  },
  {
    title: 'Voice Notes',
    href: '/blocks/audio/voice-notes',
    Icon: Mic,
    description: 'Record or upload audio and get a searchable on-device transcript.',
  },
  {
    title: 'Image Search',
    href: '/blocks/photo/image-search',
    Icon: Images,
    description: 'Find photos by describing them or by visual similarity, all on-device.',
  },
  {
    title: 'PII Redactor',
    href: '/blocks/privacy/pii-redactor',
    Icon: ShieldCheck,
    description: 'Detect and mask names, emails, and IDs with on-device NER.',
  },
];

export default function HomePage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <JsonLd data={homepageGraph()} />
      <JsonLd data={faqGraph(FAQ)} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-16">
        {/* Hero with copy + collage */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              @localmode/ui · shadcn registry
            </span>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              Local-First AI UI Components
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
              100+ copy-owned React components and 36 installable blocks for browser-native AI,
              across Chat, Knowledge &amp; RAG, Vision, Audio, Photo, Agents, and Privacy. Local-first
              by design, cloud-compatible by contract.
            </p>
            <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Read the docs
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/docs/components"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Boxes className="h-4 w-4" />
                Browse components
              </Link>
            </div>
            {/* Example: add a single component. Every other component installs the same way. */}
            <div className="mt-6 flex w-full max-w-xl flex-col items-center gap-2">
              <CopyableCommand command={installCommand('ui/conversation/message')} className="w-fit" />
              <p className="text-xs text-muted-foreground">
                Add any of the 100+ components the same way.{' '}
                <Link href="/docs/installation" className="text-primary underline underline-offset-2">
                  See the install guide
                </Link>
                .
              </p>
            </div>
          </div>

          <LiveCollage
            items={HERO_COLLAGE}
            cta={
              <Link
                href="/docs/components"
                className="group flex min-h-32 flex-col justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  100+ components
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  Conversation, Local-First, Audio, Results, Input Controls, Media &amp; Vision,
                  Data &amp; Documents, Artifacts, Security &amp; Privacy, and DevTools.
                </span>
                <span className="mt-1 inline-flex items-center justify-center gap-1 text-sm font-medium text-primary">
                  Explore all components
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            }
          />
        </section>

        {/* Featured blocks - the elements composed into installable experiences. */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-xl font-semibold">…and they run real models, on-device</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The Blocks gallery composes these elements into installable experiences, each running a
              real model entirely in your browser. No server, no API key.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURED_BLOCKS.map(({ title, href, Icon, description }) => (
              <Link
                key={href}
                href={href}
                data-testid={href === '/blocks/chat' ? 'home-chat-teaser' : undefined}
                className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-medium transition-colors group-hover:text-primary">{title}</span>
                </span>
                <span className="text-sm text-muted-foreground">{description}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3">
            <p className="max-w-2xl text-center text-sm text-muted-foreground">
              Plus 30 more blocks across 12 categories, including Writing Tools, Text Insights,
              Agents, Device, Image Studio, and Text.
            </p>
            {/* Matches the hero "Read the docs" button (filled primary) in both modes. */}
            <Link
              href="/blocks"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              See all blocks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Browser-reported capabilities + feature support */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-xl font-semibold">Everything runs on your device</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              What your browser reports it can do for on-device AI. Detected locally, nothing is sent
              anywhere.
            </p>
          </div>
          <CapabilitiesPanel />
          <Link
            href="/capabilities"
            className="inline-flex items-center gap-1 self-center text-sm font-medium text-primary hover:underline"
          >
            See the full capability report
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* FAQ — collapsible (closed by default); the FAQPage JSON-LD above mirrors
            it (the answers stay in the DOM even when collapsed, so AI/search read them). */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-xl font-semibold">Frequently asked questions</h2>
          </div>
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground">{a}</div>
              </details>
            ))}
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
