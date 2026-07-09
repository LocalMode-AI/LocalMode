'use client';

/**
 * @file scroll-to-bottom-button.tsx
 * @description A floating scroll-to-bottom affordance tied to a chat container's
 * scroll state. It appears when the user scrolls up from the bottom and pairs
 * with `ScrollAnchor` (a zero-height element marking the pin point). Standalone:
 * pass a ref to the scroll container, or let it find the nearest scrollable
 * ancestor. Data source: `useChat` (local token stream growth).
 */
import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Props for {@link ScrollToBottomButton}. */
export interface ScrollToBottomButtonProps
  extends React.ComponentProps<typeof Button> {
  /**
   * The scroll container to observe. When omitted, the nearest scrollable
   * ancestor of the button is used.
   */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Distance (px) from the bottom under which the button hides. @default 24 */
  threshold?: number;
}

/** Find the nearest scrollable ancestor of an element. */
function nearestScrollable(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * The floating scroll-to-bottom button.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <div ref={scrollRef} className="overflow-y-auto">…<ScrollAnchor /></div>
 *   <ScrollToBottomButton containerRef={scrollRef} />
 * </div>
 * ```
 */
export function ScrollToBottomButton({
  containerRef,
  threshold = 24,
  className,
  children,
  ...props
}: ScrollToBottomButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  // Resolve the container (explicit ref or nearest scrollable ancestor).
  React.useEffect(() => {
    const el = containerRef?.current ?? nearestScrollable(buttonRef.current);
    setContainer(el);
  }, [containerRef]);

  // Observe scroll position.
  React.useEffect(() => {
    if (!container) return;
    const update = () => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setVisible(distance > threshold);
    };
    update();
    container.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => {
      container.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [container, threshold]);

  const scrollToBottom = () => {
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  return (
    <Button
      ref={buttonRef}
      type="button"
      size="icon"
      variant="secondary"
      aria-label="Scroll to latest"
      data-slot="scroll-to-bottom-button"
      data-visible={visible || undefined}
      onClick={scrollToBottom}
      className={cn(
        'absolute bottom-4 right-4 rounded-full shadow-md transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        className,
      )}
      {...props}
    >
      {children ?? <ArrowDown className="size-4" />}
    </Button>
  );
}

/**
 * A zero-height anchor element placed at the end of a message list to mark the
 * pin point for stick-to-bottom anchoring.
 */
export function ScrollAnchor({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="scroll-anchor"
      className={cn('h-px w-full shrink-0', className)}
      {...props}
    />
  );
}
