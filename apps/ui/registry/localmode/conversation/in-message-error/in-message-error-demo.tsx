'use client';

/**
 * @file in-message-error-demo.tsx
 * @description Docs preview for `InMessageError`. Shows an OOM-style local
 * inference failure inline on an assistant turn with a working retry control.
 */
import * as React from 'react';
import { InMessageError } from './in-message-error';

export default function InMessageErrorDemo() {
  const [retries, setRetries] = React.useState(0);
  return (
    <div className="flex w-full max-w-lg flex-col gap-2">
      <InMessageError
        error={new Error('WebGPU out of memory while allocating KV cache')}
        onRetry={() => setRetries((r) => r + 1)}
      />
      {retries > 0 && (
        <p className="text-xs text-muted-foreground">
          Retry invoked {retries} time(s).
        </p>
      )}
    </div>
  );
}
