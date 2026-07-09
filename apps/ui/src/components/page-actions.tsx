'use client';

/**
 * @file page-actions.tsx
 * @description Per-docs-page agent affordances: "Copy page" (writes the page's
 * markdown to the clipboard) and "View as Markdown" (opens the raw `/api/md`
 * route). The markdown is computed server-side and passed in, so Copy is a
 * direct clipboard write with no fetch.
 */
import * as React from 'react';
import { Check, Copy, FileText } from 'lucide-react';

/** Props for {@link PageActions}. */
interface PageActionsProps {
  /** The page's markdown, computed server-side. */
  markdown: string;
  /** URL of the raw-markdown route for this page. */
  markdownUrl: string;
}

/** Copy-page and View-as-Markdown controls shown atop a docs page. */
export function PageActions({ markdown, markdownUrl }: PageActionsProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fall back to opening the raw markdown.
      window.open(markdownUrl, '_blank', 'noopener');
    }
  };

  return (
    <div className="not-prose mb-4 flex flex-wrap gap-2" data-testid="page-actions">
      <button
        type="button"
        onClick={copy}
        data-testid="copy-page"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy page'}
      </button>
      <a
        href={markdownUrl}
        target="_blank"
        rel="noreferrer noopener"
        data-testid="view-markdown"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-card-foreground no-underline transition-colors hover:bg-muted"
      >
        <FileText className="h-3.5 w-3.5" />
        View as Markdown
      </a>
    </div>
  );
}
