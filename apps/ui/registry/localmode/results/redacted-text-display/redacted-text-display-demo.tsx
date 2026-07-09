'use client';

import { RedactedTextDisplay } from './redacted-text-display';

const TEXT =
  'Ada Lovelace worked with Charles Babbage on the Analytical Engine in London.';

// Offsets computed against TEXT.
const ENTITIES = [
  { text: 'Ada Lovelace', type: 'PER', start: 0, end: 12, score: 0.99 },
  { text: 'Charles Babbage', type: 'PER', start: 25, end: 40, score: 0.98 },
  { text: 'Analytical Engine', type: 'MISC', start: 48, end: 65, score: 0.82 },
  { text: 'London', type: 'LOC', start: 69, end: 75, score: 0.97 },
];

/**
 * Demo for the RedactedTextDisplay component, used by the docs live preview.
 * Renders inline color-coded redaction tokens from a sample NER result.
 * Fully local.
 */
export default function RedactedTextDisplayDemo() {
  return (
    <div className="max-w-xl">
      <RedactedTextDisplay text={TEXT} entities={ENTITIES} />
    </div>
  );
}
