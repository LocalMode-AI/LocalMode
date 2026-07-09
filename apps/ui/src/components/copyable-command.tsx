'use client';

/**
 * @file copyable-command.tsx
 * @description A single shell command shown inline with a copy-to-clipboard
 * button. Used for the homepage install one-liner (the docs pages use the
 * package-manager-tabbed `InstallTabs` instead).
 */
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for {@link CopyableCommand}. */
interface CopyableCommandProps {
  /** The command string to display and copy. */
  command: string;
  /** Optional extra classes for the wrapper. */
  className?: string;
}

/** Inline command + copy button. */
export function CopyableCommand({ command, className }: CopyableCommandProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable in insecure contexts */
    }
  };

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted py-1.5 pl-4 pr-1.5 text-sm',
        className,
      )}
    >
      <code className="overflow-x-auto whitespace-nowrap text-foreground">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
