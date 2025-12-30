/**
 * @file ui.tsx
 * @description Reusable UI components for the home page
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
  variant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'ghost'
    | 'link'
    | 'neutral'
    | 'success'
    | 'warning'
    | 'error';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Show loading spinner */
  loading?: boolean;
  /** Wide button */
  wide?: boolean;
  /** Block button */
  block?: boolean;
}

/** Styled button component with daisyUI classes */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      wide,
      block,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      className={cn(
        'btn',
        `btn-${variant}`,
        `btn-${size}`,
        wide && 'btn-wide',
        block && 'btn-block',
        className
      )}
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
// Card
// ============================================================================

/** Props for the Card component */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Compact card */
  compact?: boolean;
  /** Bordered card */
  bordered?: boolean;
  /** Image full card */
  imageFull?: boolean;
}

/** Props for the Figure component */
interface FigureProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

/** Figure component for card images */
export const Figure = forwardRef<HTMLElement, FigureProps>(
  ({ className, children, ...props }, ref) => (
    <figure ref={ref} className={className} {...props}>
      {children}
    </figure>
  )
);
Figure.displayName = 'Figure';

/** Styled card component with daisyUI classes */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ compact, bordered, imageFull, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'card bg-base-100 shadow-xl',
        compact && 'card-compact',
        bordered && 'card-bordered',
        imageFull && 'image-full',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

/** Card body component */
export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('card-body', className)} {...props}>
      {children}
    </div>
  )
);
CardBody.displayName = 'CardBody';

/** Card title component */
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h2 ref={ref} className={cn('card-title', className)} {...props}>
      {children}
    </h2>
  )
);
CardTitle.displayName = 'CardTitle';

/** Card actions component */
export const CardActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('card-actions', className)} {...props}>
      {children}
    </div>
  )
);
CardActions.displayName = 'CardActions';

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
// IconBox - Styled container for icons
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
// StatusDot - Pulsing status indicator
// ============================================================================

/** Props for the StatusDot component */
interface StatusDotProps {
  /** Dot color */
  color?: 'teal' | 'primary' | 'error';
  /** Enable pulse animation */
  pulse?: boolean;
  /** Dot size */
  size?: 'sm' | 'md';
}

/** StatusDot color mappings */
const DOT_COLORS = {
  teal: 'bg-poster-accent-teal',
  primary: 'bg-poster-primary',
  error: 'bg-error',
} as const;

/** Pulsing status indicator dot */
export function StatusDot({ color = 'teal', pulse = true, size = 'sm' }: StatusDotProps) {
  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';
  const colorClass = DOT_COLORS[color];

  return (
    <span className={cn('flex relative', sizeClass)}>
      {pulse && (
        <span
          className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            colorClass
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full', sizeClass, colorClass)} />
    </span>
  );
}

// ============================================================================
// Divider - Vertical or horizontal divider
// ============================================================================

/** Props for the Divider component */
interface DividerProps {
  /** Divider orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Additional CSS classes */
  className?: string;
}

/** Visual divider line */
export function Divider({ orientation = 'vertical', className }: DividerProps) {
  return (
    <div
      className={cn(
        'bg-white/10',
        orientation === 'vertical' ? 'h-4 w-px mx-1' : 'w-full h-px my-2',
        className
      )}
    />
  );
}
