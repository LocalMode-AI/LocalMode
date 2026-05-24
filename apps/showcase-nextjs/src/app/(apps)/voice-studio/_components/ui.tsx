/**
 * @file ui.tsx
 * @description Reusable UI components for voice-studio
 */
import { ButtonHTMLAttributes, HTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../_lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button ref={ref} className={cn(`btn btn-${variant} btn-${size}`, className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'ghost' | 'success' | 'info';
  size?: 'sm' | 'md';
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ variant = 'ghost', size = 'sm', className, children, ...props }, ref) => (
    <div ref={ref} className={cn(`badge badge-${variant} badge-${size}`, className)} {...props}>
      {children}
    </div>
  )
);
Badge.displayName = 'Badge';

const SPINNER_SIZES = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' } as const;

export function Spinner({ size = 'md', className }: { size?: keyof typeof SPINNER_SIZES; className?: string }) {
  return <Loader2 className={cn(SPINNER_SIZES[size], 'animate-spin', className)} />;
}

export function IconBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', className)}>
      {children}
    </div>
  );
}
