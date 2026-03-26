/**
 * @file ui.tsx
 * @description Reusable UI components for the data migrator application
 */
import { ButtonHTMLAttributes, HTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../_lib/utils';

// ============================================================================
// Button
// ============================================================================

/** Props for the Button component */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: 'primary' | 'ghost' | 'success' | 'error';
  /** Button size */
  size?: 'xs' | 'sm' | 'md';
  /** Show loading spinner */
  loading?: boolean;
}

/** Styled button component with daisyUI classes */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(`btn btn-${variant} btn-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

// ============================================================================
// Spinner
// ============================================================================

/** Props for the Spinner component */
interface SpinnerProps {
  /** Spinner size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

/** Spinner size mappings */
const SPINNER_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
} as const;

/** Animated loading spinner */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return <Loader2 className={cn(SPINNER_SIZES[size], 'animate-spin', className)} />;
}

// ============================================================================
// IconBox
// ============================================================================

/** Props for the IconBox component */
interface IconBoxProps {
  /** Icon content */
  children: ReactNode;
  /** Container size */
  size?: 'sm' | 'md' | 'lg';
  /** Style variant */
  variant?: 'primary' | 'surface';
  /** Additional CSS classes */
  className?: string;
}

const ICONBOX_SIZES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-16 h-16 rounded-2xl',
} as const;

const ICONBOX_VARIANTS = {
  primary: 'bg-poster-primary/10 text-poster-primary ring-1 ring-poster-primary/30',
  surface: 'bg-poster-surface text-poster-text-sub border border-poster-border/30',
} as const;

/** Styled container for icons with consistent sizing */
export function IconBox({ children, size = 'md', variant = 'primary', className }: IconBoxProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center shadow-sm',
        ICONBOX_SIZES[size],
        ICONBOX_VARIANTS[variant],
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// FormatBadge
// ============================================================================

/** Format badge color mappings */
const FORMAT_COLORS: Record<string, string> = {
  pinecone: 'badge-info',
  chroma: 'badge-warning',
  csv: 'badge-success',
  jsonl: 'badge-secondary',
};

/** Badge displaying the detected format */
export function FormatBadge({ format }: { format: string }) {
  return (
    <span className={cn('badge badge-sm', FORMAT_COLORS[format] ?? 'badge-ghost')}>
      {format.toUpperCase()}
    </span>
  );
}

// ============================================================================
// ProgressBar
// ============================================================================

/** Props for the ProgressBar component */
interface ProgressBarProps {
  /** Current progress (0-1) */
  value: number;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/** Animated progress bar */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const percent = Math.max(Math.min(value * 100, 100), 0);

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="flex justify-between text-xs text-poster-text-sub mb-1">
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <div className="relative h-2 rounded-full overflow-hidden bg-poster-surface">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-poster-accent-teal via-poster-primary to-poster-accent-teal bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-500"
          style={{ width: `${Math.max(percent, 3)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// StatsCard
// ============================================================================

/** Props for the StatsCard component */
interface StatsCardProps {
  /** Card label */
  label: string;
  /** Card value */
  value: string | number;
  /** Value color */
  color?: string;
  /** Description text */
  description?: string;
}

/** Statistics display card */
export function StatsCard({ label, value, color, description }: StatsCardProps) {
  return (
    <div className="stat">
      <div className="stat-title text-poster-text-sub text-xs">{label}</div>
      <div className={cn('stat-value text-xl', color ?? 'text-poster-text-main')}>{value}</div>
      {description && <div className="stat-desc text-poster-text-sub/70 text-xs">{description}</div>}
    </div>
  );
}
