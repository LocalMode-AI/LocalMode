/**
 * Clause Splitter Benchmark
 *
 * Track regressions in the splitter on a representative 500-character
 * LLM-style input.
 *
 * @packageDocumentation
 */

import { bench } from 'vitest';
import { splitIntoClauses } from '../src/audio/clause-splitter.js';

bench(
  'splitIntoClauses on 500-character LLM-style input',
  () => {
    const text =
      'Sure! Here is a quick summary: First, we boot the WASM runtime; second, we load the ' +
      'embedding model from IndexedDB; third, we run the user query through the model. The ' +
      'query embedding is then compared against the stored vectors using cosine similarity. ' +
      'Top results are returned to the caller. If you want, I can also walk through the chunking ' +
      'strategy, e.g. recursive vs. semantic, and explain when each one is appropriate.';
    splitIntoClauses(text);
  },
  { time: 200 }
);
