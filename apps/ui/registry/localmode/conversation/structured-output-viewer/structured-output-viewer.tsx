'use client';

/**
 * @file structured-output-viewer.tsx
 * @description A result panel for `useGenerateObject`. Pretty-prints the
 * extracted JSON in a scrollable block, pairs it with an independently-usable
 * `InferenceStats` footer (token count, wall-clock duration, attempt/retry
 * count), and offers a navigable typed `SchemaTree` view alongside the value so
 * output can be inspected both as data and as its schema shape. Extends the
 * catalog `Response`. Data source: `useGenerateObject`.
 */
import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/registry/localmode/ui/tabs';

/** Generation usage (mirrors `@localmode/core` `GenerationUsage`). */
export interface InferenceUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Props for {@link InferenceStats}. */
export interface InferenceStatsProps extends React.ComponentProps<'div'> {
  /** Token usage. */
  usage?: InferenceUsage;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Number of attempts/retries the generation took. */
  attempts?: number;
}

/** Format a millisecond duration compactly. */
function fmtDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * A compact inference-stats footer. Independently usable beneath any generation
 * result (same usage shape as `useGenerateText`).
 */
export function InferenceStats({
  usage,
  durationMs,
  attempts,
  className,
  ...props
}: InferenceStatsProps) {
  const tokens = usage?.totalTokens ?? usage?.outputTokens;
  const tps =
    tokens != null && durationMs && durationMs > 0
      ? (tokens / (durationMs / 1000)).toFixed(1)
      : null;

  return (
    <div
      data-slot="inference-stats"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      {tokens != null && (
        <span className="tabular-nums">{tokens} tokens</span>
      )}
      {durationMs != null && (
        <span className="tabular-nums">{fmtDuration(durationMs)}</span>
      )}
      {tps != null && <span className="tabular-nums">{tps} tok/s</span>}
      {attempts != null && (
        <span className="tabular-nums">
          {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
        </span>
      )}
    </div>
  );
}

/** Derive a coarse JSON type name for the schema tree. */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Props for {@link SchemaTree}. */
export interface SchemaTreeProps {
  /** The value whose shape is rendered as a typed tree. */
  value: unknown;
  /** Field name (internal/recursive). */
  name?: string;
  /** Nesting depth (internal/recursive). */
  depth?: number;
}

/** A collapsible typed schema tree derived from the value's shape. */
export function SchemaTree({ value, name, depth = 0 }: SchemaTreeProps) {
  const [open, setOpen] = React.useState(depth < 2);
  const t = typeName(value);
  const isContainer = t === 'object' || t === 'array';

  const entries: [string, unknown][] = isContainer
    ? Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>)
    : [];

  return (
    <div
      data-slot="schema-tree"
      className="font-mono text-xs"
      style={{ paddingLeft: depth > 0 ? 12 : 0 }}
    >
      <div className="flex items-center gap-1.5 py-0.5">
        {isContainer && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        {!isContainer && <span className="size-5 shrink-0" />}
        {name != null && <span className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">{name}</span>}
        {name != null && <span className="text-muted-foreground">:</span>}
        <span className="text-primary">{t}</span>
        {isContainer && (
          <span className="text-muted-foreground">
            {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
          </span>
        )}
      </div>
      {isContainer && open && (
        <div className="border-l border-border">
          {entries.map(([k, v]) => (
            <SchemaTree key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Props for {@link StructuredOutputViewer}. */
export interface StructuredOutputViewerProps
  extends React.ComponentProps<'div'> {
  /** The generated object (from `useGenerateObject`). */
  object: unknown;
  /** Token usage to surface in the footer. */
  usage?: InferenceUsage;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Number of attempts/retries. */
  attempts?: number;
}

/**
 * Structured-output panel with JSON + schema-tree tabs and an inference footer.
 *
 * @example
 * ```tsx
 * const { data } = useGenerateObject({ model, schema });
 * <StructuredOutputViewer object={data?.object} usage={data?.usage} />
 * ```
 */
export function StructuredOutputViewer({
  object,
  usage,
  durationMs,
  attempts,
  className,
  ...props
}: StructuredOutputViewerProps) {
  const json = React.useMemo(() => {
    try {
      return JSON.stringify(object, null, 2);
    } catch {
      return String(object);
    }
  }, [object]);

  return (
    <div
      data-slot="structured-output-viewer"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
      {...props}
    >
      <Tabs defaultValue="json">
        <div className="border-b border-border px-2 pt-2 pb-2">
          <TabsList>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="json" className="m-0">
          <pre className="max-h-80 overflow-auto p-3 text-xs">
            <code>{json}</code>
          </pre>
        </TabsContent>
        <TabsContent value="schema" className="m-0">
          <div className="max-h-80 overflow-auto p-3">
            <SchemaTree value={object} />
          </div>
        </TabsContent>
      </Tabs>
      {(usage || durationMs != null || attempts != null) && (
        <InferenceStats usage={usage} durationMs={durationMs} attempts={attempts} />
      )}
    </div>
  );
}
