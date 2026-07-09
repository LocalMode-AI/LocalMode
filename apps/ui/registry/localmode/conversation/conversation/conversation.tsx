'use client';

/**
 * @file conversation.tsx
 * @description The scrollable message-display surface for a chat. `Conversation`
 * is a scroll container with first-class scroll-anchoring: it auto-pins to the
 * newest content while tokens stream, releases the pin when the user scrolls up,
 * surfaces a scroll-to-bottom control while released, and re-pins when the user
 * returns to the bottom. It is presentational — it renders the children/messages
 * passed in and owns no message state (that lives in `useChat`).
 *
 * Driven by `@localmode/react`'s `useChat().messages`.
 */
import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Context shared between `Conversation` and its scroll-button/anchor. */
interface ConversationContextValue {
  /** Ref to the scroll viewport. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the view is currently pinned to the bottom. */
  isPinned: boolean;
  /** Scroll to (and re-pin) the bottom. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext =
  React.createContext<ConversationContextValue | null>(null);

/** Access the conversation scroll state (within a `Conversation`). */
export function useConversation() {
  const ctx = React.useContext(ConversationContext);
  if (!ctx) {
    throw new Error('useConversation must be used within <Conversation>');
  }
  return ctx;
}

/** Props for {@link Conversation}. */
export interface ConversationProps extends React.ComponentProps<'div'> {
  /**
   * When true (typically `useChat().isStreaming`), the view auto-pins to the
   * bottom as content grows — unless the user has scrolled up.
   * @default false
   */
  streaming?: boolean;
}

/**
 * Scrollable conversation container with auto-stick-to-bottom anchoring.
 *
 * @example
 * ```tsx
 * <Conversation streaming={isStreaming}>
 *   <ConversationContent>
 *     {messages.length === 0 && <ConversationEmptyState />}
 *     {messages.map((m) => <Message key={m.id} {...m} />)}
 *     <ConversationScrollAnchor />
 *   </ConversationContent>
 *   <ConversationScrollButton />
 * </Conversation>
 * ```
 */
export function Conversation({
  streaming = false,
  className,
  children,
  ...props
}: ConversationProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = React.useState(true);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setIsPinned(true);
  }, []);

  // Track whether the user is at the bottom; release the pin on scroll-up.
  const handleScroll = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsPinned(distance < 24);
  }, []);

  // Auto-pin while streaming/growing, but only if the user hasn't scrolled up.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (!isPinned) return;
    el.scrollTop = el.scrollHeight;
  });

  const ctx = React.useMemo<ConversationContextValue>(
    () => ({ viewportRef, isPinned, scrollToBottom }),
    [isPinned, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={ctx}>
      <div
        className={cn('relative flex min-h-0 flex-1 flex-col', className)}
        data-streaming={streaming || undefined}
        {...props}
      >
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          data-pinned={isPinned || undefined}
          className="flex-1 overflow-y-auto overscroll-contain"
          role="log"
          aria-live="polite"
        >
          {children}
        </div>
      </div>
    </ConversationContext.Provider>
  );
}

/** Props for {@link ConversationContent}. */
export type ConversationContentProps = React.ComponentProps<'div'>;

/** Inner padded column holding the message list. */
export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <div
      data-slot="conversation-content"
      className={cn('mx-auto flex w-full max-w-3xl flex-col gap-4 p-4', className)}
      {...props}
    />
  );
}

/**
 * A zero-height anchor element placed at the end of the message list. Marks the
 * bottom of the conversation. The actual stick-to-bottom scrolling is done by
 * `Conversation` itself via the viewport's own `scrollTop` (container-scoped) —
 * this anchor must NOT call `scrollIntoView`, which would scroll the whole page
 * (the nearest scrollable ancestor *and* the window) and jump the viewport.
 */
export function ConversationScrollAnchor({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="conversation-scroll-anchor"
      className={cn('h-px w-full shrink-0', className)}
      {...props}
    />
  );
}

/** Props for {@link ConversationScrollButton}. */
export type ConversationScrollButtonProps = React.ComponentProps<typeof Button>;

/**
 * Floating scroll-to-bottom button. Appears only when the pin is released
 * (the user has scrolled up).
 */
export function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isPinned, scrollToBottom } = useConversation();
  if (isPinned) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to latest"
      className={cn(
        'absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md',
        className,
      )}
      {...props}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
}

/** Props for {@link ConversationEmptyState}. */
export interface ConversationEmptyStateProps
  extends React.ComponentProps<'div'> {
  /** Optional heading text. */
  title?: string;
  /** Optional supporting description. */
  description?: string;
  /** Optional leading icon node. */
  icon?: React.ReactNode;
}

/**
 * Empty-state slot rendered when there are no messages. Pass children to fully
 * customize, or use the `title`/`description`/`icon` props for the default.
 */
export function ConversationEmptyState({
  title = 'Start the conversation',
  description = 'Send a message to begin. Everything runs locally in your browser.',
  icon,
  className,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      data-slot="conversation-empty-state"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="mb-2 text-muted-foreground">{icon}</div>}
          <p className="text-base font-medium text-foreground">{title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        </>
      )}
    </div>
  );
}
