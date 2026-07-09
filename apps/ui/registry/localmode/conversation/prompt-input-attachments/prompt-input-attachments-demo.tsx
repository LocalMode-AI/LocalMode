'use client';

/**
 * @file prompt-input-attachments-demo.tsx
 * @description Docs preview for `PromptInputAttachments`. Attach images via the
 * picker, paste, or drag-and-drop; remove a thumbnail; see the payload update.
 */
import * as React from 'react';
import {
  PromptInput,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptAttachment,
} from '../prompt-input/prompt-input';
import { PromptInputAttachments } from './prompt-input-attachments';

export default function PromptInputAttachmentsDemo() {
  const [sent, setSent] = React.useState<{ text: string; count: number } | null>(
    null,
  );

  return (
    <PromptInputProvider>
      <div className="flex w-full max-w-xl flex-col gap-2">
        <PromptInputAttachments />
        <PromptInput
          onSubmit={(text: string, attachments: PromptAttachment[]) =>
            setSent({ text, count: attachments.length })
          }
        >
          <PromptInputTextarea placeholder="Attach an image (drop / paste / picker), then send…" />
          <PromptInputTools>
            <span className="hidden min-w-0 truncate px-2 text-xs text-muted-foreground sm:inline">
              Images travel as base64 ContentParts
            </span>
            <PromptInputSubmit className="shrink-0" />
          </PromptInputTools>
        </PromptInput>
        {sent && (
          <p className="text-sm text-muted-foreground">
            Sent “{sent.text || '(no text)'}” with {sent.count} attachment(s).
          </p>
        )}
      </div>
    </PromptInputProvider>
  );
}
