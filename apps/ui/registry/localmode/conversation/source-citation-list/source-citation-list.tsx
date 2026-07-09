'use client';

/**
 * @file source-citation-list.tsx
 * @description A container + item form for retrieved RAG passages, rendered
 * inside an assistant message behind a collapsible "Show N sources" toggle. Each
 * item shows a numbered badge, a similarity score (flat text + radial-progress
 * confidence ring), and clamped body text with a staggered fade-in. Extends the
 * catalog `Sources` for in-message attribution. Data source: a `Source[]`
 * (`{ text, score }`) from `useSemanticSearch` / `useAnswerQuestion` /
 * `useAskDocument`.
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';

/** A cited source/passage. */
export interface CitationSource {
  /** The passage text. */
  text: string;
  /** Similarity score in [0, 1]. */
  score: number;
  /** Optional title/label. */
  title?: string;
}

/** Props for {@link ConfidenceRing}. */
export interface ConfidenceRingProps {
  /** Score in [0, 1]. */
  score: number;
  /** Diameter in px. @default 28 */
  size?: number;
}

/** A small radial-progress confidence ring (SVG, no deps). */
export function ConfidenceRing({ score, size = 28 }: ConfidenceRingProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-slot="confidence-ring"
      aria-label={`Relevance ${(clamped * 100).toFixed(0)}%`}
      role="img"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="stroke-primary transition-[stroke-dashoffset]"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-[8px] font-medium tabular-nums"
      >
        {(clamped * 100).toFixed(0)}
      </text>
    </svg>
  );
}

/** Props for {@link SourceCitationList}. */
export interface SourceCitationListProps extends React.ComponentProps<'div'> {
  /** The retrieved sources to attribute. */
  sources: CitationSource[];
  /** Open by default. @default false */
  defaultOpen?: boolean;
}

/**
 * Collapsible attributed-sources list for an assistant answer.
 *
 * @example
 * ```tsx
 * <SourceCitationList sources={results.map((r) => ({ text: r.text, score: r.score }))} />
 * ```
 */
export function SourceCitationList({
  sources,
  defaultOpen = false,
  className,
  ...props
}: SourceCitationListProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (sources.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="source-citation-list"
      className={cn('mt-2 text-sm', className)}
      {...props}
    >
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
        Show {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-2">
          {sources.map((source, i) => (
            <li
              key={i}
              data-slot="citation-item"
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-2.5"
              style={{
                animation: 'localmode-citation-fade 0.3s ease both',
                animationDelay: `${i * 0.05}s`,
              }}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {source.title && (
                  <p className="truncate text-xs font-medium text-foreground">
                    {source.title}
                  </p>
                )}
                <p className="line-clamp-3 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {source.text}
                </p>
              </div>
              <ConfidenceRing score={source.score} />
            </li>
          ))}
        </ol>
        <style>{`
          @keyframes localmode-citation-fade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </CollapsibleContent>
    </Collapsible>
  );
}
