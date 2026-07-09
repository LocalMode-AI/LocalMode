'use client';

/**
 * @file sample-block.tsx
 * @description Sample block for the strip-snippet golden test — one clean line.
 * This continuation line and everything below is dev/E2E prose that must drop.
 *
 * Feature bullets (inferable — dropped):
 * - Renders a status line and a couple of buttons.
 * - Keeps a template-literal URL and JSX text verbatim.
 *
 * Driver contract (data-testids): sample-status, sample-run, sample-answer,
 * sample-confidence. E2E: the platform spec drives these by testid.
 * QA note: this whole section is E2E noise and must not ship.
 *
 * @constraint wllama n_ctx capped at 8192 for the wasm32 heap.
 */
import * as React from 'react';

// QA: this standalone line comment must be removed.
export function SampleBlock({ items }: { items: readonly string[] }): React.ReactElement {
  /* E2E: this multi-line block comment
     spans several lines and must be
     removed entirely. */
  const url = `https://example.com/a//b/* not a comment */`;
  const label = 'run'; // trailing comment must be removed
  const active: boolean = url.length > 0;
  return (
    <div data-testid="sample-status" className="wrap">
      <p className="hint">Visit https://example.com // not a comment (JSX text)</p>
      <button type="button" data-testid={label} className="btn">
        {label}
      </button>
      {/** KEEP: constraint comment retained because it carries a KEEP tag. */}
      {items.map((item, i) => (
        <p key={item} className="row" {...(i === 0 ? { 'data-testid': 'sample-answer' } : {})}>
          <span
            {...(i === 0
              ? {
                  'data-testid': 'sample-confidence',
                  'data-score': String(i),
                }
              : {})}
          >
            {active ? item : label}
          </span>
        </p>
      ))}
    </div>
  );
}
