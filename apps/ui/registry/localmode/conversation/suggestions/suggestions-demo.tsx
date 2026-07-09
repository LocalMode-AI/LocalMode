'use client';

/**
 * @file suggestions-demo.tsx
 * @description Docs preview for `Suggestions`. Activating a chip echoes its text.
 */
import * as React from 'react';
import { Suggestion, Suggestions } from './suggestions';

const PROMPTS = [
  'Summarize this page',
  'Explain like I am five',
  'Draft a reply',
  'Find related local documents',
  'Translate to French',
];

export default function SuggestionsDemo() {
  const [picked, setPicked] = React.useState<string | null>(null);
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <Suggestions>
        {PROMPTS.map((p) => (
          <Suggestion key={p} suggestion={p} onSelect={setPicked} />
        ))}
      </Suggestions>
      {picked && (
        <p className="text-sm text-muted-foreground">Selected: “{picked}”</p>
      )}
    </div>
  );
}
