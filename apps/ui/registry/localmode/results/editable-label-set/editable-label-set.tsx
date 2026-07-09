'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for {@link EditableLabelSet}. */
export interface EditableLabelSetProps {
  /** The controlled list of labels. */
  labels: string[];
  /** Invoked with the trimmed new label when the user adds one. */
  onAdd: (label: string) => void;
  /** Invoked with the label (and its index) when the user removes a chip. */
  onRemove: (label: string, index: number) => void;
  /**
   * Placeholder for the inline add input.
   * @default "Add a label…"
   */
  placeholder?: string;
  /**
   * Color palette cycled by chip index. Each entry is a CSS color (defaults are
   * wired to CSS variables so chips theme via the consumer's tokens).
   */
  palette?: string[];
  /**
   * Disable adding when the count reaches this limit.
   */
  maxLabels?: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Default chip palette — cycled by index. */
const DEFAULT_PALETTE = [
  'var(--color-sky-500, #0ea5e9)',
  'var(--color-violet-500, #8b5cf6)',
  'var(--color-emerald-500, #10b981)',
  'var(--color-amber-500, #f59e0b)',
  'var(--color-rose-500, #f43f5e)',
  'var(--color-teal-500, #14b8a6)',
];

/**
 * An editable set of color-cycling removable chips managing a candidate-label
 * list — for zero-shot classification candidate labels or any string-tag
 * collection. Chips reveal a remove control on hover; an inline input adds new
 * labels. Fully controlled via `labels` / `onAdd` / `onRemove`.
 *
 * @example
 * ```tsx
 * const [labels, setLabels] = useState(['positive', 'negative']);
 * <EditableLabelSet
 *   labels={labels}
 *   onAdd={(l) => setLabels((p) => [...p, l])}
 *   onRemove={(_, i) => setLabels((p) => p.filter((_, j) => j !== i))}
 * />
 * ```
 */
export function EditableLabelSet({
  labels,
  onAdd,
  onRemove,
  placeholder = 'Add a label…',
  palette = DEFAULT_PALETTE,
  maxLabels,
  className,
}: EditableLabelSetProps) {
  const [draft, setDraft] = useState('');
  const atLimit = typeof maxLabels === 'number' && labels.length >= maxLabels;

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || atLimit) return;
    if (labels.includes(trimmed)) {
      setDraft('');
      return;
    }
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2',
        className,
      )}
    >
      {labels.map((label, i) => {
        const color = palette[i % palette.length];
        return (
          <span
            key={`${label}-${i}`}
            // The hue lives on the dot + border + a subtle background tint; the
            // label text uses the theme `foreground` token so it clears WCAG AA
            // (4.5:1) in BOTH light and dark themes — the previous full-
            // saturation hue text over a 10% tint failed AA in light mode.
            className="group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground"
            style={{
              borderColor: `${color}66`,
              backgroundColor: `${color}1f`,
            }}
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
            <button
              type="button"
              onClick={() => onRemove(label, i)}
              aria-label={`Remove ${label}`}
              className="-m-1 grid place-items-center rounded-full p-1.5 text-muted-foreground opacity-70 transition-opacity hover:bg-foreground/10 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <input
        type="text"
        aria-label="Add label"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && labels.length) {
            onRemove(labels[labels.length - 1], labels.length - 1);
          }
        }}
        onBlur={commit}
        disabled={atLimit}
        placeholder={atLimit ? `Max ${maxLabels} labels` : placeholder}
        className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
