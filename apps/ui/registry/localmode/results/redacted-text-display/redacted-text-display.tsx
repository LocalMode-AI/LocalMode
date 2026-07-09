'use client';

import { cn } from '@/lib/utils';

/**
 * A detected entity span, matching the shape returned by `useExtractEntities`
 * (`@localmode/react`). Spans drive the redaction tokens.
 */
export interface DetectedEntity {
  /** The entity text as it appears in the input. */
  text: string;
  /** Entity type (e.g. 'PER', 'LOC', 'ORG', 'MISC'). */
  type: string;
  /** Start character offset in the source text. */
  start: number;
  /** End character offset in the source text (exclusive). */
  end: number;
  /** Confidence score (0–1). */
  score?: number;
}

/** Display config for one entity type. */
export interface EntityTypeConfig {
  /** Human-readable label, shown in the token tooltip. Falls back to the type. */
  label?: string;
  /** Token color (any CSS color). */
  color: string;
}

/** A registry mapping entity-type keys → display config. */
export type EntityTypeRegistry = Record<string, EntityTypeConfig>;

/** Props for {@link RedactedTextDisplay}. */
export interface RedactedTextDisplayProps {
  /** The original source text. */
  text: string;
  /** The detected entity spans (each with `start`/`end` offsets). */
  entities: DetectedEntity[];
  /**
   * Per-type display config (label + color). Types absent from the registry
   * render with a default color.
   * @default the built-in PER/LOC/ORG/MISC registry
   */
  registry?: EntityTypeRegistry;
  /**
   * When true, render a scanning skeleton instead of text.
   * @default false
   */
  isScanning?: boolean;
  /**
   * Rendered when there is no text.
   * @default "Nothing to display"
   */
  emptyState?: React.ReactNode;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Default entity-type registry — colors wired to CSS variables. */
const DEFAULT_REGISTRY: EntityTypeRegistry = {
  PER: { label: 'Person', color: 'var(--color-sky-500, #0ea5e9)' },
  LOC: { label: 'Location', color: 'var(--color-emerald-500, #10b981)' },
  ORG: { label: 'Organization', color: 'var(--color-violet-500, #8b5cf6)' },
  MISC: { label: 'Misc', color: 'var(--color-amber-500, #f59e0b)' },
};

const FALLBACK_COLOR = 'var(--color-muted-foreground, #6b7280)';

/** A plain-text or entity-token segment. */
type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'entity'; value: string; entity: DetectedEntity };

/**
 * Interleave plain text with entity spans into an ordered segment list. Spans
 * are sorted by offset; overlaps are resolved by keeping the earliest. Exported
 * for reuse/testing.
 */
export function segmentText(
  text: string,
  entities: DetectedEntity[],
): Segment[] {
  const sorted = [...entities]
    .filter((e) => e.start >= 0 && e.end <= text.length && e.start < e.end)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  const lastIsEntity = () =>
    segments.length > 0 && segments[segments.length - 1].kind === 'entity';

  for (const entity of sorted) {
    if (entity.start < cursor) continue; // skip overlapping span
    if (entity.start > cursor) {
      // Trim the whitespace that abuts a token on either side — each token's own
      // horizontal margin (mx-0.5) supplies the gap, so keeping the source space
      // would double it (a loose "in  [LOC]London") or leave trailing
      // punctuation floating ("London  .").
      let inner = text.slice(cursor, entity.start).replace(/\s+$/, '');
      if (lastIsEntity()) inner = inner.replace(/^\s+/, '');
      if (inner) segments.push({ kind: 'text', value: inner });
    }
    segments.push({
      kind: 'entity',
      value: text.slice(entity.start, entity.end),
      entity,
    });
    cursor = entity.end;
  }
  if (cursor < text.length) {
    // Trailing tail: trim the leading whitespace abutting the last token so
    // closing punctuation hugs it ("London." not "London  .").
    const tail = lastIsEntity()
      ? text.slice(cursor).replace(/^\s+/, '')
      : text.slice(cursor);
    if (tail) segments.push({ kind: 'text', value: tail });
  }
  return segments;
}

/**
 * An inline-annotated text renderer that interleaves plain text with color-coded
 * redaction tokens (e.g. `[PER]`, `[LOC]`) styled per entity type, each
 * tooltipped (native `title`) with its entity type. Includes a scanning loading
 * skeleton and an empty placeholder. Pass the source text plus the detected
 * entity spans from `useExtractEntities`.
 *
 * @example
 * ```tsx
 * const { entities } = useExtractEntities({ model, text });
 * <RedactedTextDisplay text={text} entities={entities ?? []} />
 * ```
 */
export function RedactedTextDisplay({
  text,
  entities,
  registry = DEFAULT_REGISTRY,
  isScanning = false,
  emptyState = 'Nothing to display',
  className,
}: RedactedTextDisplayProps) {
  if (isScanning) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border bg-card p-4',
          className,
        )}
        aria-busy="true"
      >
        <div className="space-y-2">
          {[100, 92, 78].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        {/* Scanning sweep. */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[scan_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <style>{`@keyframes scan { to { transform: translateX(100%); } }`}</style>
      </div>
    );
  }

  if (!text) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        {emptyState}
      </div>
    );
  }

  const segments = segmentText(text, entities);

  return (
    <p
      className={cn(
        'rounded-lg border border-border bg-card p-4 text-sm leading-7 text-card-foreground',
        className,
      )}
    >
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          return <span key={i}>{segment.value}</span>;
        }
        const config = registry[segment.entity.type];
        const color = config?.color ?? FALLBACK_COLOR;
        const typeLabel = config?.label ?? segment.entity.type;
        return (
          <span
            key={i}
            title={`${typeLabel}: ${segment.value}`}
            className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 align-middle text-xs font-medium"
            style={{ backgroundColor: `${color}26`, color }}
          >
            <span className="select-none opacity-70">[{segment.entity.type}]</span>
            <span className="min-w-0 break-all">{segment.value}</span>
          </span>
        );
      })}
    </p>
  );
}
