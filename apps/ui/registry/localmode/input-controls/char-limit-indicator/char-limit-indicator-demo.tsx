'use client';

import { useState } from 'react';
import { CharLimitIndicator } from './char-limit-indicator';

/**
 * Demo for the CharLimitIndicator, used by the docs live preview. A bound
 * textarea drives the ring + counter; type past the limit to see the error
 * state. Pure UI — no model download.
 */
export default function CharLimitIndicatorDemo() {
  const [value, setValue] = useState('Local-first AI runs entirely in your browser.');
  const maxLength = 80;

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        placeholder="Type to drive the ring…"
      />
      <div className="flex justify-end">
        <CharLimitIndicator charCount={value.length} maxLength={maxLength} />
      </div>
    </div>
  );
}
