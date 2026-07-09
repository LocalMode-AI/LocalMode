'use client';

/**
 * @file tool.tsx
 * @description A single tool invocation card. `Tool` renders a status-aware
 * header (pending / running / streaming / completed / error) and an expandable
 * body of JSON `ToolInput` params and a `ToolOutput`/error. A per-tool renderer
 * registry (`ToolRendererRegistry`) lets you customize specific tools; `Fallback`
 * is the generic view for unregistered tools; `ToolGroup` collapses consecutive
 * calls behind a stacked-icon summary.
 *
 * Data source: `useAgent` / wllama/transformers tool calling.
 */
import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  Wrench,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';
import { Badge } from '@/registry/localmode/ui/badge';

/** Tool invocation status taxonomy. */
export type ToolStatus =
  | 'pending'
  | 'running'
  | 'streaming'
  | 'completed'
  | 'error';

/** A single tool call's data. */
export interface ToolCall {
  /** Tool name. */
  name: string;
  /** Input/arguments object. */
  input?: Record<string, unknown>;
  /** Output/result (any JSON-serializable value). */
  output?: unknown;
  /** Error message when `status === 'error'`. */
  error?: string;
  /** Current status. */
  status: ToolStatus;
}

const STATUS_META: Record<
  ToolStatus,
  { label: string; icon: React.ReactNode; badge: string }
> = {
  pending: {
    label: 'Pending',
    icon: <CircleDashed className="size-3" />,
    badge: 'bg-muted text-muted-foreground',
  },
  running: {
    label: 'Running',
    icon: <Loader2 className="size-3 animate-spin" />,
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  streaming: {
    label: 'Streaming',
    icon: <Loader2 className="size-3 animate-spin" />,
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="size-3" />,
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  error: {
    label: 'Error',
    icon: <AlertCircle className="size-3" />,
    badge: 'bg-destructive/15 text-destructive',
  },
};

/** Props for {@link Tool}. */
export interface ToolProps extends React.ComponentProps<'div'> {
  /** Default-expanded. @default false */
  defaultOpen?: boolean;
}

const ToolOpenContext = React.createContext(false);

/** A single tool invocation card. */
export function Tool({
  defaultOpen = false,
  className,
  children,
  ...props
}: ToolProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <ToolOpenContext.Provider value={open}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        data-slot="tool"
        className={cn('rounded-lg border border-border bg-card text-sm', className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ToolOpenContext.Provider>
  );
}

/** Props for {@link ToolHeader}. */
export interface ToolHeaderProps extends React.ComponentProps<'button'> {
  /** Tool name. */
  name: string;
  /** Current status. */
  status: ToolStatus;
}

/** The status-aware tool header (also the collapsible trigger). */
export function ToolHeader({
  name,
  status,
  className,
  ...props
}: ToolHeaderProps) {
  const open = React.useContext(ToolOpenContext);
  const meta = STATUS_META[status];
  return (
    <CollapsibleTrigger
      data-slot="tool-header"
      data-status={status}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left',
        className,
      )}
      {...props}
    >
      <Wrench className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-medium text-foreground">{name}</span>
      <Badge className={cn('ml-2 shrink-0 gap-1', meta.badge)}>
        {meta.icon}
        {meta.label}
      </Badge>
      <ChevronDown
        className={cn(
          'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-180',
        )}
      />
    </CollapsibleTrigger>
  );
}

/** Props for {@link ToolContent}. */
export type ToolContentProps = React.ComponentProps<'div'>;

/** The expandable tool body (host `ToolInput`/`ToolOutput`). */
export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent data-slot="tool-content">
      <div className={cn('space-y-2 px-3 pb-3', className)} {...props} />
    </CollapsibleContent>
  );
}

/** A labeled JSON block (shared by input/output). */
function JsonBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: unknown;
  tone?: 'error';
}) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        className={cn(
          'overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs',
          tone === 'error' && 'border-destructive/40 text-destructive',
        )}
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** Props for {@link ToolInput}. */
export interface ToolInputProps {
  /** The tool's input/args object. */
  input: unknown;
}

/** Expandable JSON input/params view. */
export function ToolInput({ input }: ToolInputProps) {
  return (
    <div data-slot="tool-input">
      <JsonBlock label="Parameters" value={input} />
    </div>
  );
}

/** Props for {@link ToolOutput}. */
export interface ToolOutputProps {
  /** The tool's output/result. */
  output?: unknown;
  /** An error message, if the call failed. */
  error?: string;
}

/** Output (or error) view. */
export function ToolOutput({ output, error }: ToolOutputProps) {
  return (
    <div data-slot="tool-output">
      {error != null ? (
        <JsonBlock label="Error" value={error} tone="error" />
      ) : (
        <JsonBlock label="Result" value={output} />
      )}
    </div>
  );
}

/** Props for {@link ToolFallback}. */
export interface ToolFallbackProps {
  /** The tool call to render generically. */
  call: ToolCall;
  /** Default-expanded. @default false */
  defaultOpen?: boolean;
}

/** Generic name/args/result card for tools without a registered renderer. */
export function ToolFallback({ call, defaultOpen }: ToolFallbackProps) {
  return (
    <Tool defaultOpen={defaultOpen}>
      <ToolHeader name={call.name} status={call.status} />
      <ToolContent>
        {call.input != null && <ToolInput input={call.input} />}
        {(call.output != null || call.error != null) && (
          <ToolOutput output={call.output} error={call.error} />
        )}
      </ToolContent>
    </Tool>
  );
}

/** A renderer for a specific tool name. */
export type ToolRenderer = (call: ToolCall) => React.ReactNode;
/** Map of tool name → renderer. */
export type ToolRendererRegistry = Record<string, ToolRenderer>;

/** Props for {@link ToolView}. */
export interface ToolViewProps {
  /** The tool call. */
  call: ToolCall;
  /** Optional per-tool renderer registry; falls back to the generic view. */
  registry?: ToolRendererRegistry;
}

/**
 * Render a tool call via its registered renderer, or `ToolFallback` if none.
 */
export function ToolView({ call, registry }: ToolViewProps) {
  const renderer = registry?.[call.name];
  if (renderer) return <>{renderer(call)}</>;
  return <ToolFallback call={call} />;
}

/** Props for {@link ToolGroup}. */
export interface ToolGroupProps extends React.ComponentProps<'div'> {
  /** Consecutive tool calls to collapse behind a stacked summary. */
  calls: ToolCall[];
  /** Optional per-tool renderer registry. */
  registry?: ToolRendererRegistry;
  /** Default-expanded. @default false */
  defaultOpen?: boolean;
}

/** Collapses consecutive tool calls behind a stacked-icon summary. */
export function ToolGroup({
  calls,
  registry,
  defaultOpen = false,
  className,
  ...props
}: ToolGroupProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="tool-group"
      className={cn('rounded-lg border border-border bg-card', className)}
      {...props}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex -space-x-1.5">
          {calls.slice(0, 3).map((_, i) => (
            <span
              key={i}
              className="flex size-6 items-center justify-center rounded-full border border-border bg-muted"
            >
              <Wrench className="size-3 text-muted-foreground" />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {calls.length} tool {calls.length === 1 ? 'call' : 'calls'}
        </span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 rounded-b-lg border-t border-border bg-muted/30 p-2">
          {calls.map((call, i) => (
            <ToolView key={i} call={call} registry={registry} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
