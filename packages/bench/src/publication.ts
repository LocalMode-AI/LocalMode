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
import { CONTROL_CHARACTERS, REPORTED_GPU_MAX_LENGTH } from './validate.js';

const CONTROL_CHARACTERS_GLOBAL = new RegExp(CONTROL_CHARACTERS.source, 'g');

/**
 * Word-like parts of GPU and CPU product names that a hyphenated, uppercase
 * token may start with (`GTX-1080TI`, `RX-7900XT`). A token with one of these
 * prefixes is kept by the generic computer-name rule.
 */
const PRODUCT_NAME_PREFIXES = new Set([
  'AMD', 'APPLE', 'ARC', 'ADRENO', 'FIREPRO', 'GEFORCE', 'GT', 'GTS', 'GTX', 'HD', 'INTEL', 'IRIS', 'MALI',
  'MX', 'NVIDIA', 'NVS', 'PRO', 'QUADRO', 'RADEON', 'RTX', 'RX', 'TESLA', 'TITAN', 'UHD', 'VEGA', 'WX', 'XE',
]);

/** A URL with a scheme, or a bare `www.` host. */
const URL_PATTERN = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi;

/**
 * An email address. The domain must end in a letter-only label of two or more
 * characters, so a clock speed typed as `i7@3.4GHz` is not one.
 */
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

/**
 * The names Windows gives a computer at setup: `DESKTOP-` or `LAPTOP-` and
 * seven characters, `WIN-` and eleven. Matched even when glued to the text
 * before it (`2.7DESKTOP-A1B2C3D`), but not inside a longer word.
 */
const WINDOWS_DEFAULT_NAME = /(?<![a-z])(?:DESKTOP|LAPTOP)-[a-z0-9]{5,}\b|(?<![a-z])WIN-[a-z0-9]{8,}\b/gi;

/** Any other uppercase `NAME-XXXXX` token, the shape of a renamed computer. */
const GENERIC_COMPUTER_NAME = /\b([A-Z]{2,})-([A-Z0-9]{5,})\b/g;

/** True when `text` holds both a letter and a digit. */
function mixesLettersAndDigits(text: string): boolean {
  return /[a-z]/i.test(text) && /[0-9]/.test(text);
}

/**
 * Remove what identifies a person or a computer rather than the hardware:
 * URLs, email addresses, Windows computer names (`DESKTOP-A1B2C3D`,
 * `LAPTOP-AB12CD3`, `WIN-ABCDEFGH123`) and any other uppercase
 * `NAME-XXXXX` token whose suffix mixes letters and digits. A lowercase or
 * all-letter suffix after `DESKTOP-`/`LAPTOP-`/`WIN-` is kept unless it is all
 * uppercase, so ordinary words survive; a generic token whose prefix is a
 * product-name word (`GTX-1080TI`) is kept. Brackets a removal leaves
 * empty go too.
 */
function removeIdentifiers(value: string): string {
  return value
    .replace(URL_PATTERN, ' ')
    .replace(EMAIL_PATTERN, ' ')
    .replace(WINDOWS_DEFAULT_NAME, (match) => {
      const suffix = match.slice(match.indexOf('-') + 1);
      return mixesLettersAndDigits(suffix) || suffix === suffix.toUpperCase() ? ' ' : match;
    })
    .replace(GENERIC_COMPUTER_NAME, (match, prefix: string, suffix: string) =>
      !PRODUCT_NAME_PREFIXES.has(prefix) && mixesLettersAndDigits(suffix) ? ' ' : match,
    )
    // Brackets left empty by a removal.
    .replace(/\(\s*\)|\[\s*\]/g, ' ');
}

/**
 * Normalize a self-reported GPU name for publication: control characters
 * removed; URLs, email addresses and computer names removed (a participant
 * may paste the Windows "Device name" beside the processor); every run of
 * whitespace collapsed to one space; trimmed; and cut to
 * `REPORTED_GPU_MAX_LENGTH` characters (then trimmed again). The page applies
 * it before a run file is assembled and the submit route applies it again
 * before publication.
 *
 * @param value - The name as typed or as submitted.
 * @returns The normalized name; an empty string when nothing printable remains.
 * @example
 * sanitizeReportedGpu('  NVIDIA   GeForce RTX 4060 '); // 'NVIDIA GeForce RTX 4060'
 * sanitizeReportedGpu('Intel UHD 630 DESKTOP-A1B2C3D'); // 'Intel UHD 630'
 */
export function sanitizeReportedGpu(value: string): string {
  return removeIdentifiers(value.replace(CONTROL_CHARACTERS_GLOBAL, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REPORTED_GPU_MAX_LENGTH)
    .trim();
}

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
 * time-to-full (they track a device); and the display preferences. A
 * self-reported GPU name (`environment.userReportedHardware.gpu`) is
 * normalized with `sanitizeReportedGpu`. A run that already lacks those
 * fields and carries a normalized name is returned unchanged
 * (`changed: false`).
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

  if (env.userReportedHardware && typeof env.userReportedHardware === 'object') {
    const hardware = { ...(env.userReportedHardware as Record<string, unknown>) };
    if (typeof hardware.gpu === 'string') {
      const gpu = sanitizeReportedGpu(hardware.gpu);
      if (gpu !== hardware.gpu) {
        hardware.gpu = gpu;
        removed.push('environment.userReportedHardware.gpu (normalized)');
      }
    }
    env.userReportedHardware = hardware;
  }

  const changed = removed.some((path) => path !== 'nonce');
  if (changed && out.schemaVersion < BENCH_SCHEMA_VERSION) {
    out.schemaVersion = BENCH_SCHEMA_VERSION;
    removed.push('schemaVersion (raised)');
  }

  return { run: out, changed, removed };
}
