'use client';

import { useState } from 'react';

import { LockStatusBadge, type LockStatus } from './lock-status-badge';

const STATUSES: LockStatus[] = ['no-vault', 'locked', 'unlocked'];

/**
 * Demo for LockStatusBadge, used by the docs live preview. Fixture-driven —
 * cycles through the three lock states on click. No crypto, no model.
 */
export default function LockStatusBadgeDemo() {
  const [index, setIndex] = useState(1);
  const status = STATUSES[index];

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <LockStatusBadge key={s} status={s} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % STATUSES.length)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
      >
        Cycle state
      </button>
      <p className="text-xs text-muted-foreground">
        Current: <LockStatusBadge status={status} />
      </p>
    </div>
  );
}
