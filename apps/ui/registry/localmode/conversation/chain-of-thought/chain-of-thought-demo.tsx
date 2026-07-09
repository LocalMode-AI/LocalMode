'use client';

/**
 * @file chain-of-thought-demo.tsx
 * @description Docs preview for `ChainOfThought`. Streams itemized reasoning
 * steps with per-step status and a nested search-result slot, then collapses to
 * a single line on completion.
 */
import * as React from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from './chain-of-thought';

export default function ChainOfThoughtDemo() {
  const [active, setActive] = React.useState(0);
  const done = active >= 3;

  React.useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => setActive((a) => a + 1), 1200);
    return () => window.clearTimeout(id);
  }, [active, done]);

  const status = (i: number) =>
    i < active ? 'complete' : i === active ? 'active' : 'pending';

  return (
    <div className="w-full max-w-xl">
      <ChainOfThought done={done}>
        <ChainOfThoughtHeader />
        <ChainOfThoughtContent>
          <ChainOfThoughtStep label="Parse the question" status={status(0)} />
          <ChainOfThoughtStep label="Search local documents" status={status(1)}>
            <ChainOfThoughtSearchResults>
              <ChainOfThoughtSearchResult>handbook.pdf</ChainOfThoughtSearchResult>
              <ChainOfThoughtSearchResult>faq.md</ChainOfThoughtSearchResult>
            </ChainOfThoughtSearchResults>
          </ChainOfThoughtStep>
          <ChainOfThoughtStep label="Synthesize the answer" status={status(2)} />
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
