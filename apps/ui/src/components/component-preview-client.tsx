'use client';

/**
 * @file component-preview-client.tsx
 * @description Interactive shell for a registry component preview: Preview/Code
 * tabs, a per-preview theme switcher (scoped CSS-variable presets), and the
 * Run-gate/Reset controls. The demo AUTO-RENDERS by default (every catalog demo
 * gates any model download behind an in-demo action); `gated` restores the
 * "Run preview" gate for a future demo that would fetch a model on mount.
 *
 * The theme switcher sets `data-preview-theme` on the preview surface; the
 * matching CSS overrides (in global.css) re-map the shadcn tokens within that
 * subtree only — proving components inherit a consumer's theme without touching
 * the rest of the page.
 */
import * as React from 'react';
import { ChevronDown, Code2, Eye, Play, RotateCcw } from 'lucide-react';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { PREVIEWS } from '@/components/preview-registry';
import { cn } from '@/lib/utils';

const THEMES = [
  { id: 'base', label: 'Base' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
] as const;
type ThemeId = (typeof THEMES)[number]['id'];

/** Props for {@link ComponentPreviewClient}. */
interface ComponentPreviewClientProps {
  /** Registry item name under the ui/ scheme, e.g. `ui/local-first/device-badge`. */
  name: string;
  /** Raw demo source, read server-side; null when the file is unavailable. */
  source: string | null;
  /** Gate the demo behind a "Run preview" click (for mount-time downloads). */
  gated?: boolean;
  /** Optional note shown in the gated placeholder. */
  note?: string;
  /** Optional extra classes / min-height for the preview surface. */
  className?: string;
}

function HeaderTab({
  active,
  disabled,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Interactive preview surface with Preview/Code tabs and a theme switcher. */
export function ComponentPreviewClient({
  name,
  source,
  gated = false,
  note,
  className,
}: ComponentPreviewClientProps) {
  const [running, setRunning] = React.useState(!gated);
  // Bumping the key remounts the demo, resetting its internal state.
  const [resetKey, setResetKey] = React.useState(0);
  const [tab, setTab] = React.useState<'preview' | 'code'>('preview');
  const [theme, setTheme] = React.useState<ThemeId>('base');
  const Demo = PREVIEWS[name];

  return (
    <div
      className={cn('not-prose my-4 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card', className)}
      data-preview-name={name}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <HeaderTab active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye className="h-3.5 w-3.5" />}>
            Preview
          </HeaderTab>
          <HeaderTab
            active={tab === 'code'}
            disabled={!source}
            onClick={() => setTab('code')}
            icon={<Code2 className="h-3.5 w-3.5" />}
          >
            Code
          </HeaderTab>
        </div>

        {tab === 'preview' ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeId)}
                aria-label="Preview theme"
                data-testid="preview-theme"
                className="appearance-none rounded-md border border-border bg-background py-1 pl-2 pr-7 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
            </div>
            {running ? (
              <button
                type="button"
                onClick={() => {
                  setResetKey((k) => k + 1);
                  if (gated) setRunning(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tab === 'preview' ? (
        // Scroll container (outer) is separate from the centering row (inner) so
        // fitting demos stay centered while over-wide demos scroll horizontally
        // and remain fully reachable. `min-w-full` makes the centering row fill
        // the surface for small demos, and grow past it for wide ones.
        <div data-preview-theme={theme} className="overflow-auto bg-background text-foreground">
          <div className="flex min-h-40 min-w-full items-center justify-center p-4 sm:p-8">
            {running ? (
              Demo ? (
                <Demo key={resetKey} />
              ) : (
                <p className="text-sm text-destructive">
                  No demo registered for <code>{name}</code>.
                </p>
              )
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <button
                  type="button"
                  onClick={() => setRunning(true)}
                  data-run-preview={name}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Play className="h-4 w-4" />
                  Run preview
                </button>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {note ??
                    'This demo loads a model when run. Click Run to load and execute it — nothing downloads until you do.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm" data-component-code data-testid="preview-code">
          {source ? (
            <DynamicCodeBlock lang="tsx" code={source} />
          ) : (
            <p className="p-4 text-muted-foreground">Source unavailable.</p>
          )}
        </div>
      )}
    </div>
  );
}
