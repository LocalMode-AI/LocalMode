/**
 * @file ui.tsx
 * @description Reusable UI components for the model evaluator application
 */
import { ButtonHTMLAttributes, HTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../_lib/utils';
import type { EvaluatorTab } from '../_lib/types';

// ============================================================================
// Button
// ============================================================================

/** Props for the Button component */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: 'primary' | 'ghost';
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
// Badge
// ============================================================================

/** Props for the Badge component */
interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  /** Badge style variant */
  variant?: 'primary' | 'ghost' | 'success';
  /** Badge size */
  size?: 'sm' | 'md';
}

/** Styled badge component with daisyUI classes */
export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ variant = 'ghost', size = 'md', className, children, ...props }, ref) => (
    <div ref={ref} className={cn(`badge badge-${variant} badge-${size}`, className)} {...props}>
      {children}
    </div>
  )
);
Badge.displayName = 'Badge';

// ============================================================================
// Progress
// ============================================================================

/** Props for the Progress component */
interface ProgressProps extends HTMLAttributes<HTMLProgressElement> {
  /** Current progress value */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
}

/** Styled progress bar component */
export const Progress = forwardRef<HTMLProgressElement, ProgressProps>(
  ({ value, max = 100, className, ...props }, ref) => (
    <progress
      ref={ref}
      className={cn('progress progress-primary', className)}
      value={value}
      max={max}
      {...props}
    />
  )
);
Progress.displayName = 'Progress';

// ============================================================================
// Spinner
// ============================================================================

/** Props for the Spinner component */
interface SpinnerProps {
  /** Spinner size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes */
  className?: string;
}

/** Spinner size mappings */
const SPINNER_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
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
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Style variant */
  variant?: 'primary' | 'surface' | 'accent';
  /** Additional CSS classes */
  className?: string;
}

/** IconBox size mappings */
const ICONBOX_SIZES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-16 h-16 rounded-2xl',
  xl: 'w-24 h-24 rounded-2xl',
} as const;

/** IconBox variant mappings */
const ICONBOX_VARIANTS = {
  primary: 'bg-poster-primary/10 text-poster-primary ring-1 ring-poster-primary/30',
  surface: 'bg-poster-surface text-poster-text-sub border border-poster-border/30',
  accent: 'bg-poster-accent-teal text-white',
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
// TabBar
// ============================================================================

/** Props for the TabBar component */
interface TabBarProps {
  /** Available tabs */
  tabs: EvaluatorTab[];
  /** Currently active tab */
  activeTab: EvaluatorTab;
  /** Tab labels */
  labels: Record<EvaluatorTab, string>;
  /** Callback when tab changes */
  onTabChange: (tab: EvaluatorTab) => void;
}

/** Tab navigation component */
export function TabBar({ tabs, activeTab, labels, onTabChange }: TabBarProps) {
  return (
    <div role="tablist" className="tabs tabs-bordered">
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          className={cn(
            'tab tab-lg font-medium transition-colors duration-200',
            activeTab === tab
              ? 'tab-active text-poster-accent-purple'
              : 'text-poster-text-sub hover:text-poster-text-main'
          )}
          onClick={() => onTabChange(tab)}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// StatCard
// ============================================================================

/** Props for the StatCard component */
interface StatCardProps {
  /** Metric label */
  label: string;
  /** Metric value (formatted string) */
  value: string;
  /** Optional description or subtitle */
  description?: string;
  /** Additional CSS classes */
  className?: string;
}

/** Metric display card with label, value, and optional description */
export function StatCard({ label, value, description, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'stat bg-poster-surface/50 border border-poster-border/30 rounded-xl p-4',
        className
      )}
    >
      <div className="stat-title text-poster-text-sub text-xs uppercase tracking-wider">{label}</div>
      <div className="stat-value text-2xl font-bold text-poster-text-main mt-1">{value}</div>
      {description && (
        <div className="stat-desc text-poster-text-sub/70 text-xs mt-1">{description}</div>
      )}
    </div>
  );
}
