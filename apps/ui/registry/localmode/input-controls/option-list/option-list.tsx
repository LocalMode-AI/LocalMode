'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A single selectable option. */
export interface Option {
  /** Stable identifier emitted on select. */
  id: string;
  /** Visible label. */
  label: string;
  /** Optional secondary description. */
  description?: string;
}

/** Props for {@link OptionList}. */
export interface OptionListProps {
  /** The choices to present. Lists longer than `pageSize` paginate. */
  options: Option[];
  /** Fired with the chosen option when the user selects one. */
  onSelect: (option: Option) => void;
  /**
   * Maximum options shown per page before paginating.
   * @default 6
   */
  pageSize?: number;
  /** Optional prompt rendered above the choices. */
  prompt?: string;
  /** Currently selected option id (renders that option as active). */
  selectedId?: string;
  /** Disable interaction (e.g. while the agent is thinking). */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * An inline multi-choice selection list presented in a chat / agent turn for
 * the user to pick from — distinct from quick-reply suggestion chips. It shows
 * up to `pageSize` (5–7) options at a time and paginates longer lists. The
 * choice is meant to feed back into a local agent inquiry loop (e.g.
 * human-in-the-loop disambiguation in `useAgent`).
 *
 * Presentational only — styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * <OptionList
 *   prompt="Which file did you mean?"
 *   options={candidates}
 *   onSelect={(opt) => resumeAgent(opt.id)}
 * />
 * ```
 */
export function OptionList({
  options,
  onSelect,
  pageSize = 6,
  prompt,
  selectedId,
  disabled = false,
  className,
}: OptionListProps) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(options.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = options.slice(start, start + pageSize);

  return (
    <div
      role="group"
      aria-label={prompt ?? 'Options'}
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3',
        className,
      )}
    >
      {prompt && <p className="text-sm font-medium">{prompt}</p>}

      <ul className="flex flex-col gap-1.5">
        {visible.map((option, index) => {
          const active = option.id === selectedId;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(option)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
                  active
                    ? 'border-border border-l-2 border-l-primary bg-accent font-medium'
                    : 'border-border hover:bg-accent',
                )}
              >
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                  {start + index + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="break-words font-medium [overflow-wrap:anywhere]">{option.label}</span>
                  {option.description && (
                    <span className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage === pageCount - 1}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:text-foreground disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
