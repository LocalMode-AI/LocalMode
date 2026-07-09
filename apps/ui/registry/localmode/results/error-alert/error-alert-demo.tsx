'use client';

import { useState } from 'react';

import { ErrorAlert } from './error-alert';

/**
 * Demo for ErrorAlert, used by the docs live preview. A dismissible alert with
 * a working retry — dismissing hides it, "Trigger error" brings it back.
 */
export default function ErrorAlertDemo() {
  const [visible, setVisible] = useState(true);
  const [count, setCount] = useState(0);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Trigger error
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <ErrorAlert
        message="Model failed to load: the network request timed out."
        onRetry={() => setCount((c) => c + 1)}
        onDismiss={() => setVisible(false)}
      />
      {count > 0 && (
        <p className="text-xs text-muted-foreground">Retry pressed {count}×</p>
      )}
    </div>
  );
}
