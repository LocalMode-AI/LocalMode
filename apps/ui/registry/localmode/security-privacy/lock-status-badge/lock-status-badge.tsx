'use client';

import { Lock, LockOpen, ShieldOff } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Session lock state of an encrypted vault. */
export type LockStatus = 'locked' | 'unlocked' | 'no-vault';

/** Props for {@link LockStatusBadge}. */
export interface LockStatusBadgeProps {
  /**
   * The vault's session lock state. `no-vault` is the pre-initialization state
   * (nothing to unlock yet); `locked` means an initialized vault whose key is
   * not in memory; `unlocked` means the derived key is held in memory.
   */
  status: LockStatus;
  /**
   * Override the default per-state text. The default labels are
   * "Locked" / "Unlocked" / "No vault".
   */
  label?: string;
  /** Additional class names merged onto the badge. */
  className?: string;
}

/** Per-state icon, default label, and semantic token classes. */
const STATUS_CONFIG: Record<
  LockStatus,
  { label: string; Icon: typeof Lock; classes: string }
> = {
  locked: {
    label: 'Locked',
    Icon: Lock,
    classes:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  unlocked: {
    label: 'Unlocked',
    Icon: LockOpen,
    classes:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  'no-vault': {
    label: 'No vault',
    Icon: ShieldOff,
    classes: 'border-border bg-muted text-muted-foreground',
  },
};

/**
 * A compact session-lock indicator for an encrypted vault. Renders a distinct
 * icon + text per state (`locked` / `unlocked` / `no-vault`) — the state is
 * announced as text, never color alone, so it stays accessible.
 *
 * Purely presentational: it holds no key material and performs no crypto. Pass
 * the current lock state in. Works with any backend; recommended source: the
 * `status` field of `useEncryptedVault` from `@localmode/react` (map its
 * `'uninitialized' | 'locked' | 'unlocked'` onto `'no-vault' | 'locked' |
 * 'unlocked'`).
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * const { status } = useEncryptedVault({ name: 'notes' });
 * <LockStatusBadge status={status === 'uninitialized' ? 'no-vault' : status} />
 * ```
 */
export function LockStatusBadge({ status, label, className }: LockStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const { Icon } = config;
  const text = label ?? config.label;

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
