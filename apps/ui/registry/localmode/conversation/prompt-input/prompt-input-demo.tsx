'use client';

/**
 * @file prompt-input-demo.tsx
 * @description Docs preview for `PromptInput`. Type and submit (Enter), insert a
 * newline (Shift+Enter), watch auto-resize, and toggle a simulated streaming
 * state to see the submit→stop swap. No model download.
 */
import * as React from 'react';
import {
  PromptInput,
  PromptInputAddButton,
  PromptInputMic,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from './prompt-input';

export default function PromptInputDemo() {
  const [log, setLog] = React.useState<string[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <PromptInput
        streaming={streaming}
        onStop={() => setStreaming(false)}
        onSubmit={(text) => {
          setLog((l) => [...l, text]);
          // Simulate a brief stream so the stop control is visible.
          setStreaming(true);
          window.setTimeout(() => setStreaming(false), 1500);
        }}
      >
        <PromptInputTextarea placeholder="Ask anything… (Enter to send, Shift+Enter for a newline)" />
        <PromptInputTools>
          <div className="flex items-center gap-1">
            <PromptInputAddButton />
            <PromptInputMic
              recording={recording}
              onToggle={setRecording}
            />
          </div>
          <PromptInputSubmit />
        </PromptInputTools>
      </PromptInput>

      {log.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {log.map((m, i) => (
            <li key={i}>• {m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
