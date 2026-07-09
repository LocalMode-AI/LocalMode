'use client';

import {
  Binary,
  Brain,
  Eye,
  Layers,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** A model catalog entry (wllama / webllm / transformers / litert / mediapipe shapes). */
export interface CatalogEntry {
  /** Stable model id (passed to `onClick`). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable size (e.g. "1.2 GB"). */
  size?: string;
  /** One-line description. */
  description?: string;
  /** Architecture (e.g. "llama"). */
  architecture?: string;
  /** Parameter count label (e.g. "1.2B"). */
  parameters?: string;
  /** Quantization label (e.g. "Q4_K_M"). */
  quantization?: string;
  /** Context window in tokens. */
  contextLength?: number;
  /** Capability flags. */
  tools?: boolean;
  vision?: boolean;
  embedding?: boolean;
  reranking?: boolean;
  reasoning?: boolean;
}

/** Props for {@link ModelCatalogCard}. */
export interface ModelCatalogCardProps {
  /** The catalog entry to render. */
  entry: CatalogEntry;
  /** Whether this card is the selected one (adds an accent ring). */
  selected?: boolean;
  /** Fired with the entry id when the card is clicked. */
  onClick?: (modelId: string) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const CAPABILITIES: {
  key: keyof CatalogEntry;
  label: string;
  Icon: typeof Eye;
}[] = [
  { key: 'tools', label: 'Tools', Icon: Wrench },
  { key: 'vision', label: 'Vision', Icon: Eye },
  { key: 'embedding', label: 'Embedding', Icon: Binary },
  { key: 'reranking', label: 'Rerank', Icon: Layers },
  { key: 'reasoning', label: 'Reasoning', Icon: Brain },
];

function formatContext(tokens: number): string {
  if (tokens >= 1024 && tokens % 1024 === 0) return `${tokens / 1024}K`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

/**
 * A rich tile for a single model catalog entry: name, a size badge, an optional
 * description, a metadata chip row (architecture, params, quantization,
 * context), and a capability sub-row (tools / vision / embedding / reranking /
 * reasoning) rendered conditionally from the entry's flags. Complements
 * `ModelSelector` (a picker control) — this is a presentation tile. Fires
 * `onClick(id)` for selection and supports a selected ring.
 *
 * @example
 * ```tsx
 * <ModelCatalogCard entry={entry} selected onClick={pick} />
 * ```
 */
export function ModelCatalogCard({
  entry,
  selected = false,
  onClick,
  className,
}: ModelCatalogCardProps) {
  const chips = [
    entry.architecture,
    entry.parameters,
    entry.quantization,
    entry.contextLength != null ? `${formatContext(entry.contextLength)} ctx` : null,
  ].filter(Boolean) as string[];

  const caps = CAPABILITIES.filter((c) => Boolean(entry[c.key]));

  return (
    <button
      type="button"
      onClick={() => onClick?.(entry.id)}
      className={cn(
        'flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-accent/30',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</p>
        {entry.size && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {entry.size}
          </span>
        )}
      </div>

      {entry.description && (
        <p className="line-clamp-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {entry.description}
        </p>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {caps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {caps.map(({ key, label, Icon }) => (
            <span
              key={key}
              className="inline-flex min-w-fit items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
            >
              <Icon className="size-3 text-primary" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      )}

      {selected && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <Sparkles className="size-3" aria-hidden="true" />
          Selected
        </span>
      )}
    </button>
  );
}
