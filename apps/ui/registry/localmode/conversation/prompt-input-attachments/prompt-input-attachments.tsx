'use client';

/**
 * @file prompt-input-attachments.tsx
 * @description Attachment surface for the composer. Adds image/file attachments
 * via file picker, paste, and drag-and-drop; renders preview thumbnails with
 * per-item removal, a hovercard preview, media-category auto-detection, and
 * upload-state chips. Produced attachments match `@localmode/react`'s image
 * content model and reuse its `readFileAsDataUrl` helper.
 *
 * Pairs with `PromptInput`/`PromptInputProvider`: it reports attachments via
 * `onChange` (or writes through the provider when present).
 */
import * as React from 'react';
import { readFileAsDataUrl } from '@/lib/browser-utils';
import { File as FileIcon, Film, Music, Paperclip, X } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/registry/localmode/ui/hover-card';
import {
  usePromptInputContext,
  type PromptAttachment,
} from '@/components/prompt-input';

/** Coarse media category derived from a MIME type. */
export type MediaCategory = 'image' | 'video' | 'audio' | 'document';

/** Classify a MIME type into a coarse media category. */
export function mediaCategory(mimeType: string): MediaCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Strip the `data:<mime>;base64,` prefix to match `@localmode/core`'s model. */
function stripDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

async function fileToAttachment(file: File): Promise<PromptAttachment> {
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: crypto.randomUUID(),
    data: stripDataUrl(dataUrl),
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  };
}

/** Props for {@link PromptInputAttachments}. */
export interface PromptInputAttachmentsProps
  extends Omit<React.ComponentProps<'div'>, 'onChange'> {
  /** Current attachments (controlled). Falls back to the provider when omitted. */
  value?: PromptAttachment[];
  /** Reports the new attachment list after add/remove (controlled). */
  onChange?: (attachments: PromptAttachment[]) => void;
  /** Accept filter for the picker / drop. @default "image/*" */
  accept?: string;
  /** Allow multiple files. @default true */
  multiple?: boolean;
}

/**
 * The attachment dropzone + preview strip.
 *
 * @example
 * ```tsx
 * <PromptInputProvider>
 *   <PromptInput onSubmit={send}>…</PromptInput>
 *   <PromptInputAttachments />
 * </PromptInputProvider>
 * ```
 */
export function PromptInputAttachments({
  value,
  onChange,
  accept = 'image/*',
  multiple = true,
  className,
  children,
  ...props
}: PromptInputAttachmentsProps) {
  const provider = usePromptInputContext();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const attachments = value ?? provider?.attachments ?? [];

  const setAttachments = (next: PromptAttachment[]) => {
    onChange?.(next);
    provider?.setAttachments(next);
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const next = await Promise.all(list.map(fileToAttachment));
    setAttachments([...attachments, ...next]);
  };

  const remove = (id: string) =>
    setAttachments(attachments.filter((a) => a.id !== id));

  // Paste handler (image clipboard items anywhere within the dropzone).
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  return (
    <div
      data-slot="prompt-input-attachments"
      data-dragging={dragging || undefined}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
      className={cn(
        'rounded-lg border border-dashed border-border p-2 transition-colors',
        dragging && 'border-ring bg-accent/40',
        className,
      )}
      {...props}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          className="text-muted-foreground"
        >
          <Paperclip className="size-4" />
          Attach
        </Button>

        {attachments.length === 0 && !children && (
          <span className="min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {dragging ? 'Drop to attach' : 'Drop images here'}
          </span>
        )}

        {attachments.map((att) => (
          <AttachmentChip key={att.id} attachment={att} onRemove={() => remove(att.id)} />
        ))}

        {children}
      </div>
    </div>
  );
}

/** Props for {@link AttachmentChip}. */
interface AttachmentChipProps {
  attachment: PromptAttachment;
  onRemove: () => void;
}

/** A single attachment preview chip with hovercard + remove control. */
function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const category = mediaCategory(attachment.mimeType);
  const url = `data:${attachment.mimeType};base64,${attachment.data}`;
  const CategoryIcon =
    category === 'video' ? Film : category === 'audio' ? Music : FileIcon;

  return (
    <div
      data-slot="attachment-chip"
      data-category={category}
      className="group relative inline-flex items-center"
    >
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {category === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={attachment.name ?? 'image'} className="size-6 rounded object-cover" />
            ) : (
              <CategoryIcon className="size-4 text-muted-foreground" />
            )}
            <span className="max-w-28 truncate">{attachment.name ?? category}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto p-2">
          {category === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={attachment.name ?? 'preview'} className="max-h-48 max-w-[calc(100vw-4rem)] rounded object-contain" />
          ) : (
            <div className="max-w-[min(20rem,calc(100vw-4rem))] break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {attachment.name} · {attachment.mimeType}
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 rounded-full bg-secondary p-0.5 text-secondary-foreground opacity-60 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:opacity-0"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
