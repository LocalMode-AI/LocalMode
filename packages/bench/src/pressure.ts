/**
 * Compute Pressure summary of a run: how much of the suite's wall time the
 * CPU spent in each pressure state, from the `pressure-change` trace events
 * the runner records (one event per state transition the `PressureObserver`
 * reported, with the new state in `detail`).
 */

import type { TraceEvent } from './types.js';

/** The four Compute Pressure API states. */
export type PressureState = 'nominal' | 'fair' | 'serious' | 'critical';

const PRESSURE_STATES: readonly PressureState[] = ['nominal', 'fair', 'serious', 'critical'];

/** Result of {@link pressureStateFractions}. */
export interface PressureStateSummary {
  /** Number of `pressure-change` events in the run (0 when the browser has no Compute Pressure API). */
  samples: number;
  /**
   * Fraction of the suite wall time (`suite-end` minus `suite-start`) spent
   * in each state. Time before the first known state is in no state, so the
   * fractions sum to less than 1 when the first sample arrived after the
   * suite started. Null when the run has no sample or no complete suite span.
   */
  fractions: Record<PressureState, number> | null;
}

/**
 * Fractions of the suite wall time spent in each Compute Pressure state.
 *
 * The state at `suite-start` is the last `pressure-change` at or before it
 * (the observer attaches before the suite starts); each later change inside
 * the suite switches the state until the next change or `suite-end`. A state
 * name outside the four API states counts toward none of them.
 *
 * @param events - The run's trace events (`BenchRunResult.events`), any order.
 * @returns The sample count and the per-state fractions (null when not computable).
 * @example
 * const { fractions } = pressureStateFractions(run.events);
 * const excluded = (fractions?.critical ?? 0) > 0.05;
 * @see runsToRunsCSV
 */
export function pressureStateFractions(events: readonly TraceEvent[]): PressureStateSummary {
  const changes = events.filter((e) => e.type === 'pressure-change').sort((a, b) => a.t - b.t);
  const start = events.find((e) => e.type === 'suite-start')?.t;
  const end = [...events].reverse().find((e) => e.type === 'suite-end')?.t;
  const samples = changes.length;
  if (samples === 0 || start === undefined || end === undefined || !(end > start)) {
    return { samples, fractions: null };
  }

  const spent: Record<PressureState, number> = { nominal: 0, fair: 0, serious: 0, critical: 0 };
  let state: string | undefined;
  let cursor = start;
  const credit = (until: number) => {
    if (state !== undefined && (PRESSURE_STATES as readonly string[]).includes(state)) {
      spent[state as PressureState] += until - cursor;
    }
    cursor = until;
  };
  for (const change of changes) {
    if (change.t <= start) {
      state = change.detail;
      continue;
    }
    if (change.t >= end) break;
    credit(change.t);
    state = change.detail;
  }
  credit(end);

  const span = end - start;
  return {
    samples,
    fractions: {
      nominal: spent.nominal / span,
      fair: spent.fair / span,
      serious: spent.serious / span,
      critical: spent.critical / span,
    },
  };
}
