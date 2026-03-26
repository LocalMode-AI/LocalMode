/**
 * @file ui.tsx
 * @description Reusable UI components for the Smart Writer application
 */
import { ButtonHTMLAttributes, forwardRef, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../_lib/utils';

/** Props for the Button component */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
}

/** Styled button component */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(`btn btn-${variant} btn-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

/** Spinner component */
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size];
  return <Loader2 className={cn(sizeClass, 'animate-spin text-poster-primary')} />;
}

/** Badge component */
export function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning'; className?: string }) {
  const variantClass = {
    default: 'badge-neutral',
    success: 'badge-success',
    warning: 'badge-warning',
  }[variant];
  return <span className={cn('badge badge-sm', variantClass, className)}>{children}</span>;
}

/** IconBox component */
export function IconBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl bg-poster-surface-lighter', className)}>
      {children}
    </div>
  );
}

/** TextArea component */
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('textarea textarea-bordered w-full bg-poster-surface text-poster-text-main resize-none', className)}
      {...props}
    />
  )
);
TextArea.displayName = 'TextArea';

/** Select component */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn('select select-bordered select-sm bg-poster-surface text-poster-text-main', className)}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
