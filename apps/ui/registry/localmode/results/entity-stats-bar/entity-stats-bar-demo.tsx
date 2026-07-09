'use client';

import { EntityStatsBar } from './entity-stats-bar';

const ENTITIES = [
  { text: 'Ada Lovelace', type: 'PER', score: 0.99 },
  { text: 'Charles Babbage', type: 'PER', score: 0.98 },
  { text: 'London', type: 'LOC', score: 0.97 },
  { text: 'Analytical Engine', type: 'MISC', score: 0.81 },
  { text: 'Royal Society', type: 'ORG', score: 0.9 },
  { text: 'Cambridge', type: 'LOC', score: 0.95 },
];

/**
 * Demo for the EntityStatsBar component, used by the docs live preview.
 * Renders a total + per-type breakdown from a sample NER result. Fully local.
 */
export default function EntityStatsBarDemo() {
  return (
    <div className="max-w-xl space-y-3">
      <EntityStatsBar entities={ENTITIES} />
      {/* Non-NER consumer: relabel the total noun via `itemNoun`. */}
      <EntityStatsBar
        counts={{ POSITIVE: 3, NEGATIVE: 3 }}
        registry={{
          POSITIVE: { label: 'Positive', color: 'var(--color-emerald-500, #10b981)' },
          NEGATIVE: { label: 'Negative', color: 'var(--color-rose-500, #f43f5e)' },
        }}
        itemNoun="result"
      />
    </div>
  );
}
