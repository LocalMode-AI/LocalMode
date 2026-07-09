'use client';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * Semantic strength color token. Maps to a meaning, not a raw color, so the
 * component can theme each state with shadcn/ui CSS variables and your
 * password-policy thresholds decide which token applies.
 */
export type StrengthColor = 'error' | 'warning' | 'success';

/** Props for {@link PasswordStrengthBar}. */
export interface PasswordStrengthBarProps {
  /**
   * Strength score, `0`–`100`. **The caller computes this** (length / entropy /
   * a zxcvbn-style estimator) — the bar only renders it. Values outside the
   * range are clamped. Pairs with `@localmode/core` `deriveKey`/crypto in the
   * consuming key-derivation flow.
   */
  value: number;
  /**
   * Human-readable strength label shown beside the bar (e.g. `"Weak"`,
   * `"Good"`, `"Strong"`). The caller decides the wording; the component does
   * not derive it from `value`.
   */
  label?: string;
  /**
   * Semantic color token for the fill and label. `error` (red) for weak,
   * `warning` (amber) for medium, `success` (green) for strong. The caller
   * picks the token from its own thresholds.
   * @default "warning"
   */
  color?: StrengthColor;
  /**
   * When true, hide the textual label and render the bar only.
   * @default false
   */
  hideLabel?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Fill + text classes per semantic color token. */
const COLOR_CLASSES: Record<StrengthColor, { fill: string; text: string }> = {
  error: { fill: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  warning: { fill: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  success: {
    fill: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
};

/**
 * A presentational password/passphrase strength meter: a themed horizontal bar
 * whose fill and color reflect a **caller-computed** strength score, plus an
 * optional label.
 *
 * This primitive does **no** strength estimation. The app computes the `0`–`100`
 * `value`, the `label` string, and the semantic `color` token (typically from
 * length/entropy or a zxcvbn-style estimator) and passes them in — pairing with
 * `@localmode/core` `deriveKey`/crypto in the surrounding key-derivation flow.
 * There is no turnkey hook; it only renders the state you supply.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * // app computes strength, e.g. via a zxcvbn-style estimator
 * const { score } = estimate(password); // 0..4
 * <PasswordStrengthBar
 *   value={(score / 4) * 100}
 *   label={['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score]}
 *   color={score < 2 ? 'error' : score < 3 ? 'warning' : 'success'}
 * />
 * ```
 */
export function PasswordStrengthBar({
  value,
  label,
  color = 'warning',
  hideLabel = false,
  className,
}: PasswordStrengthBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const colors = COLOR_CLASSES[color];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={label}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-all', colors.fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {!hideLabel && label && (
        <span className={cn('text-xs font-medium', colors.text)}>{label}</span>
      )}
    </div>
  );
}
