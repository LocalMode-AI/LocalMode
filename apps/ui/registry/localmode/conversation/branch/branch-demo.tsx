'use client';

/**
 * @file branch-demo.tsx
 * @description Docs preview for `Branch`. Pages between three regenerated
 * assistant variants for one turn with a "X of N" indicator.
 */
import {
  Branch,
  BranchMessages,
  BranchNext,
  BranchPage,
  BranchPrevious,
  BranchSelector,
} from './branch';

const VARIANTS = [
  'Local-first AI runs models in your browser - no servers.',
  'It means the model executes on-device, so your data never leaves the machine.',
  'Think of it as offline-capable AI: download once, then run with zero network.',
];

export default function BranchDemo() {
  return (
    <div className="w-full max-w-lg">
      <Branch count={VARIANTS.length}>
        <BranchMessages>
          {VARIANTS.map((text, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground"
            >
              {text}
            </div>
          ))}
        </BranchMessages>
        <BranchSelector>
          <BranchPrevious />
          <BranchPage />
          <BranchNext />
        </BranchSelector>
      </Branch>
    </div>
  );
}
