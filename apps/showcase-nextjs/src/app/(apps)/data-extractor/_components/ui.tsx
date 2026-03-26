/**
 * @file ui.tsx
 * @description Reusable UI components for the data extractor application
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
// Spinner
// ============================================================================

/** Props for the Spinner component */
interface SpinnerProps {
  /** Spinner size */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

/** Loading spinner with animation */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  return <Loader2 className={cn(sizeMap[size], 'animate-spin', className)} />;
}

// ============================================================================
// IconBox
// ============================================================================

/** Props for the IconBox component */
interface IconBoxProps {
  /** Icon element */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/** Pre-styled icon container */
export function IconBox({ children, className }: IconBoxProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg bg-poster-primary/10 text-poster-primary',
        className
      )}
    >
      {children}
    </div>
  );
}
