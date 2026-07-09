'use client';

import { useState } from 'react';

import { SystemPromptEditor, DEFAULT_SYSTEM_PROMPT } from './system-prompt-editor';

/**
 * Demo for SystemPromptEditor, used by the docs live preview. Controlled — pick
 * a preset to replace the value, or type freely to deselect all presets. The
 * consumer owns persistence; here the value simply lives in local state.
 */
export default function SystemPromptEditorDemo() {
  const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <SystemPromptEditor value={prompt} onChange={setPrompt} />
      <p className="text-xs text-muted-foreground">
        {prompt.length} characters - applied on the next chat turn in a real app.
      </p>
    </div>
  );
}
