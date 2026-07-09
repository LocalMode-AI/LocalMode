'use client';

import {
  Context,
  ContextContent,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
  ContextUsageMeter,
} from './context-usage-meter';

/**
 * Demo for ContextUsageMeter and its compound parts. Shows a near-limit warning
 * meter and the composable Context/Trigger/Content breakdown. No cost field —
 * local models have no billing.
 */
export default function ContextUsageMeterDemo() {
  const usage = {
    inputTokens: 5800,
    outputTokens: 900,
    reasoningTokens: 400,
    cachedTokens: 2048,
  };

  return (
    <div className="flex flex-col gap-5">
      <ContextUsageMeter {...usage} contextWindow={8192} />
      <Context usage={usage} contextWindow={8192}>
        <ContextTrigger />
        <ContextContent>
          <ContextInputUsage />
          <ContextOutputUsage />
        </ContextContent>
      </Context>
    </div>
  );
}
