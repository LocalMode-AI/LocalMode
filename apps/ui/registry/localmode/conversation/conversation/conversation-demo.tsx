'use client';

/**
 * @file conversation-demo.tsx
 * @description Docs preview for `Conversation`. Renders a static set of messages
 * in the scroll container so the auto-stick-to-bottom, scroll-up release, and
 * scroll-to-bottom control can be exercised without any model download.
 */
import { cn } from '@/registry/localmode/lib/utils';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollAnchor,
  ConversationScrollButton,
} from './conversation';

const SAMPLE = [
  { id: '1', role: 'user', text: 'What can I run locally in the browser?' },
  {
    id: '2',
    role: 'assistant',
    text: 'Embeddings, chat LLMs, speech-to-text, vision - all on-device, no server, no API keys. Try scrolling: this list auto-pins to the bottom.',
  },
  { id: '3', role: 'user', text: 'Does it work offline?' },
  {
    id: '4',
    role: 'assistant',
    text: 'Yes. After the first model download, everything runs offline. Scroll up and a "scroll to latest" button appears.',
  },
  { id: '5', role: 'user', text: 'Nice.' },
  {
    id: '6',
    role: 'assistant',
    text: 'Scroll up here to release the bottom-pin and reveal the floating control, then click it to re-pin.',
  },
];

export default function ConversationDemo() {
  return (
    <div className="h-80 w-full overflow-hidden rounded-lg border border-border">
      <Conversation>
        <ConversationContent>
          {SAMPLE.length === 0 && <ConversationEmptyState />}
          {SAMPLE.map((m) => (
            <div
              key={m.id}
              data-role={m.role}
              className="flex flex-col gap-1 data-[role=user]:items-end"
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-card-foreground',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          <ConversationScrollAnchor />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
