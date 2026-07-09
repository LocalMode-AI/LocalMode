'use client';

/**
 * @file prompt-input.tsx
 * @description The chat composer. `PromptInput` is a form-based, auto-resizing
 * textarea that manages its own input state by default (Enter submits,
 * Shift+Enter inserts a newline) and swaps its submit control for a stop control
 * while streaming. It exposes `onSubmit(text, attachments?)` and optional
 * controlled `value`/`onValueChange`. Composer affordances: a voice/dictation
 * mic toggle (wire to local Whisper STT) and a slash-command / "+" picker.
 *
 * `PromptInputProvider` exposes the composer state (text + attachments) for
 * external control (clear-after-send, programmatic attach). Presentational —
 * the app owns send/stream state (`useChat`).
 */
import * as React from 'react';
import { ArrowUp, Mic, Plus, Square } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** An attachment carried by the composer (matches `@localmode/react` image model). */
export interface PromptAttachment {
  /** Stable id for list keys / removal. */
  id: string;
  /** Base64 data (no `data:` prefix). */
  data: string;
  /** MIME type. */
  mimeType: string;
  /** Original filename. */
  name?: string;
  /** Size in bytes. */
  size?: number;
}

/** Shared composer state surfaced by {@link PromptInputProvider}. */
export interface PromptInputContextValue {
  text: string;
  setText: (text: string) => void;
  attachments: PromptAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<PromptAttachment[]>>;
  addAttachments: (items: PromptAttachment[]) => void;
  removeAttachment: (id: string) => void;
  clear: () => void;
}

const PromptInputContext =
  React.createContext<PromptInputContextValue | null>(null);

/** Access composer state. Returns `null` when used outside a provider. */
export function usePromptInputContext() {
  return React.useContext(PromptInputContext);
}

/** Props for {@link PromptInputProvider}. */
export interface PromptInputProviderProps {
  children: React.ReactNode;
}

/**
 * Optional provider that hoists composer state (text + attachments) so external
 * components (e.g. an attachments dropzone, a clear-after-send effect) can read
 * and mutate it.
 */
export function PromptInputProvider({ children }: PromptInputProviderProps) {
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<PromptAttachment[]>([]);

  const value = React.useMemo<PromptInputContextValue>(
    () => ({
      text,
      setText,
      attachments,
      setAttachments,
      addAttachments: (items) => setAttachments((prev) => [...prev, ...items]),
      removeAttachment: (id) =>
        setAttachments((prev) => prev.filter((a) => a.id !== id)),
      clear: () => {
        setText('');
        setAttachments([]);
      },
    }),
    [text, attachments],
  );

  return (
    <PromptInputContext.Provider value={value}>
      {children}
    </PromptInputContext.Provider>
  );
}

/** Internal form-state context shared by the sub-parts. */
interface PromptFormState {
  text: string;
  setText: (t: string) => void;
  streaming: boolean;
  attachments: PromptAttachment[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  submit: () => void;
  onStop?: () => void;
}
const PromptFormContext = React.createContext<PromptFormState | null>(null);
function usePromptForm() {
  const ctx = React.useContext(PromptFormContext);
  if (!ctx)
    throw new Error('PromptInput sub-parts must be used within <PromptInput>');
  return ctx;
}

/** Props for {@link PromptInput}. */
export interface PromptInputProps
  extends Omit<React.ComponentProps<'form'>, 'onSubmit'> {
  /** Fired with the trimmed text (and attachments) on submit. */
  onSubmit: (text: string, attachments: PromptAttachment[]) => void;
  /** Controlled value (optional). */
  value?: string;
  /** Reports edits in controlled mode. */
  onValueChange?: (value: string) => void;
  /** When true, the submit control becomes a stop control. @default false */
  streaming?: boolean;
  /** Fired when the user activates the stop control. */
  onStop?: () => void;
  /** Attachments to include in the next submit (from `PromptInputAttachments`). */
  attachments?: PromptAttachment[];
  /** Disable the whole composer. */
  disabled?: boolean;
}

/**
 * The composer form. Wraps `PromptInputTextarea`, `PromptInputTools`, and
 * `PromptInputSubmit`.
 *
 * @example
 * ```tsx
 * <PromptInput streaming={isStreaming} onStop={cancel} onSubmit={(t) => send(t)}>
 *   <PromptInputTextarea placeholder="Ask anything…" />
 *   <PromptInputTools>
 *     <PromptInputSubmit />
 *   </PromptInputTools>
 * </PromptInput>
 * ```
 */
export function PromptInput({
  onSubmit,
  value,
  onValueChange,
  streaming = false,
  onStop,
  attachments = [],
  disabled,
  className,
  children,
  ...props
}: PromptInputProps) {
  const provider = usePromptInputContext();
  const [internal, setInternal] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Resolve text from controlled prop → provider → internal state.
  const text = value ?? provider?.text ?? internal;
  const setText = React.useCallback(
    (t: string) => {
      onValueChange?.(t);
      provider?.setText(t);
      if (value == null && !provider) setInternal(t);
    },
    [onValueChange, provider, value],
  );

  const resolvedAttachments = provider?.attachments ?? attachments;

  const submit = React.useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && resolvedAttachments.length === 0) || streaming || disabled)
      return;
    onSubmit(trimmed, resolvedAttachments);
    setText('');
    provider?.setAttachments([]);
  }, [text, resolvedAttachments, streaming, disabled, onSubmit, setText, provider]);

  const formState = React.useMemo<PromptFormState>(
    () => ({
      text,
      setText,
      streaming,
      attachments: resolvedAttachments,
      textareaRef,
      submit,
      onStop,
    }),
    [text, setText, streaming, resolvedAttachments, submit, onStop],
  );

  return (
    <PromptFormContext.Provider value={formState}>
      <form
        data-slot="prompt-input"
        data-streaming={streaming || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          'flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20',
          disabled && 'pointer-events-none opacity-60',
          className,
        )}
        {...props}
      >
        {children}
      </form>
    </PromptFormContext.Provider>
  );
}

