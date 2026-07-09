'use client';

/**
 * @file scroll-to-bottom-button-demo.tsx
 * @description Docs preview for `ScrollToBottomButton`. Scroll up in the list to
 * reveal the floating button; click it to scroll back to the pinned anchor.
 */
import * as React from 'react';
import {
  ScrollAnchor,
  ScrollToBottomButton,
} from './scroll-to-bottom-button';

export default function ScrollToBottomButtonDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div className="relative h-72 w-full max-w-md overflow-hidden rounded-lg border border-border">
      <div ref={ref} className="h-full overflow-y-auto p-3">
        <div className="space-y-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground"
            >
              Message {i + 1}
            </div>
          ))}
          <ScrollAnchor />
        </div>
      </div>
      <ScrollToBottomButton containerRef={ref} />
    </div>
  );
}
