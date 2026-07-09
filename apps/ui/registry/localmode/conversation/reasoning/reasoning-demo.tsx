'use client';

/**
 * @file reasoning-demo.tsx
 * @description Docs preview for `Reasoning`. Interactive: a Replay button drives
 * a simulated stream of think-tokens that auto-expands the block and runs the
 * elapsed timer, then auto-collapses on completion. The trigger can be clicked
 * to toggle open/closed at any time. Below, a compact `ThinkingBar` mirrors the
 * same simulated "thinking" run — its inline stop/expand controls only appear
 * while thinking is active and both are wired to do something real.
 */
import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  ThinkingBar,
} from './reasoning';

const THOUGHTS = `The user asks about offline support.
Recall: models are cached on-device after first download.
Therefore subsequent runs work with no network.
Compose a concise answer.`;

export default function ReasoningDemo() {
  const [text, setText] = React.useState(THOUGHTS);
  const [streaming, setStreaming] = React.useState(false);
  /** Live elapsed time for the compact ThinkingBar (the block runs its own). */
  const [elapsedMs, setElapsedMs] = React.useState(0);
  /** Manual open override for the ThinkingBar's `expand` control. */
  const [barOpen, setBarOpen] = React.useState(false);
  const [runId, setRunId] = React.useState(0);
  const intervalRef = React.useRef<number | null>(null);
  const clockRef = React.useRef<number | null>(null);

  function clearTimers() {
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    if (clockRef.current != null) window.clearInterval(clockRef.current);
    intervalRef.current = null;
    clockRef.current = null;
  }

  /** Drive a fresh simulated stream of think-tokens. */
  function play() {
    clearTimers();
    setBarOpen(false);
    setText('');
    setElapsedMs(0);
    setStreaming(true);

    // Live elapsed clock, mirrors the block's internal timer.
    const start = performance.now();
    clockRef.current = window.setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 200);

    let i = 0;
    const id = window.setInterval(() => {
      i += 4;
      setText(THOUGHTS.slice(0, i));
      if (i >= THOUGHTS.length) {
        window.clearInterval(id);
        intervalRef.current = null;
        // Brief settle, then "answer arrives" → auto-collapse.
        window.setTimeout(() => {
          if (clockRef.current != null) window.clearInterval(clockRef.current);
          clockRef.current = null;
          setStreaming(false);
        }, 600);
      }
    }, 60);
    intervalRef.current = id;
    setRunId((n) => n + 1);
  }

  /** Stop the simulated thinking immediately. */
  function stop() {
    clearTimers();
    setStreaming(false);
  }

  // Run once on mount so the preview opens in a finished, collapsed state, then
  // immediately replay so the streaming behavior is visible.
  React.useEffect(() => {
    play();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={play}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {streaming ? 'Replaying…' : 'Replay'}
        </button>
        <span className="text-xs text-muted-foreground">
          {streaming ? 'Streaming think-tokens - block auto-expands' : 'Idle - block auto-collapsed'}
        </span>
      </div>

      {/* Free-text reasoning tier: auto-expands while streaming, click to toggle. */}
      <Reasoning streaming={streaming}>
        <ReasoningTrigger />
        <ReasoningContent>{text}</ReasoningContent>
      </Reasoning>

      {/* Compact tier: shares the same simulated run. Stop/expand are only
          offered while thinking, and both are wired to real handlers. */}
      <div className="flex flex-col gap-2">
        <ThinkingBar
          key={runId}
          label={streaming ? 'Thinking' : 'Done thinking'}
          elapsedMs={elapsedMs}
          onStop={streaming ? stop : undefined}
          onExpand={streaming ? () => setBarOpen(true) : undefined}
        />
        {barOpen && (
          <Reasoning open onOpenChange={setBarOpen}>
            <ReasoningTrigger label="Live reasoning" />
            <ReasoningContent>{text}</ReasoningContent>
          </Reasoning>
        )}
      </div>
    </div>
  );
}
