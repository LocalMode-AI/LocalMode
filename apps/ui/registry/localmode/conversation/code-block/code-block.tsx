'use client';

/**
 * @file code-block.tsx
 * @description Syntax-highlighted code with a language label and a
 * copy-to-clipboard control. Highlighting uses `shiki` loaded lazily on the
 * client (so it never blocks render); until it resolves, a plain themed `<pre>`
 * is shown. If you'd rather not ship Shiki, delete the dynamic import and keep
 * the plain `<pre>` branch — the copy + label behavior is independent.
 */
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Props for {@link CodeBlock}. */
export interface CodeBlockProps extends React.ComponentProps<'div'> {
  /** The code to render. */
  code: string;
  /** Language id (e.g. "ts", "python"). @default "text" */
  language?: string;
  /** Hide the language label. @default false */
  hideLabel?: boolean;
}

/**
 * A highlighted code block with copy.
 *
 * @example
 * ```tsx
 * <CodeBlock language="ts" code={`const x = 1;`} />
 * ```
 */
export function CodeBlock({
  code,
  language = 'text',
  hideLabel = false,
  className,
  ...props
}: CodeBlockProps) {
  // Highlight once per theme and toggle with CSS so the block matches the host
  // page (light on a light page, dark on a dark page) with no re-highlight flash
  // when the theme switches.
  const [htmlLight, setHtmlLight] = React.useState<string | null>(null);
  const [htmlDark, setHtmlDark] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    // Lazily highlight with Shiki; fall back to plain text on any failure.
    import('shiki')
      .then(({ codeToHtml }) =>
        Promise.all([
          codeToHtml(code, { lang: language || 'text', theme: 'github-light' }),
          codeToHtml(code, { lang: language || 'text', theme: 'github-dark' }),
        ]),
      )
      .then(([light, dark]) => {
        if (active) {
          setHtmlLight(light);
          setHtmlDark(dark);
        }
      })
      .catch(() => {
        if (active) {
          setHtmlLight(null);
          setHtmlDark(null);
        }
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable in insecure contexts */
    }
  };

  return (
    <div
      data-slot="code-block"
      data-language={language}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-muted text-sm',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        {!hideLabel && (
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{language}</span>
        )}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={copy}
          className="ml-auto text-muted-foreground"
        >
          {copied ? (
            <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>

      {htmlLight && htmlDark ? (
        <>
          {/* Shiki output is sanitized HTML for the given code/lang; the bg comes
              from the container token, the syntax colors from the per-theme block. */}
          <div
            className="overflow-x-auto p-3 text-xs dark:hidden [&_pre]:!m-0 [&_pre]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: htmlLight }}
          />
          <div
            className="hidden overflow-x-auto p-3 text-xs dark:block [&_pre]:!m-0 [&_pre]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: htmlDark }}
          />
        </>
      ) : (
        <pre className="overflow-x-auto p-3 text-xs text-foreground">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
