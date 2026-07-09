'use client';

import { FileText } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Parsed model metadata fields. The GGUF shape originates from `@localmode/wllama`. */
export interface ModelMetadata {
  /** Architecture (e.g. "llama"). */
  architecture?: string;
  /** Parameter count (raw number or label). */
  parameters?: number | string;
  /** Quantization scheme (e.g. "Q4_K_M"). */
  quantization?: string;
  /** Context length in tokens. */
  contextLength?: number;
  /** Embedding dimension. */
  embeddingDimension?: number;
  /** Vocabulary size. */
  vocabSize?: number;
  /** Number of attention heads. */
  headCount?: number;
  /** Number of transformer layers / blocks. */
  layerCount?: number;
  /** File size in bytes. */
  fileSizeBytes?: number;
  /** Optional author / organization. */
  author?: string;
  /** Optional license identifier. */
  license?: string;
}

/** A descriptor describing how to render one metadata field. */
interface FieldDescriptor {
  key: keyof ModelMetadata;
  label: string;
  format?: (value: NonNullable<ModelMetadata[keyof ModelMetadata]>) => string;
}

function formatBytes(value: number | string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return String(value);
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(value: number | string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : String(value);
}

const FIELDS: FieldDescriptor[] = [
  { key: 'architecture', label: 'Architecture' },
  { key: 'parameters', label: 'Parameters', format: (v) => formatNumber(v as number) },
  { key: 'quantization', label: 'Quantization' },
  { key: 'contextLength', label: 'Context length', format: (v) => formatNumber(v as number) },
  { key: 'embeddingDimension', label: 'Embedding dim', format: (v) => formatNumber(v as number) },
  { key: 'vocabSize', label: 'Vocab size', format: (v) => formatNumber(v as number) },
  { key: 'headCount', label: 'Heads', format: (v) => formatNumber(v as number) },
  { key: 'layerCount', label: 'Layers', format: (v) => formatNumber(v as number) },
  { key: 'fileSizeBytes', label: 'File size', format: (v) => formatBytes(v as number) },
  { key: 'author', label: 'Author' },
  { key: 'license', label: 'License' },
];

/** Props for {@link GGUFMetadataCard}. */
export interface GGUFMetadataCardProps {
  /** Parsed metadata fields. Absent optional fields are omitted from the grid. */
  metadata: ModelMetadata;
  /** Optional title. @default "Model metadata" */
  title?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A structured key-value grid of parsed model metadata — architecture,
 * parameter count, quantization, context length, embedding dimension, vocab
 * size, head/layer counts, file size, and optional author/license — driven by a
 * field-descriptor array so absent fields are skipped cleanly. The GGUF shape
 * comes from `@localmode/wllama`; the display is a generic metadata grid (hence
 * the `ModelMetadataCard` alias). Feed it `parseGGUFMetadata()` output from
 * `@localmode/wllama` (or any object matching `ModelMetadata`).
 *
 * @example
 * ```tsx
 * const metadata = await parseGGUFMetadata(modelUrl);
 * <GGUFMetadataCard metadata={metadata} />
 * ```
 */
export function GGUFMetadataCard({
  metadata,
  title = 'Model metadata',
  className,
}: GGUFMetadataCardProps) {
  const rows = FIELDS.filter((f) => metadata[f.key] != null);

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No metadata available.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map((f) => {
            const value = metadata[f.key]!;
            return (
              <div key={String(f.key)} className="flex flex-col gap-0.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="truncate text-sm font-medium tabular-nums">
                  {f.format ? f.format(value) : String(value)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/** Alias of {@link GGUFMetadataCard} for non-GGUF metadata shapes. */
export const ModelMetadataCard = GGUFMetadataCard;
