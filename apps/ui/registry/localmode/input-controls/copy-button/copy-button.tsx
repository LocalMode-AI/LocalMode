'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link CopyButton}. */
export interface CopyButtonProps {
  /** The text written to the clipboard on click. */
  value: string;
  /** Disable the button (also disabled automatically when `value` is empty). */
  disabled?: boolean;
  /** Additional class names merged onto the button. */
  className?: string;
}

/**
 * A copy-to-clipboard button that shows a 2-second "Copied" confirmation. It
 * disables itself when there is nothing to copy and treats an unavailable
 * clipboard (insecure context / denied permission) as a silent no-op.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <CopyButton value={generatedText} />
 * ```
 */
export function CopyButton({ value, disabled, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled || !value}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
