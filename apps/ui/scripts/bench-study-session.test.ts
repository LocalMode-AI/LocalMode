/**
 * The paid-study session reader behind /bench/run: the participant id is
 * hashed (first 12 hex digits of SHA-256, checked here against Node's own
 * crypto as an independent witness), the completion code must be 4 to 32
 * letters or digits, and neither parameter order nor extra parameters (the
 * run presets, Prolific's STUDY_ID and SESSION_ID) change the result.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseStudySession } from '../src/lib/bench/study-session';
import type { StudyEligibility } from '../src/lib/bench/study-eligibility';

const ELIGIBLE: StudyEligibility = { eligible: true };
const WEBKIT: StudyEligibility = { eligible: false, reason: 'webkit' };

function pidHash(pid: string): string {
  return createHash('sha256').update(pid, 'utf8').digest('hex').slice(0, 12);
}

describe('parseStudySession', () => {
  it('reads the PID hash and the completion code', async () => {
    const session = await parseStudySession('?PROLIFIC_PID=5f3a1c2b4d6e7f8091a2b3c4&cc=TESTCODE1', ELIGIBLE);
    expect(session).toEqual({
      participantHash: pidHash('5f3a1c2b4d6e7f8091a2b3c4'),
      completionCode: 'TESTCODE1',
      eligibility: ELIGIBLE,
    });
    expect(session?.participantHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('carries the eligibility it is given', async () => {
    const session = await parseStudySession('PROLIFIC_PID=e2e-test-pid&cc=TESTCODE1', WEBKIT);
    expect(session?.eligibility).toEqual(WEBKIT);
  });

  it('reads a PID without cc as a session with no completion code', async () => {
    expect(await parseStudySession('?PROLIFIC_PID=e2e-test-pid', ELIGIBLE)).toEqual({
      participantHash: pidHash('e2e-test-pid'),
      completionCode: null,
      eligibility: ELIGIBLE,
    });
  });

  it('returns null for cc without a PID, and for an empty or blank PID', async () => {
    expect(await parseStudySession('?cc=TESTCODE1', ELIGIBLE)).toBeNull();
    expect(await parseStudySession('?PROLIFIC_PID=&cc=TESTCODE1', ELIGIBLE)).toBeNull();
    expect(await parseStudySession('?PROLIFIC_PID=%20%20&cc=TESTCODE1', ELIGIBLE)).toBeNull();
    expect(await parseStudySession('', ELIGIBLE)).toBeNull();
  });

  it('hashes the PID only: order, presets, STUDY_ID and SESSION_ID change nothing', async () => {
    const plain = await parseStudySession('?PROLIFIC_PID=e2e-test-pid&cc=TESTCODE1', ELIGIBLE);
    const full = await parseStudySession(
      '?tier=quick&quality=off&runs=1&cold=off&publish=on&cc=TESTCODE1&PROLIFIC_PID=e2e-test-pid&STUDY_ID=e2e-study&SESSION_ID=e2e-session',
      ELIGIBLE,
    );
    expect(full).toEqual(plain);
    expect(full?.participantHash).toBe(pidHash('e2e-test-pid'));
  });

  it('trims the PID and the code before use', async () => {
    const session = await parseStudySession('?PROLIFIC_PID=%20e2e-test-pid%20&cc=%20TESTCODE1%20', ELIGIBLE);
    expect(session?.participantHash).toBe(pidHash('e2e-test-pid'));
    expect(session?.completionCode).toBe('TESTCODE1');
  });

  it('drops a code that is not 4 to 32 letters or digits', async () => {
    for (const cc of ['ABC', 'A'.repeat(33), 'TEST-CODE', 'TEST%20CODE', '%3Cscript%3E', 'C%C3%93DE1']) {
      const session = await parseStudySession(`?PROLIFIC_PID=e2e-test-pid&cc=${cc}`, ELIGIBLE);
      expect(session?.completionCode, cc).toBeNull();
      expect(session?.participantHash).toBe(pidHash('e2e-test-pid'));
    }
    expect((await parseStudySession(`?PROLIFIC_PID=p&cc=${'A'.repeat(32)}`, ELIGIBLE))?.completionCode).toBe('A'.repeat(32));
    expect((await parseStudySession('?PROLIFIC_PID=p&cc=AB12', ELIGIBLE))?.completionCode).toBe('AB12');
  });
});
