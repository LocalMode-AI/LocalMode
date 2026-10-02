/**
 * Paid-study session read from a /bench/run query string
 * (`?PROLIFIC_PID=<id>&cc=<code>`). Parameter order does not matter, and any
 * other parameter (the run presets, Prolific's `STUDY_ID` and `SESSION_ID`)
 * is ignored here. The participant id is never stored or published as-is:
 * the run carries the first 12 hex digits of the SHA-256 of the trimmed id,
 * so a payment can be verified against a dataset row without the dataset
 * revealing who ran it.
 */
import type { StudyEligibility } from './study-eligibility';

export interface StudySession {
  /** First 12 hex digits of SHA-256 over the UTF-8 bytes of the trimmed `PROLIFIC_PID`. */
  participantHash: string;
  /** The `cc` value when it is 4 to 32 ASCII letters or digits, otherwise null. */
  completionCode: string | null;
  /** Whether this browser may take part in the paid study. */
  eligibility: StudyEligibility;
}

const COMPLETION_CODE = /^[A-Za-z0-9]{4,32}$/;

/**
 * Read the completion code of a paid-study link without hashing anything:
 * the `cc` value when the query also has a non-empty `PROLIFIC_PID` and the
 * code is 4 to 32 ASCII letters or digits, otherwise null.
 *
 * @param search - The query string, with or without the leading `?`.
 * @returns The completion code, or null.
 * @example
 * readStudyCompletionCode('?PROLIFIC_PID=abc&cc=TESTCODE1'); // 'TESTCODE1'
 */
export function readStudyCompletionCode(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get('PROLIFIC_PID')?.trim()) return null;
  const code = params.get('cc')?.trim() || null;
  return code && COMPLETION_CODE.test(code) ? code : null;
}

/**
 * Read the study session from a query string.
 *
 * @param search - The query string, with or without the leading `?`.
 * @param eligibility - The browser's study eligibility, carried on the session.
 * @returns The session, or null when the query has no non-empty `PROLIFIC_PID`.
 * @example
 * const session = await parseStudySession(window.location.search, readStudyEligibility());
 */
export async function parseStudySession(search: string, eligibility: StudyEligibility): Promise<StudySession | null> {
  const params = new URLSearchParams(search);
  const pid = params.get('PROLIFIC_PID')?.trim();
  if (!pid) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return {
    participantHash: hex.slice(0, 12),
    completionCode: readStudyCompletionCode(search),
    eligibility,
  };
}
