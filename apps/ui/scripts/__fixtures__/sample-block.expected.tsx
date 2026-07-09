'use client';

/**
 * @file sample-block.tsx
 * @description Sample block for the strip-snippet golden test — one clean line.
 * @constraint wllama n_ctx capped at 8192 for the wasm32 heap.
 */
import * as React from 'react';

export function SampleBlock({ items }: { items: readonly string[] }): React.ReactElement {
  const url = `https://example.com/a//b/* not a comment */`;
  const label = 'run';
  const active: boolean = url.length > 0;
  return (
    <div className="wrap">
      <p className="hint">Visit https://example.com // not a comment (JSX text)</p>
      <button type="button" className="btn">
        {label}
      </button>
      {/** KEEP: constraint comment retained because it carries a KEEP tag. */}
      {items.map((item, i) => (
        <p key={item} className="row" {...(i === 0 ? { } : {})}>
          <span
            {...(i === 0
              ? {
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
