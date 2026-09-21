/**
 * The publication scrub: what a run file may carry once it is public. The
 * environment capture no longer reads these signals (schema 3), so on a
 * fresh submission the scrub changes nothing; it exists for submissions from
 * pages built before the change and for rewriting files published earlier.
 * The digest is the caller's job (`computeRunDigest`), because a scrub that
 * changed anything invalidates the digest the client computed.
 */

import type { BenchRunResult } from './types.js';
import { BENCH_SCHEMA_VERSION } from './types.js';
import { coarseBatteryLevel } from './env.js';

/** What the scrub did to a run. */
export interface PublicationScrub {
  run: BenchRunResult;
  /**
   * True when a digested field was removed or coarsened, so the client's
   * digest no longer applies and must be recomputed. Stripping the nonce
   * alone does not count: the digest never covers it.
   */
  changed: boolean;
  /** Dotted paths of the fields removed or coarsened, for the audit trail. */
  removed: string[];
}

/**
 * Return a copy of `run` with the fields a public file must not carry
 * removed: the submission nonce; the time zone, UTC offset, and calendar
 * (they locate a device); the language list; the battery's exact level and
 * time-to-full (they track a device); and the display preferences. A run
 * that already lacks them is returned unchanged (`changed: false`).
 */
export function scrubRunForPublication(run: BenchRunResult): PublicationScrub {
  const removed: string[] = [];
  const out: BenchRunResult = { ...run, environment: { ...run.environment } };

  if ('nonce' in out) {
    delete out.nonce;
    removed.push('nonce');
  }

  const env = out.environment as unknown as Record<string, unknown>;

  if (env.locale && typeof env.locale === 'object') {
    const locale = { ...(env.locale as Record<string, unknown>) };
    for (const key of ['timeZone', 'timeZoneOffsetMinutes', 'calendar']) {
      if (key in locale) {
        delete locale[key];
        removed.push(`environment.locale.${key}`);
      }
    }
    env.locale = locale;
  }

  if ('languages' in env) {
    delete env.languages;
    removed.push('environment.languages');
  }

  if (env.power && typeof env.power === 'object') {
    const power = { ...(env.power as Record<string, unknown>) };
    for (const key of ['chargingTimeSec', 'dischargingTimeSec']) {
      if (key in power) {
        delete power[key];
        removed.push(`environment.power.${key}`);
      }
    }
    if (typeof power.level === 'number') {
      const coarse = coarseBatteryLevel(power.level);
      if (coarse !== power.level) {
        power.level = coarse;
        removed.push('environment.power.level (coarsened)');
      }
    }
    env.power = power;
  }

  if (env.display && typeof env.display === 'object') {
    const display = { ...(env.display as Record<string, unknown>) };
    for (const key of ['prefersReducedMotion', 'prefersColorScheme']) {
      if (key in display) {
        delete display[key];
        removed.push(`environment.display.${key}`);
      }
    }
    env.display = display;
  }

  const changed = removed.some((path) => path !== 'nonce');
  if (changed && out.schemaVersion < BENCH_SCHEMA_VERSION) {
    out.schemaVersion = BENCH_SCHEMA_VERSION;
    removed.push('schemaVersion (raised)');
  }

  return { run: out, changed, removed };
}
