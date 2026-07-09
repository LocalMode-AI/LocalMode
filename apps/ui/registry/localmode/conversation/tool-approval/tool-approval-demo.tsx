'use client';

/**
 * @file tool-approval-demo.tsx
 * @description Docs preview for `ToolApproval`. Approve or reject a pending tool
 * call; the card re-renders as a read-only receipt of the decision.
 */
import * as React from 'react';
import { ToolApproval, type ApprovalDecision } from './tool-approval';

export default function ToolApprovalDemo() {
  const [decision, setDecision] = React.useState<ApprovalDecision | null>(null);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <ToolApproval
        toolName="send_email"
        args={{ to: 'team@example.com', subject: 'Weekly summary' }}
        decision={decision}
        onApprove={() => setDecision('approved')}
        onReject={() => setDecision('rejected')}
      />
      {decision && (
        <button
          type="button"
          onClick={() => setDecision(null)}
          className="self-start text-xs text-muted-foreground underline"
        >
          Reset demo
        </button>
      )}
    </div>
  );
}
