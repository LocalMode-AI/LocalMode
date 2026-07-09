'use client';

/**
 * @file artifact.tsx
 * @description Docked side-panel/canvas shell that renders generated content
 * (code, markdown doc, SVG, HTML) beside the chat, separate from the message
 * stream. Purely presentational — a local model (via `useGenerateText` /
 * `useGenerateObject`) supplies the content; the shell never calls a server.
 */

import * as React from 'react';
import { downloadBlob } from '@/lib/browser-utils';
import { Copy, Download, RefreshCw, X, Check } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link Artifact}, the docked canvas root. */
export interface ArtifactProps extends React.ComponentProps<'section'> {
  /**
   * When false, the canvas is hidden (returns `null`). Lets the host toggle the
   * docked panel open/closed. Defaults to `true`.
   * @default true
   */
  open?: boolean;
}

/**
 * The docked artifact canvas. Renders a vertical panel with a header region and
 * a scrollable content surface. Compose it from {@link ArtifactHeader},
 * {@link ArtifactTitle}, {@link ArtifactDescription}, {@link ArtifactActions},
 * {@link ArtifactAction}, {@link ArtifactClose}, and {@link ArtifactContent}.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <Artifact open={open} className="w-[28rem]">
 *   <ArtifactHeader>
 *     <div>
 *       <ArtifactTitle>generated.ts</ArtifactTitle>
 *       <ArtifactDescription>From a local model run</ArtifactDescription>
 *     </div>
 *     <ArtifactActions>
 *       <ArtifactAction content={code} label="Copy" tooltip="Copy to clipboard" />
 *       <ArtifactAction content={code} fileName="generated.ts" label="Download" />
 *       <ArtifactAction onClick={refresh} label="Refresh" />
 *       <ArtifactClose onClick={() => setOpen(false)} />
 *     </ArtifactActions>
 *   </ArtifactHeader>
 *   <ArtifactContent>
 *     <pre>{code}</pre>
 *   </ArtifactContent>
 * </Artifact>
 * ```
 */
export function Artifact({
  open = true,
  className,
  children,
  ...props
}: ArtifactProps) {
  if (!open) return null;

  return (
    <section
      data-slot="artifact"
      aria-label="Artifact canvas"
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** The header band of an {@link Artifact}: holds title/description and actions. */
export function ArtifactHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="artifact-header"
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 [&>*:first-child]:min-w-0',
        className,
      )}
      {...props}
    />
  );
}

/** The title of an {@link Artifact}. */
export function ArtifactTitle({
  className,
  ...props
}: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="artifact-title"
      className={cn(
        'truncate text-sm font-semibold leading-none text-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** The secondary description line of an {@link Artifact}. */
export function ArtifactDescription({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="artifact-description"
      className={cn('mt-1 truncate text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

/** The action-toolbar container in an {@link ArtifactHeader}. */
export function ArtifactActions({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="artifact-actions"
      className={cn('flex shrink-0 items-center gap-1', className)}
      {...props}
    />
  );
}

/** Props for {@link ArtifactAction}, a single toolbar button. */
export interface ArtifactActionProps
  extends Omit<React.ComponentProps<'button'>, 'content'> {
  /** Accessible label for the icon button (also used as the tooltip). */
  label: string;
  /**
   * Icon to render. Defaults are wired by convention: pass `content` to make a
   * copy/download action, or `onClick` for a custom (e.g. refresh) action.
   */
  icon?: React.ReactNode;
  /**
   * String content the action operates on. When provided without `fileName`,
   * clicking copies it to the clipboard. When provided with `fileName`, clicking
   * downloads it as a real `Blob`. Both happen entirely client-side.
   */
  content?: string;
  /** When set (with `content`), the action downloads `content` as this file. */
  fileName?: string;
  /** MIME type for the downloaded blob. @default "text/plain" */
  mimeType?: string;
}

/**
 * A single artifact toolbar action. Three built-in behaviors, chosen by props:
 * - `content` only → copy to clipboard (shows a transient check on success).
 * - `content` + `fileName` → download as a client-side `Blob`.
 * - `onClick` (no `content`) → custom action (e.g. refresh re-runs generation).
 *
 * All behaviors are local; nothing is sent to a server.
 */
export function ArtifactAction({
  label,
  icon,
  content,
  fileName,
  mimeType = 'text/plain',
  onClick,
  className,
  children,
  ...props
}: ArtifactActionProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const isDownload = content != null && fileName != null;
  const isCopy = content != null && fileName == null;

  const resolvedIcon =
    icon ??
    (isDownload ? (
      <Download aria-hidden="true" />
    ) : isCopy ? (
      copied ? (
        <Check aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )
    ) : (
      <RefreshCw aria-hidden="true" />
    ));

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (isDownload) {
      downloadBlob(content, fileName, mimeType);
      return;
    }

    if (isCopy) {
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        /* clipboard may be unavailable (e.g. insecure context) — no-op */
      }
    }
  };

  return (
    <button
      type="button"
      data-slot="artifact-action"
      title={label}
      aria-label={label}
      onClick={handleClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children ?? resolvedIcon}
    </button>
  );
}

/** Props for {@link ArtifactClose}. */
export interface ArtifactCloseProps
  extends React.ComponentProps<'button'> {
  /** Accessible label. @default "Close" */
  label?: string;
}

/** The close button for an {@link Artifact}. Fires its `onClick` to hide the panel. */
export function ArtifactClose({
  label = 'Close',
  className,
  children,
  ...props
}: ArtifactCloseProps) {
  return (
    <button
      type="button"
      data-slot="artifact-close"
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children ?? <X aria-hidden="true" />}
    </button>
  );
}

/**
 * The scrollable content surface of an {@link Artifact}. Render generated code
 * (`<pre>`), markdown, an SVG, or any other local content inside it.
 */
export function ArtifactContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="artifact-content"
      className={cn(
        'min-h-0 flex-1 overflow-auto break-words p-4 text-sm [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-xs',
        className,
      )}
      {...props}
    />
  );
}
