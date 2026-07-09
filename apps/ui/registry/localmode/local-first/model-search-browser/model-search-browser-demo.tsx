'use client';

import { useState } from 'react';

import {
  ModelSearchBrowser,
  type ModelRepoFile,
  type ModelSearchResult,
  type ModelSearchSort,
} from './model-search-browser';

const REPOS: ModelSearchResult[] = [
  {
    repoId: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    author: 'bartowski',
    downloads: 1_243_500,
    likes: 412,
    lastModified: '2026-05-18T09:30:00Z',
    tags: ['llama', 'text-generation', 'conversational', 'gguf', 'en'],
  },
  {
    repoId: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
    author: 'TheBloke',
    downloads: 2_051_000,
    likes: 934,
    lastModified: '2025-12-05T11:20:00Z',
    tags: ['mistral', 'text-generation', 'conversational', 'gguf', 'en', 'instruct'],
  },
  {
    repoId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    author: 'Qwen',
    downloads: 887_200,
    likes: 265,
    lastModified: '2026-06-02T14:00:00Z',
    tags: ['qwen2', 'text-generation', 'gguf', 'chat'],
  },
  {
    repoId: 'unsloth/gemma-3-4b-it-GGUF',
    author: 'unsloth',
    downloads: 512_400,
    likes: 198,
    lastModified: '2026-06-20T08:15:00Z',
    tags: ['gemma3', 'vision', 'text-generation', 'gguf', 'multimodal'],
  },
  {
    repoId: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    author: 'nomic-ai',
    downloads: 405_900,
    likes: 151,
    lastModified: '2026-03-11T17:45:00Z',
    tags: ['embeddings', 'sentence-similarity', 'gguf'],
  },
  {
    repoId: 'ggml-org/SmolLM3-3B-GGUF',
    author: 'ggml-org',
    downloads: 96_400,
    likes: 74,
    lastModified: '2026-06-27T10:05:00Z',
    tags: ['smollm3', 'text-generation', 'gguf'],
  },
];

const FILES: Record<string, ModelRepoFile[]> = {
  'bartowski/Llama-3.2-1B-Instruct-GGUF': [
    { filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', sizeBytes: 807_690_000, quantLabel: 'Q4_K_M' },
    { filename: 'Llama-3.2-1B-Instruct-Q6_K.gguf', sizeBytes: 1_021_800_000, quantLabel: 'Q6_K' },
    { filename: 'Llama-3.2-1B-Instruct-Q8_0.gguf', sizeBytes: 1_321_100_000, quantLabel: 'Q8_0' },
  ],
  'TheBloke/Mistral-7B-Instruct-v0.2-GGUF': [
    { filename: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf', sizeBytes: 4_368_400_000, quantLabel: 'Q4_K_M' },
    { filename: 'mistral-7b-instruct-v0.2.Q5_K_M.gguf', sizeBytes: 5_131_400_000, quantLabel: 'Q5_K_M' },
  ],
  'Qwen/Qwen2.5-0.5B-Instruct-GGUF': [
    { filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', sizeBytes: 397_800_000, quantLabel: 'Q4_K_M' },
    { filename: 'qwen2.5-0.5b-instruct-q8_0.gguf', sizeBytes: 531_100_000, quantLabel: 'Q8_0' },
  ],
  'unsloth/gemma-3-4b-it-GGUF': [
    { filename: 'gemma-3-4b-it-Q4_K_M.gguf', sizeBytes: 2_489_900_000, quantLabel: 'Q4_K_M' },
    { filename: 'gemma-3-4b-it-Q6_K.gguf', sizeBytes: 3_190_500_000, quantLabel: 'Q6_K' },
  ],
  'nomic-ai/nomic-embed-text-v1.5-GGUF': [
    { filename: 'nomic-embed-text-v1.5.Q4_K_M.gguf', sizeBytes: 84_100_000, quantLabel: 'Q4_K_M' },
    { filename: 'nomic-embed-text-v1.5.f16.gguf', sizeBytes: 274_300_000, quantLabel: 'F16' },
  ],
  'ggml-org/SmolLM3-3B-GGUF': [
    { filename: 'SmolLM3-3B-Q4_K_M.gguf', sizeBytes: 1_921_600_000, quantLabel: 'Q4_K_M' },
    { filename: 'SmolLM3-3B-Q8_0.gguf', sizeBytes: 3_285_400_000, quantLabel: 'Q8_0' },
  ],
};

/** Rows revealed initially; "Load more" reveals the rest. */
const PAGE_SIZE = 4;

/** Sort comparator over the fixture repos for the active sort order. */
function compareBySort(a: ModelSearchResult, b: ModelSearchResult, sort: ModelSearchSort) {
  if (sort === 'lastModified') return (b.lastModified ?? '').localeCompare(a.lastModified ?? '');
  return (b[sort] ?? 0) - (a[sort] ?? 0);
}

/**
 * Demo for ModelSearchBrowser, used by the docs live preview. Searches, sorts,
 * paginates, and expands a static fixture catalog of GGUF repos entirely in
 * local state — zero network requests and no model download on mount.
 */
export default function ModelSearchBrowserDemo() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ModelSearchSort>('downloads');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [picked, setPicked] = useState<string | null>(null);

  const filtered = REPOS.filter((r) =>
    r.repoId.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((a, b) => compareBySort(a, b, sort));
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ModelSearchBrowser
        query={query}
        onQueryChange={(q) => {
          setQuery(q);
          setVisibleCount(PAGE_SIZE);
          setExpanded(null);
        }}
        sort={sort}
        onSortChange={setSort}
        results={visible}
        hasMore={filtered.length > visibleCount}
        onLoadMore={() => setVisibleCount(filtered.length)}
        expandedRepoId={expanded}
        onSelectRepo={setExpanded}
        files={expanded ? (FILES[expanded] ?? []) : null}
        onSelectFile={(repoId, file) => setPicked(`${repoId}:${file.filename}`)}
      />
      {picked && (
        <p className="w-full max-w-2xl truncate text-xs text-muted-foreground">
          Selected: <span className="font-mono">{picked}</span>
        </p>
      )}
    </div>
  );
}
