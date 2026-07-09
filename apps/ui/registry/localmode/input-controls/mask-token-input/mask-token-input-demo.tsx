'use client';

import { useState } from 'react';
import { useFillMask } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { MaskTokenInput } from './mask-token-input';

/**
 * Demo for MaskTokenInput, used by the docs live preview. Wires the input to a
 * real `useFillMask` flow backed by a small BERT model. The model downloads on
 * the first submit (Run-gated), then predictions render below.
 */
export default function MaskTokenInputDemo() {
  const [text, setText] = useState('The capital of France is [MASK].');
  const { data, isLoading, error, execute } = useFillMask({
    model: transformers.fillMask('Xenova/bert-base-uncased'),
    topK: 5,
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <MaskTokenInput
        value={text}
        onChange={setText}
        onSubmit={execute}
        disabled={isLoading}
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">Predicting…</p>
      )}
      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
      {data && !isLoading && (
        <ul className="flex flex-col gap-1 text-sm">
          {data.predictions.map((p) => (
            <li
              key={p.token}
              className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
            >
              <span className="font-medium">{p.token}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {(p.score * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
