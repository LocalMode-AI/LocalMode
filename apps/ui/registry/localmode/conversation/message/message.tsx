'use client';

/**
 * @file message.tsx
 * @description Role-aware chat message primitives. `Message` is the row wrapper
 * (exposes `data-role` for theming), `MessageContent` renders `string` or
 * `ContentPart[]` (markdown text + image thumbnails with a fullscreen dialog +
 * file download chips), `MessageAvatar` renders the role avatar, and
 * `Checkpoint` is an inter-message savepoint marker enabling rollback/restore.
 *
 * Matches `@localmode/react`'s message model (`ReactChatMessage.content` is
 * `string | ContentPart[]`). Presentational only — it renders props; the app
 * owns message state (`useChat`).
 */
import * as React from 'react';
import { formatBytes } from '@/lib/browser-utils';
import { Bot, Download, FileText, User, X, Bookmark } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/registry/localmode/ui/avatar';
import { Button } from '@/registry/localmode/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/registry/localmode/ui/dialog';
import { Markdown } from '../lib/markdown';

/** A message role. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** A text content part. */
export interface TextPart {
  type: 'text';
  text: string;
}
/** An image content part (base64, no `data:` prefix — matches `@localmode/core`). */
export interface ImagePart {
  type: 'image';
  data: string;
  mimeType: string;
}
/** A file content part rendered as a download chip (from local bytes). */
export interface FilePart {
  type: 'file';
  name: string;
  mimeType: string;
  /** Base64 data (no `data:` prefix) or a Blob/object URL. */
  data: string;
  /** Size in bytes, for the chip label. */
  size?: number;
}
/** Any renderable content part. */
export type MessagePart = TextPart | ImagePart | FilePart;

/** Props for {@link Message}. */
export interface MessageProps extends React.ComponentProps<'div'> {
  /** Who sent the message — exposed as `data-role` for theming. */
  role: MessageRole;
}

/**
 * The message row. Aligns user messages to the end, others to the start, and
 * exposes `data-role` for styling.
 *
 * @example
 * ```tsx
 * <Message role={m.role}>
 *   <MessageAvatar role={m.role} />
 *   <MessageContent content={m.content} />
 * </Message>
 * ```
 */
export function Message({ role, className, ...props }: MessageProps) {
  return (
    <div
      data-role={role}
      data-slot="message"
      className={cn(
        'flex w-full items-start gap-3',
        role === 'user' && 'flex-row-reverse',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link MessageAvatar}. */
export interface MessageAvatarProps extends React.ComponentProps<typeof Avatar> {
  /** The role this avatar represents. */
  role: MessageRole;
  /** Optional avatar image URL. */
  src?: string;
  /** Optional fallback initials/label. */
  name?: string;
}

/** Role avatar (user/assistant icon by default, or a provided image). */
export function MessageAvatar({
  role,
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) {
  const Icon = role === 'user' ? User : Bot;
  return (
    <Avatar
      data-role={role}
      className={cn('size-8 shrink-0 border border-border', className)}
      {...props}
    >
      {src && <AvatarImage src={src} alt={name ?? role} />}
      <AvatarFallback className="bg-muted text-muted-foreground">
        {name ? name.slice(0, 2).toUpperCase() : <Icon className="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

/** Props for {@link MessageContent}. */
export interface MessageContentProps
  extends Omit<React.ComponentProps<'div'>, 'content'> {
  /** Message content — a markdown string or `ContentPart[]`. */
  content: string | MessagePart[];
  /**
   * Bubble style. `contained` draws a themed bubble; `flat` renders inline with
   * no background (useful for assistant prose).
   * @default "contained"
   */
  variant?: 'contained' | 'flat';
  /** Role, used for bubble theming when contained. */
  role?: MessageRole;
}

/** Build a usable `src`/`href` from a part's `data` (base64 or URL). */
function toUrl(data: string, mimeType: string) {
  if (data.startsWith('data:') || data.startsWith('blob:') || data.startsWith('http')) {
    return data;
  }
  return `data:${mimeType};base64,${data}`;
}

/**
 * Renders message content. Strings render as markdown; `ContentPart[]` renders
 * text as markdown, images as fullscreen-able thumbnails, and files as download
 * chips.
 */
export function MessageContent({
  content,
  variant = 'contained',
  role = 'assistant',
  className,
  ...props
}: MessageContentProps) {
  const parts: MessagePart[] =
    typeof content === 'string' ? [{ type: 'text', text: content }] : content;

  return (
    <div
      data-slot="message-content"
      data-variant={variant}
      data-role={role}
      className={cn(
        'min-w-0 max-w-[80%] space-y-2',
        variant === 'contained' &&
          'rounded-lg border border-border bg-card px-3 py-2 text-card-foreground',
        variant === 'contained' &&
          role === 'user' &&
          'bg-primary text-primary-foreground',
        className,
      )}
      {...props}
    >
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <Markdown key={i}>{part.text}</Markdown>;
        }
        if (part.type === 'image') {
          const url = toUrl(part.data, part.mimeType);
          return (
            <Dialog key={i}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="block max-w-full overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label="View image full screen"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="attachment"
                    className="max-h-48 max-w-full object-cover"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="attachment full size"
                  className="max-h-[80vh] max-w-full rounded object-contain"
                />
              </DialogContent>
            </Dialog>
          );
        }
        // file part → download chip
        const href = toUrl(part.data, part.mimeType);
        return (
          <a
            key={i}
            href={href}
            download={part.name}
            className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="max-w-40 truncate font-medium">{part.name}</span>
            {part.size != null && (
              <span className="text-muted-foreground">
                {formatBytes(part.size)}
              </span>
            )}
            <Download className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

/** Props for {@link Checkpoint}. */
export interface CheckpointProps extends React.ComponentProps<'div'> {
  /** Label shown on the savepoint marker. */
  label?: string;
  /** Fires when the user activates restore — the app rolls the thread back. */
  onRestore?: () => void;
}

/**
 * An inter-message savepoint marker. Place it between messages; activating
 * "restore" fires `onRestore` so the app can roll the persisted thread back to
 * this point (pure client state over IndexedDB-persisted threads).
 */
export function Checkpoint({
  label = 'Checkpoint',
  onRestore,
  className,
  ...props
}: CheckpointProps) {
  return (
    <div
      data-slot="checkpoint"
      className={cn(
        'my-1 flex items-center gap-2 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span className="h-px flex-1 bg-border" />
      <span className="inline-flex items-center gap-1">
        <Bookmark className="size-3" />
        {label}
      </span>
      {onRestore && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onRestore}
          className="h-6 px-2 text-xs"
        >
          Restore
        </Button>
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Re-export for convenience when composing close-icon UIs. */
export { X as MessageCloseIcon };
