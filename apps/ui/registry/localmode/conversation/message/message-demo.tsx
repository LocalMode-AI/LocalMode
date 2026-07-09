'use client';

/**
 * @file message-demo.tsx
 * @description Docs preview for `Message`. Shows role-aware rendering, markdown,
 * an image thumbnail with fullscreen, a file download chip, and a Checkpoint.
 */
import {
  Checkpoint,
  Message,
  MessageAvatar,
  MessageContent,
  type MessagePart,
} from './message';

// A small 48×36 gradient PNG (base64, no data: prefix) — a visible stand-in for a
// local image attachment, so the image part renders as a real thumbnail.
const SAMPLE_IMAGE =
  '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';

const ASSISTANT_PARTS: MessagePart[] = [
  { type: 'text', text: 'Here is a **summary** and an attached file:' },
  { type: 'file', name: 'report.pdf', mimeType: 'application/pdf', data: SAMPLE_IMAGE, size: 20480 },
];

export default function MessageDemo() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <Message role="user">
        <MessageAvatar role="user" />
        <MessageContent
          role="user"
          content={[
            { type: 'text', text: 'Describe this image.' },
            { type: 'image', data: SAMPLE_IMAGE, mimeType: 'image/png' },
          ]}
        />
      </Message>

      <Checkpoint label="Saved here" onRestore={() => {}} />

      <Message role="assistant">
        <MessageAvatar role="assistant" />
        <MessageContent role="assistant" content={ASSISTANT_PARTS} />
      </Message>

      <Message role="assistant">
        <MessageAvatar role="assistant" />
        <MessageContent
          role="assistant"
          variant="flat"
          content={'A `flat` variant renders inline prose with no bubble - good for long answers.'}
        />
      </Message>
    </div>
  );
}
