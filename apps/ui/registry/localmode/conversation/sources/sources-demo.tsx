'use client';

/**
 * @file sources-demo.tsx
 * @description Docs preview for `Sources`. Collapsible list of local RAG
 * citations with relevance scores; all metadata is local (no network unfurl).
 */
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
  type SourceItem,
} from './sources';

const SOURCES: SourceItem[] = [
  {
    id: '1',
    title: 'Local-first architecture',
    excerpt: 'Models are cached on-device; subsequent runs work fully offline.',
    score: 0.92,
  },
  {
    id: '2',
    title: 'WebGPU acceleration',
    excerpt: 'GPU compute shaders speed up vector distance and inference.',
    score: 0.81,
  },
  {
    id: '3',
    title: 'Privacy guarantees',
    excerpt: 'Data never leaves the device - no telemetry, no API keys.',
    score: 0.74,
  },
];

export default function SourcesDemo() {
  return (
    <div className="w-full max-w-xl">
      <Sources defaultOpen>
        <SourcesTrigger count={SOURCES.length} />
        <SourcesContent>
          {SOURCES.map((s) => (
            <Source key={s.id} source={s} />
          ))}
        </SourcesContent>
      </Sources>
    </div>
  );
}
