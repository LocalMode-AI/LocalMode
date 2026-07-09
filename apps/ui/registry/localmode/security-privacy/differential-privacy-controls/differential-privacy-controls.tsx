'use client';

import { ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { Slider as SliderPrimitive } from 'radix-ui';

import { cn } from '@/registry/localmode/lib/utils';
import { Badge } from '@/registry/localmode/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';
import { Switch } from '@/registry/localmode/ui/switch';

/** Derived privacy level from epsilon (lower epsilon → more privacy). */
export type PrivacyLevel = 'High' | 'Balanced' | 'Low';

/**
 * Privacy budget state, mirroring `@localmode/core` `createPrivacyBudget`
 * (`consumed()` / `maxEpsilon`). Drives the budget bar and its warning/error
 * transitions.
 */
export interface PrivacyBudgetState {
  /** Cumulative epsilon consumed so far. */
  consumed: number;
  /** Maximum cumulative epsilon allowed. */
  maxEpsilon: number;
}

/** Props for {@link DifferentialPrivacyControls}. */
export interface DifferentialPrivacyControlsProps {
  /**
   * Whether differential privacy is enabled. Controlled by the app's DP state
   * (typically whether `dpEmbeddingMiddleware` / `dpClassificationMiddleware`
   * is wired into the pipeline).
   */
  enabled: boolean;
  /** Called when the user toggles DP on or off. */
  onEnabledChange: (enabled: boolean) => void;
  /**
   * Privacy parameter epsilon (privacy budget per query). Lower epsilon = more
   * privacy, more noise. Matches `DPEmbeddingConfig.epsilon` /
   * `DPClassificationConfig.epsilon` in `@localmode/core`.
   */
  epsilon: number;
  /** Called when the user moves the epsilon slider. */
  onEpsilonChange: (epsilon: number) => void;
  /**
   * Minimum selectable epsilon.
   * @default 0.1
   */
  minEpsilon?: number;
  /**
   * Maximum selectable epsilon.
   * @default 10
   */
  maxEpsilon?: number;
  /**
   * Slider step.
   * @default 0.1
   */
  step?: number;
  /**
   * Live privacy budget from the app's tracker (`createPrivacyBudget`). When
   * provided, a budget bar is shown that turns warning then error as the
   * consumed epsilon approaches the maximum.
   */
  budget?: PrivacyBudgetState;
  /**
   * Open state of the collapsible panel. Controlled only when paired with
   * `onOpenChange`; without a handler it seeds the initial (uncontrolled) state
   * so the trigger still expands/collapses.
   * @default true
   */
  open?: boolean;
  /** Called when the panel is expanded or collapsed. */
  onOpenChange?: (open: boolean) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Threshold (fraction of budget consumed) at which the bar turns warning. */
const WARNING_THRESHOLD = 0.7;
/** Threshold at which the bar turns error. */
const ERROR_THRESHOLD = 0.9;

/** Derive a privacy level label from epsilon. Lower epsilon = more privacy. */
export function privacyLevelForEpsilon(epsilon: number): PrivacyLevel {
  if (epsilon <= 1) return 'High';
  if (epsilon <= 5) return 'Balanced';
  return 'Low';
}

/**
 * A presentational differential-privacy settings panel: an enable toggle, an
 * epsilon slider with a derived privacy-level label (High/Balanced/Low), and an
 * optional privacy-budget bar that turns warning then error as the budget is
 * consumed.
 *
 * It does **no** DP math. The app owns the DP state — wiring
 * `dpEmbeddingMiddleware` / `dpClassificationMiddleware` and a
 * `createPrivacyBudget` tracker from `@localmode/core` — and passes `enabled`,
 * `epsilon`, and the live `budget` in. There is no turnkey hook; the component
 * only renders and reports user intent through the change callbacks.
 *
 * Pair it with {@link DpAppliedBadge} beneath protected output as an audit chip.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <DifferentialPrivacyControls
 *   enabled={dpEnabled}
 *   onEnabledChange={setDpEnabled}
 *   epsilon={epsilon}
 *   onEpsilonChange={setEpsilon}
 *   budget={{ consumed: budget.consumed(), maxEpsilon: 10 }}
 * />
 * ```
 */
export function DifferentialPrivacyControls({
  enabled,
  onEnabledChange,
  epsilon,
  onEpsilonChange,
  minEpsilon = 0.1,
  maxEpsilon = 10,
  step = 0.1,
  budget,
  open = true,
  onOpenChange,
  className,
}: DifferentialPrivacyControlsProps) {
  const level = privacyLevelForEpsilon(epsilon);

  const consumedFraction =
    budget && budget.maxEpsilon > 0
      ? Math.max(0, Math.min(1, budget.consumed / budget.maxEpsilon))
      : 0;
  const budgetState: 'ok' | 'warning' | 'error' =
    consumedFraction >= ERROR_THRESHOLD
      ? 'error'
      : consumedFraction >= WARNING_THRESHOLD
        ? 'warning'
        : 'ok';

  // Controlled only when the caller wires `onOpenChange`; otherwise run
  // uncontrolled (`defaultOpen`) so the trigger still collapses without a handler.
  const collapsibleProps = onOpenChange
    ? { open, onOpenChange }
    : { defaultOpen: open };

  return (
    <Collapsible
      {...collapsibleProps}
      className={cn(
        'w-full rounded-lg border border-border bg-card text-card-foreground',
        className,
      )}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          Differential Privacy
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={enabled ? 'default' : 'outline'}>
            {enabled ? 'On' : 'Off'}
          </Badge>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-4 border-t border-border px-4 py-3">
        {/* Enable toggle */}
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Add privacy noise</span>
            <span className="text-xs text-muted-foreground">
              Perturb embeddings/results before they leave the model.
            </span>
          </span>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </label>

        {/* Epsilon slider + derived level */}
        <div
          className={cn(
            'flex flex-col gap-2',
            !enabled && 'pointer-events-none opacity-50',
          )}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Epsilon (ε){' '}
              <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                {epsilon.toFixed(1)}
              </span>
            </span>
            <Badge variant="secondary">{level} privacy</Badge>
          </div>
          {/* Radix Slider primitive directly so the accessible name + formatted
              ε readout land on the Thumb (the focusable `role="slider"`); Radix
              ignores `aria-label` on the Root. */}
          <SliderPrimitive.Root
            data-slot="slider"
            value={[epsilon]}
            min={minEpsilon}
            max={maxEpsilon}
            step={step}
            disabled={!enabled}
            onValueChange={(v) => onEpsilonChange(v[0] ?? epsilon)}
            className="relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50"
          >
            <SliderPrimitive.Track
              data-slot="slider-track"
              className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
            >
              <SliderPrimitive.Range
                data-slot="slider-range"
                className="absolute h-full bg-primary"
              />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              aria-label="Epsilon (privacy budget per query)"
              aria-valuetext={`ε ${epsilon.toFixed(1)}, ${level} privacy`}
              className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            />
          </SliderPrimitive.Root>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>More privacy</span>
            <span>Less privacy</span>
          </div>
        </div>

        {/* Privacy budget bar */}
        {budget && (
          <div
            className={cn(
              'flex flex-col gap-1.5',
              !enabled && 'opacity-50',
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Privacy budget</span>
              <span
                className={cn(
                  'font-mono',
                  budgetState === 'warning' &&
                    'text-amber-600 dark:text-amber-400',
                  budgetState === 'error' && 'text-red-600 dark:text-red-400',
                  budgetState === 'ok' && 'text-muted-foreground',
                )}
              >
                {budget.consumed.toFixed(1)} / {budget.maxEpsilon.toFixed(1)} ε
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Privacy budget consumed"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(consumedFraction * 100)}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width]',
                  budgetState === 'ok' && 'bg-emerald-500',
                  budgetState === 'warning' && 'bg-amber-500',
                  budgetState === 'error' && 'bg-red-500',
                )}
                style={{ width: `${consumedFraction * 100}%` }}
              />
            </div>
            {budgetState === 'error' && (
              <span className="text-[10px] text-red-600 dark:text-red-400">
                Privacy budget nearly exhausted: further queries leak more
                information.
              </span>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Props for {@link DpAppliedBadge}. */
export interface DpAppliedBadgeProps {
  /** Epsilon value applied to the protected output. */
  epsilon: number;
  /**
   * Embedding dimensionality the noise was applied across (e.g. the embedding
   * model's `dimensions`). Optional — omitted for non-vector outputs.
   */
  dimensions?: number;
  /** Additional class names merged onto the badge. */
  className?: string;
}

/**
 * A compact "DP Applied" provenance chip for rendering beneath
 * differential-privacy-protected output. Shows a lock icon, the epsilon used,
 * and (optionally) the embedding dimensionality the noise spanned.
 *
 * Render it only when DP was actually applied — the fields must match the real
 * values emitted by the DP middleware run (`DPEmbeddingConfig.epsilon`, the
 * embedding model's `dimensions`), never placeholders.
 *
 * @example
 * ```tsx
 * {dpEnabled && <DpAppliedBadge epsilon={1.0} dimensions={384} />}
 * ```
 */
export function DpAppliedBadge({
  epsilon,
  dimensions,
  className,
}: DpAppliedBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 font-normal', className)}
      title={`Differential privacy applied with ε=${epsilon}`}
    >
      <Lock className="size-3" aria-hidden />
      <span>DP applied</span>
      <span className="font-mono text-muted-foreground">ε={epsilon}</span>
      {dimensions != null && (
        <span className="font-mono text-muted-foreground">
          · {dimensions}d
        </span>
      )}
    </Badge>
  );
}
