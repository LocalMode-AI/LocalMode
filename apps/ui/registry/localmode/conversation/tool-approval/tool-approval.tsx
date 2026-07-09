'use client';

/**
 * @file tool-approval.tsx
 * @description A human-in-the-loop confirmation card that gates a tool call
 * before it executes. It shows the pending tool + args with approve/reject
 * buttons, then re-renders read-only as an immutable "receipt" of the decision.
 * It pairs with the `Tool` primitive and feeds the choice back into the agent
 * loop via callbacks. Data source: `useAgent` (ReAct tool calls).
 */
import * as React from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** The decision recorded on the receipt. */
export type ApprovalDecision = 'approved' | 'rejected';

/** Props for {@link ToolApproval}. */
export interface ToolApprovalProps extends React.ComponentProps<'div'> {
  /** The tool name awaiting approval. */
  toolName: string;
  /** The proposed arguments. */
  args?: Record<string, unknown>;
  /** A controlled decision; when set, the card renders read-only as a receipt. */
  decision?: ApprovalDecision | null;
  /** Fires when the user approves — proceed with the tool call. */
  onApprove?: () => void;
  /** Fires when the user rejects — skip/abort the tool call. */
  onReject?: () => void;
}

/**
 * The tool-call approval gate.
 *
 * @example
 * ```tsx
 * <ToolApproval
 *   toolName="delete_file"
 *   args={{ path: '/tmp/x' }}
 *   onApprove={() => resume('approved')}
 *   onReject={() => resume('rejected')}
 * />
 * ```
 */
export function ToolApproval({
  toolName,
  args,
  decision: decisionProp,
  onApprove,
  onReject,
  className,
  ...props
}: ToolApprovalProps) {
  const [internal, setInternal] = React.useState<ApprovalDecision | null>(null);
  const decision = decisionProp ?? internal;

  const decide = (d: ApprovalDecision) => {
    if (decisionProp == null) setInternal(d);
    if (d === 'approved') onApprove?.();
    else onReject?.();
  };

  const argsText = args ? JSON.stringify(args, null, 2) : null;

  // Read-only receipt once decided.
  if (decision) {
    const approved = decision === 'approved';
    return (
      <div
        data-slot="tool-approval"
        data-decision={decision}
        className={cn(
          'flex items-center gap-2 rounded-lg border p-3 text-sm',
          approved
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-destructive/40 bg-destructive/5',
          className,
        )}
        {...props}
      >
        {approved ? (
          <Check className="size-4 text-emerald-500" />
        ) : (
          <X className="size-4 text-destructive" />
        )}
        <span className="min-w-0 break-all font-medium text-foreground">{toolName}</span>
        <span className="text-muted-foreground">
          {approved ? 'approved' : 'rejected'}
        </span>
      </div>
    );
  }

  return (
    <div
      data-slot="tool-approval"
      data-decision="pending"
      className={cn(
        'space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-amber-500" />
        <span className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
          Approve tool call: <span className="font-mono break-all">{toolName}</span>
        </span>
      </div>
      {argsText && (
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 text-xs">
          <code>{argsText}</code>
        </pre>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide('approved')}>
          <Check className="size-4" />
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => decide('rejected')}
        >
          <X className="size-4" />
          Reject
        </Button>
      </div>
    </div>
  );
}
