'use client';

/**
 * @file actions-demo.tsx
 * @description Docs preview for `Actions`. Copy to clipboard (with copied
 * state), regenerate, read-aloud, an overflow menu, and an on-device feedback
 * bar — all local, no telemetry.
 */
import * as React from 'react';
import { Flag, Share2 } from 'lucide-react';
import {
  Actions,
  ActionsMenu,
  CopyAction,
  FeedbackBar,
  ReadAloudAction,
  RegenerateAction,
} from './actions';

export default function ActionsDemo() {
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const text = 'LocalMode runs AI models entirely in your browser - no servers.';

  return (
    <div className="group flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <p className="text-sm">{text}</p>
      <Actions>
        <CopyAction text={text} />
        <RegenerateAction onRegenerate={() => setFeedback('regenerated')} />
        <ReadAloudAction onReadAloud={() => setFeedback('read aloud')} />
        <FeedbackBar onFeedback={(v) => setFeedback(`feedback: ${v}`)} />
        <ActionsMenu
          items={[
            { id: 'share', label: 'Share', icon: <Share2 className="size-4" />, onSelect: () => setFeedback('share') },
            { id: 'report', label: 'Report', icon: <Flag className="size-4" />, onSelect: () => setFeedback('report') },
          ]}
        />
      </Actions>
      {feedback && (
        <p className="text-xs text-muted-foreground">Last action: {feedback}</p>
      )}
    </div>
  );
}
