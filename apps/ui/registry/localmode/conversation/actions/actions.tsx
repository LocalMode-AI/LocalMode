'use client';

/**
 * @file actions.tsx
 * @description Message-level controls: copy, regenerate, read-aloud, feedback.
 * `Actions` is the row wrapper (hover-reveal capable); `Action` is an accessible
 * icon button with optional tooltip; `CopyAction` handles clipboard + copied
 * state; `ActionsMenu` groups secondary actions behind an overflow "more" menu;
 * `FeedbackBar` is an on-device thumbs up/down (no telemetry); `ReadAloudAction`
 * is wired to local Kokoro TTS by the consumer.
 */
import * as React from 'react';
import {
  Check,
  Copy,
  MoreHorizontal,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/registry/localmode/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/registry/localmode/ui/tooltip';

/** Props for {@link Actions}. */
export interface ActionsProps extends React.ComponentProps<'div'> {
  /**
   * When true, the actions are hidden until the parent (`group`) is hovered.
   * Place the `group` class on the message row.
   * @default false
   */
  hoverReveal?: boolean;
}

/** Row of message actions. */
export function Actions({ hoverReveal = false, className, ...props }: ActionsProps) {
  return (
    <div
      data-slot="actions"
      className={cn(
        'flex items-center gap-0.5',
        hoverReveal &&
          'opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link Action}. */
export interface ActionProps extends React.ComponentProps<typeof Button> {
  /** Accessible label / tooltip text. */
  label: string;
}

/** A single icon action button with a tooltip. */
export function Action({ label, className, children, ...props }: ActionProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            data-slot="action"
            className={cn('text-muted-foreground', className)}
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Props for {@link CopyAction}. */
export interface CopyActionProps
  extends Omit<ActionProps, 'label' | 'children'> {
  /** Text to copy to the clipboard. */
  text: string;
  /** Tooltip label. @default "Copy" */
  label?: string;
}

/** Copy-to-clipboard action that reflects a copied state for ~1.5s. */
export function CopyAction({ text, label = 'Copy', ...props }: CopyActionProps) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Action
      label={copied ? 'Copied' : label}
      data-copied={copied || undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be unavailable in insecure contexts */
        }
      }}
      {...props}
    >
      {copied ? (
        <Check className="size-4 text-emerald-500" />
      ) : (
        <Copy className="size-4" />
      )}
    </Action>
  );
}

/** Props for {@link RegenerateAction}. */
export interface RegenerateActionProps
  extends Omit<ActionProps, 'label' | 'children'> {
  /** Fired on activation. */
  onRegenerate?: () => void;
  /** Tooltip label. @default "Regenerate" */
  label?: string;
}

/** Regenerate the assistant response. */
export function RegenerateAction({
  onRegenerate,
  label = 'Regenerate',
  ...props
}: RegenerateActionProps) {
  return (
    <Action label={label} onClick={() => onRegenerate?.()} {...props}>
      <RefreshCw className="size-4" />
    </Action>
  );
}

/** Props for {@link ReadAloudAction}. */
export interface ReadAloudActionProps
  extends Omit<ActionProps, 'label' | 'children'> {
  /** Whether audio is currently playing. */
  playing?: boolean;
  /** Fired on activation — wire to local Kokoro TTS (`useSynthesizeSpeech`). */
  onReadAloud?: () => void;
  /** Tooltip label. @default "Read aloud" */
  label?: string;
}

/** Read-aloud action (wire to local Kokoro TTS). */
export function ReadAloudAction({
  playing = false,
  onReadAloud,
  label = 'Read aloud',
  className,
  ...props
}: ReadAloudActionProps) {
  return (
    <Action
      label={label}
      data-playing={playing || undefined}
      onClick={() => onReadAloud?.()}
      className={cn(playing && 'text-primary', className)}
      {...props}
    >
      <Volume2 className="size-4" />
    </Action>
  );
}

/** A secondary action entry for the overflow menu. */
export interface ActionMenuEntry {
  /** Stable key. */
  id: string;
  /** Visible label. */
  label: string;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Activation handler. */
  onSelect: () => void;
}

/** Props for {@link ActionsMenu}. */
export interface ActionsMenuProps {
  /** Secondary action entries. */
  items: ActionMenuEntry[];
  /** Tooltip / label. @default "More" */
  label?: string;
}

/** Overflow "more" menu grouping secondary actions. */
export function ActionsMenu({ items, label = 'More' }: ActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          data-slot="actions-menu"
          className="text-muted-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it) => (
          <DropdownMenuItem key={it.id} onSelect={it.onSelect}>
            {it.icon}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A feedback choice. */
export type Feedback = 'up' | 'down';

/** Props for {@link FeedbackBar}. */
export interface FeedbackBarProps extends React.ComponentProps<'div'> {
  /** Current selection (controlled). */
  value?: Feedback | null;
  /** Reports the chosen feedback — stays on-device, no telemetry. */
  onFeedback?: (value: Feedback) => void;
}

/**
 * On-device thumbs up/down. The choice is reported via `onFeedback` and never
 * leaves the device.
 */
export function FeedbackBar({
  value,
  onFeedback,
  className,
  ...props
}: FeedbackBarProps) {
  const [internal, setInternal] = React.useState<Feedback | null>(null);
  const selected = value ?? internal;

  const choose = (v: Feedback) => {
    setInternal(v);
    onFeedback?.(v);
  };

  return (
    <div
      data-slot="feedback-bar"
      role="group"
      aria-label="Feedback"
      className={cn('flex items-center gap-0.5', className)}
      {...props}
    >
      <Action
        label="Good response"
        data-selected={selected === 'up' || undefined}
        onClick={() => choose('up')}
        className={cn(selected === 'up' && 'text-emerald-500')}
      >
        <ThumbsUp className="size-4" />
      </Action>
      <Action
        label="Bad response"
        data-selected={selected === 'down' || undefined}
        onClick={() => choose('down')}
        className={cn(selected === 'down' && 'text-destructive')}
      >
        <ThumbsDown className="size-4" />
      </Action>
    </div>
  );
}
