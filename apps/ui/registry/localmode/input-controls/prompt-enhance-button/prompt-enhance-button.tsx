'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A few-shot example: a draft prompt and its improved rewrite. */
export interface FewShotExample {
  /** The original draft. */
  draft: string;
  /** The improved rewrite the model should emulate. */
  improved: string;
}

/** Props for {@link PromptEnhanceButton}. */
export interface PromptEnhanceButtonProps {
  /**
   * Enhance the given draft and resolve with the rewritten prompt. Wire this to
   * a local generation call — e.g. `useGenerateText().execute(buildInstruction(draft))`.
   * The `examples` are the current few-shot pairs (if the editor is enabled).
   */
  onEnhance: (draft: string, examples: FewShotExample[]) => Promise<string | null>;
  /** The current draft prompt to improve. */
  draft: string;
  /** Fired with the improved prompt when enhancement succeeds. */
  onApply: (improved: string) => void;
  /**
   * Show an inline few-shot example editor for interactive prompt tuning.
   * @default false
   */
  showExampleEditor?: boolean;
  /** Button label. */
  label?: string;
  /** Disable the control. */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A one-click "enhance my prompt" control for a composer. It hands the user's
 * draft to a local model (via the `onEnhance` callback the consumer wires to
 * `useGenerateText()`) and applies the rewritten prompt — all offline. An
 * optional few-shot example editor lets users teach the rewrite by example.
 *
 * Presentational + callback-driven; the rewrite runs on a local model in the
 * consumer. Styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * const { execute } = useGenerateText({ model });
 * <PromptEnhanceButton
 *   draft={prompt}
 *   onApply={setPrompt}
 *   onEnhance={async (draft) => {
 *     const r = await execute(`Rewrite this prompt to be clearer:\n${draft}`);
 *     return r?.text ?? null;
 *   }}
 * />
 * ```
 */
export function PromptEnhanceButton({
  onEnhance,
  draft,
  onApply,
  showExampleEditor = false,
  label = 'Enhance',
  disabled = false,
  className,
}: PromptEnhanceButtonProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<FewShotExample[]>([]);

  const enhance = async () => {
    if (!draft.trim() || isEnhancing) return;
    setIsEnhancing(true);
    setError(null);
    try {
      const improved = await onEnhance(draft, examples);
      if (improved) onApply(improved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enhancement failed');
    } finally {
      setIsEnhancing(false);
    }
  };

  const addExample = () =>
    setExamples((prev) => [...prev, { draft: '', improved: '' }]);
  const removeExample = (index: number) =>
    setExamples((prev) => prev.filter((_, i) => i !== index));
  const updateExample = (index: number, field: keyof FewShotExample, value: string) =>
    setExamples((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)),
    );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        onClick={enhance}
        disabled={disabled || isEnhancing || !draft.trim()}
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {isEnhancing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4 text-primary" />
        )}
        {isEnhancing ? 'Enhancing…' : label}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showExampleEditor && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Few-shot examples
            </span>
            <button
              type="button"
              onClick={addExample}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Plus className="size-3.5" />
              Add
            </button>
          </div>
          {examples.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add draft → improved pairs to guide the rewrite.
            </p>
          )}
          {examples.map((ex, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Example {i + 1}</span>
                <button
                  type="button"
                  aria-label="Remove example"
                  onClick={() => removeExample(i)}
                  className="rounded-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <input
                value={ex.draft}
                onChange={(e) => updateExample(i, 'draft', e.target.value)}
                placeholder="Draft prompt…"
                className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <input
                value={ex.improved}
                onChange={(e) => updateExample(i, 'improved', e.target.value)}
                placeholder="Improved rewrite…"
                className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
