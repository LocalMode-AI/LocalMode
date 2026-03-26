/**
 * @file ui.tsx
 * @description Reusable UI components for the GGUF Explorer application
 */
import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../_lib/utils';
import type { ExplorerTab } from '../_lib/types';

// ============================================================================
// Button
// ============================================================================

/** Props for the Button component */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'error';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
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
// Input
// ============================================================================

/** Props for the Input component */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Additional wrapper class */
  wrapperClassName?: string;
}

/** Styled text input with daisyUI classes */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, wrapperClassName, ...props }, ref) => (
    <div className={cn('form-control', wrapperClassName)}>
      <input
        ref={ref}
        className={cn(
          'input input-bordered bg-poster-surface/50 border-poster-border/30 text-poster-text-main placeholder:text-poster-text-sub/40',
          'focus:border-poster-primary/50 focus:outline-none transition-all duration-200',
          className
        )}
        {...props}
      />
    </div>
  )
);
Input.displayName = 'Input';

// ============================================================================
// Badge
// ============================================================================

/** Props for the Badge component */
interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  /** Badge style variant */
  variant?: 'primary' | 'ghost' | 'success' | 'error' | 'warning' | 'info';
  /** Badge size */
  size?: 'sm' | 'md' | 'lg';
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
  /** Ordered tab list */
  tabs: ExplorerTab[];
  /** Currently active tab */
  activeTab: ExplorerTab;
  /** Tab change handler */
  onTabChange: (tab: ExplorerTab) => void;
  /** Labels for each tab */
  labels: Record<ExplorerTab, string>;
  /** Disabled tabs */
  disabledTabs?: ExplorerTab[];
}

/** Horizontal tab bar with daisyUI tab styling */
export function TabBar({ tabs, activeTab, onTabChange, labels, disabledTabs = [] }: TabBarProps) {
  return (
    <div role="tablist" className="tabs tabs-bordered bg-poster-surface/50 border-b border-poster-border/30 px-6">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        const isDisabled = disabledTabs.includes(tab);

        return (
          <button
            key={tab}
            role="tab"
            className={cn(
              'tab gap-2 text-sm font-medium transition-colors duration-200',
              isActive && 'tab-active text-poster-primary',
              !isActive && !isDisabled && 'text-poster-text-sub hover:text-poster-text-main',
              isDisabled && 'text-poster-text-sub/30 cursor-not-allowed'
            )}
            onClick={() => !isDisabled && onTabChange(tab)}
            disabled={isDisabled}
            aria-selected={isActive}
          >
            {labels[tab]}
          </button>
        );
      })}
    </div>
  );
}
