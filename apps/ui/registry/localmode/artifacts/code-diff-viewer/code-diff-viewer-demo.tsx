'use client';

/**
 * @file code-diff-viewer-demo.tsx
 * @description Demo for CodeDiffViewer, used by the docs live preview. Diffs a
 * realistic PII-redaction before/after (the canonical `redactPII` use case) and
 * lets you toggle unified vs split mode. Pure client-side; no model download.
 */

import { useState } from 'react';
import { CodeDiffViewer } from './code-diff-viewer';

const RAW = `Hi, I'm Jane Doe.
Email me at jane.doe@example.com
or call 555-123-4567.
My account is 4111 1111 1111 1111.`;

const REDACTED = `Hi, I'm [REDACTED_NAME].
Email me at [REDACTED_EMAIL]
or call [REDACTED_PHONE].
My account is [REDACTED_CARD].`;

export default function CodeDiffViewerDemo() {
  const [mode, setMode] = useState<'unified' | 'split'>('unified');

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit overflow-hidden rounded-md border border-border text-sm">
        {(['unified', 'split'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              mode === m
                ? 'bg-primary px-3 py-1 text-primary-foreground'
                : 'px-3 py-1 text-muted-foreground hover:bg-accent'
            }
          >
            {m}
          </button>
        ))}
      </div>
      <CodeDiffViewer
        original={RAW}
        modified={REDACTED}
        mode={mode}
        originalLabel="Raw"
        modifiedLabel="Redacted"
        className="max-w-xl"
      />
    </div>
  );
}
