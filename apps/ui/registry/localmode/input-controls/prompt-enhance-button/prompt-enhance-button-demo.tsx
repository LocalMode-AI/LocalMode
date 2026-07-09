'use client';

import { useState } from 'react';
import { useGenerateText } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { PromptEnhanceButton } from './prompt-enhance-button';

/**
 * Demo for PromptEnhanceButton, used by the docs live preview. The button hands
 * the draft to a real `useGenerateText` call backed by a small local model
 * (Qwen3 0.6B). The model downloads on the first enhance (Run-gated), then the
 * rewrite replaces the draft — entirely offline.
 */
export default function PromptEnhanceButtonDemo() {
  const [prompt, setPrompt] = useState('write about dogs');

  const { execute } = useGenerateText({
    model: transformers.languageModel('onnx-community/Qwen3-0.6B-ONNX'),
    maxTokens: 120,
    temperature: 0.7,
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        placeholder="Draft prompt…"
      />
      <PromptEnhanceButton
        draft={prompt}
        onApply={setPrompt}
        showExampleEditor
        onEnhance={async (draft) => {
          const result = await execute(
            `Rewrite the following prompt to be clearer, more specific, and well-structured. ` +
              `Return ONLY the improved prompt with no preamble.\n\nPrompt: ${draft}\n\nImproved prompt:`,
          );
          return result?.text.trim() ?? null;
        }}
      />
    </div>
  );
}
