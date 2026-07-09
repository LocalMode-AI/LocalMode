'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Props for {@link MaskTokenInput}. */
export interface MaskTokenInputProps {
  /** Current text value (controlled). */
  value: string;
  /** Fired with the new text on every edit. */
  onChange: (value: string) => void;
  /**
   * The mask token the fill-mask model expects.
   * @default "[MASK]"
   */
  maskToken?: string;
  /**
   * Fired on Cmd/Ctrl+Enter (and via the inline hint button) when the value
   * contains the mask token — wire this to your `useFillMask().execute(value)`.
   */
  onSubmit?: (value: string) => void;
  /**
   * Sample sentences inserted by the randomize button. Each should contain the
   * `maskToken`. If omitted, a small built-in set is used.
   */
  samples?: string[];
  /** Placeholder for the textarea. */
  placeholder?: string;
  /**
   * Accessible name for the textarea. The field has no associated visible
   * `<label>`, so this is applied as its `aria-label`; override it to match a
   * nearby heading in your layout.
   * @default "Fill-mask sentence"
   */
  ariaLabel?: string;
  /** Disable input and actions (e.g. while a prediction is running). */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const DEFAULT_SAMPLES = [
  'The capital of France is [MASK].',
  'Local-first AI runs entirely in your [MASK].',
  'The weather today is [MASK] and sunny.',
  'My favorite programming language is [MASK].',
];

/** Split text around the (first) mask token so the span can be highlighted. */
function splitOnMask(text: string, maskToken: string) {
  const idx = text.indexOf(maskToken);
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    mask: maskToken,
    after: text.slice(idx + maskToken.length),
  };
}

/**
 * A textarea for fill-mask / cloze input. It detects a configurable mask token
 * (default `[MASK]`), renders an inline highlighted preview with the mask span
 * accented, shows a validation hint ("detected" vs "Add [MASK]"), offers a
 * randomize button that inserts a valid sample, and surfaces a Cmd+Enter badge.
 *
 * Presentational only — pair its `value`/`onSubmit` with `@localmode/react`'s
 * `useFillMask()` to run predictions. Styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * const { data, execute } = useFillMask({ model });
 * const [text, setText] = useState('The capital of France is [MASK].');
 * <MaskTokenInput value={text} onChange={setText} onSubmit={execute} />
 * ```
 */
export function MaskTokenInput({
  value,
  onChange,
  maskToken = '[MASK]',
  onSubmit,
  samples = DEFAULT_SAMPLES,
  placeholder = `Enter a sentence with ${'[MASK]'}…`,
  ariaLabel = 'Fill-mask sentence',
  disabled = false,
  className,
}: MaskTokenInputProps) {
  const id = useId();
  const parts = splitOnMask(value, maskToken);
  const hasMask = parts !== null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasMask && !disabled) {
      e.preventDefault();
      onSubmit?.(value);
    }
  };

  const randomize = () => {
    const next = samples[Math.floor(Math.random() * samples.length)] ?? value;
    // `split().join()` instead of `String.replaceAll` so the copied component
    // compiles under a consumer tsconfig whose `lib` predates ES2021.
    onChange(next.split('[MASK]').join(maskToken));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <textarea
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className={cn(
          'w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />

      {/* Inline highlighted preview of the mask span */}
      {hasMask && (
        <div
          aria-hidden="true"
          className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed"
        >
          <span className="text-muted-foreground">{parts.before}</span>
          {/* `-mx-0.5` compensates the horizontal padding so the highlight hugs
              the token and does not leave a tinted gap before following
              punctuation (e.g. the "." in "…is [MASK]."). */}
          <mark className="-mx-0.5 rounded bg-primary/15 px-1 font-medium text-primary">
            {parts.mask}
          </mark>
          <span className="text-muted-foreground">{parts.after}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          role="status"
          className={cn(
            'inline-flex min-w-0 items-center gap-1.5 break-words font-medium [overflow-wrap:anywhere]',
            hasMask ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          <span
            className={cn(
              'inline-block size-1.5 rounded-full',
              hasMask ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          {hasMask ? 'Mask detected' : `Add ${maskToken}`}
        </span>

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={randomize}
            disabled={disabled}
            className="rounded-md border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            Randomize
          </button>
          <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘↵
          </kbd>
        </div>
      </div>
    </div>
  );
}
