'use client';

/**
 * @file source-citation-list-demo.tsx
 * @description Docs preview for `SourceCitationList`. Renders an assistant
 * answer with a collapsible "Show N sources" attribution, each with a radial
 * confidence ring.
 */
import {
  SourceCitationList,
  type CitationSource,
} from './source-citation-list';

const SOURCES: CitationSource[] = [
  {
    title: 'handbook.pdf, p.12',
    text: 'After the first model download, all inference runs locally with no network access required.',
    score: 0.93,
  },
  {
    title: 'faq.md',
    text: 'Your data never leaves the device. There is no telemetry and no API keys.',
    score: 0.78,
  },
  {
    title: 'architecture.md',
    text: 'Vector search and embeddings execute in the browser via WebGPU or WASM.',
    score: 0.65,
  },
];

export default function SourceCitationListDemo() {
  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 text-card-foreground">
      <p className="text-sm">
        Yes, LocalMode works fully offline after the initial download, and your
        data stays on the device.
      </p>
      <SourceCitationList sources={SOURCES} defaultOpen />
    </div>
  );
}