/** Props for {@link PromptInputTextarea}. */
export interface PromptInputTextareaProps
  extends Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> {
  /** Max pixel height before the textarea scrolls. @default 200 */
  maxHeight?: number;
}

/** Auto-resizing textarea. Enter submits; Shift+Enter inserts a newline. */
export function PromptInputTextarea({
  maxHeight = 200,
  className,
  onKeyDown,
  placeholder = 'Send a message…',
  'aria-label': ariaLabel,
  ...props
}: PromptInputTextareaProps) {
  const { text, setText, textareaRef, submit, streaming } = usePromptForm();

  // Auto-resize to content up to maxHeight.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text, maxHeight, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      data-slot="prompt-input-textarea"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel ?? 'Message'}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!streaming) submit();
        }
      }}
      className={cn(
        'max-h-[50vh] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link PromptInputTools}. */
export type PromptInputToolsProps = React.ComponentProps<'div'>;

/** Footer row for composer controls (tools on the left, submit on the right). */
export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn('flex flex-wrap items-center justify-between gap-1', className)}
      {...props}
    />
  );
}

/** Props for {@link PromptInputSubmit}. */
export interface PromptInputSubmitProps
  extends React.ComponentProps<typeof Button> {
  /** Override the default submit/stop icons. */
  submitIcon?: React.ReactNode;
  stopIcon?: React.ReactNode;
}

/** Submit control that becomes a stop control while streaming. */
export function PromptInputSubmit({
  className,
  submitIcon,
  stopIcon,
  ...props
}: PromptInputSubmitProps) {
  const { streaming, onStop, text, attachments } = usePromptForm();
  const empty = text.trim().length === 0 && attachments.length === 0;

  if (streaming) {
    return (
      <Button
        type="button"
        size="icon"
        onClick={onStop}
        aria-label="Stop generating"
        data-slot="prompt-input-stop"
        className={cn('rounded-full', className)}
        {...props}
      >
        {stopIcon ?? <Square className="size-4 fill-current" />}
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      size="icon"
      disabled={empty}
      aria-label="Send message"
      data-slot="prompt-input-submit"
      className={cn(
        'rounded-full transition-colors',
        empty &&
          'bg-muted text-muted-foreground disabled:opacity-100 hover:bg-muted',
        className,
      )}
      {...props}
    >
      {submitIcon ?? <ArrowUp className="size-4" />}
    </Button>
  );
}

/** Props for {@link PromptInputMic}. */
export interface PromptInputMicProps
  extends Omit<React.ComponentProps<typeof Button>, 'onToggle'> {
  /** Whether dictation is active (drives the recording style). */
  recording?: boolean;
  /** Toggle dictation — wire to local Whisper STT (`useVoiceRecorder`/`transcribe`). */
  onToggle?: (recording: boolean) => void;
}

/**
 * Voice/dictation mic toggle. Presentational: wire `onToggle` to start/stop a
 * local Whisper recording and write the transcript back via the controlled
 * `value`/provider. Real microphone capture is provided by the app.
 */
export function PromptInputMic({
  recording = false,
  onToggle,
  className,
  ...props
}: PromptInputMicProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-pressed={recording}
      aria-label={recording ? 'Stop dictation' : 'Start dictation'}
      onClick={() => onToggle?.(!recording)}
      data-slot="prompt-input-mic"
      data-recording={recording || undefined}
      className={cn(
        'rounded-full text-muted-foreground',
        recording && 'animate-pulse text-destructive',
        className,
      )}
      {...props}
    >
      <Mic className="size-4" />
    </Button>
  );
}

/** Props for {@link PromptInputAddButton}. */
export type PromptInputAddButtonProps = React.ComponentProps<typeof Button>;

/**
 * The "+" trigger for a slash-command / attachment context menu. Compose it
 * with a Popover or DropdownMenu of tool/attachment entries.
 */
export function PromptInputAddButton({
  className,
  children,
  ...props
}: PromptInputAddButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label="Add tool or attachment"
      data-slot="prompt-input-add"
      className={cn('rounded-full text-muted-foreground', className)}
      {...props}
    >
      {children ?? <Plus className="size-4" />}
    </Button>
  );
}
