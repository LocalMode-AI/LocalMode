/**
 * @file audio-blocks.spec.ts
 * @description E2E for the five split `audio` blocks (split-audio-studio Wave 3)
 * — the successor to the dissolved audio-studio.spec.ts. Drives the five
 * single-block routes /blocks/audio/{voice-notes,live-transcription,
 * meeting-assistant,voice-explorer,audiobook-reader} (+ the /blocks/audio
 * category page) via accessibility-grade selectors ONLY (getByRole / getByLabel
 * / getByText — no `data-testid`), with REAL model downloads and REAL inference
 * — no mocked model boundary. Every lane's assertions are preserved verbatim
 * from the pre-split audio-studio.spec.ts; the block's raw machine state is
 * still asserted through non-testid `data-*` hooks (data-status, data-state,
 * data-priority, data-count, data-ready, data-voice, data-synthesizing,
 * data-playing, data-top-label) once the element is located by its role/name.
 * The
 * audio-classifier block keeps its own audio.spec.ts (MediaPipe allowlist);
 * this file's console-error allowlist is intentionally EMPTY.
 *
 * Lanes:
 * 1. redirects        — /blocks/audio-studio and /blocks/voice both 308 to
 *                       /blocks/audio (zero models); category page mounts every
 *                       block gated and downloads nothing on load.
 * 2. voice-notes      — record fake-mic speech → REAL Whisper tiny transcription
 *                       (containment) → synced transcript → upload a second
 *                       fixture note → REAL bge-small semantic search ranks the
 *                       right note first → delete leaves the index.
 * 3. live-transcription — the fixture feeds REAL getUserMedia → energy VAD →
 *                       chunker → Whisper streaming; a finalized utterance must
 *                       contain fixture words; stop releases the session.
 * 4. meeting-assistant — mid-pipeline cancel FIRST (during the cold DistilBART
 *                       download inside Summarize — the only deterministically
 *                       observable in-flight window), then the full paste path →
 *                       REAL DistilBART summary (on-topic) → REAL Granite 4.0
 *                       350M structured action items (priority + toggle + export
 *                       .txt), then the audio path on the meeting fixture.
 * 5. voice-explorer   — REAL Kokoro preview (playable duration), A/B comparison
 *                       with two different voices (af_heart vs bm_george).
 * 6. audiobook-reader — the one-shot synthesis scenario, then streaming
 *                       synthesis with early-playback overlap, pause/resume/stop,
 *                       and a non-trivial WAV download (audio-{voiceId}-{ts}.wav).
 *
 * REAL: no model boundary is mocked — every lane downloads real models from
 * HuggingFace on a cold cache and runs real inference.
 *
 * GAP (documented, per design AD8): the "microphone" audio comes from Chromium's
 * fake capture file (`--use-file-for-fake-audio-capture`), not physical
 * hardware — the full `getUserMedia → (VAD) → recorder/chunker → Whisper` path
 * IS exercised, but real device enumeration/permission UX and analog capture
 * quality are NOT. That gap is closed by the mandatory MANUAL real-microphone
 * hardware sweep (task 8.5). Turn-taking mode and the Silero VAD download are
 * likewise manual-sweep surfaces — they need interactive conversational timing
 * the looping fixture cannot provide deterministically.
 *
 * Fixtures (see e2e/fixtures/README.md):
 * - voice-fixture.wav      — "The quick brown fox jumps over the lazy dog"
 * - meeting-fixture.wav    — "We must finish the budget report by Friday. …"
 * - meeting-transcript.txt — deterministic budget-meeting transcript with
 *   blatant commitments for the summary/action-item assertions.
 *
 * Console/pageerror policy: every message from the page is captured from test
 * start and attached; ANY console error or uncaught page error fails the test.
 * The allowlist is intentionally empty.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test, type Page, type Request } from '@playwright/test';

/** Absolute path to the spoken-speech WAV fed to Chromium's fake mic. */
const FIXTURE_WAV = path.resolve(__dirname, '../fixtures/voice-fixture.wav');
/** Meeting audio fixture (uploaded, not fed through the fake mic). */
const MEETING_WAV = path.resolve(__dirname, '../fixtures/meeting-fixture.wav');
/** Deterministic meeting transcript for the paste path. */
const MEETING_TRANSCRIPT = fs
  .readFileSync(path.resolve(__dirname, '../fixtures/meeting-transcript.txt'), 'utf8')
  .trim();

/** Screenshot destination shared with the rest of the harness's artifacts. */
const ARTIFACTS_DIR = path.resolve(__dirname, '../../e2e-artifacts');

/** Canonical split-block routes. */
const ROUTES = {
  voiceNotes: '/blocks/audio/voice-notes',
  liveTranscription: '/blocks/audio/live-transcription',
  meetingAssistant: '/blocks/audio/meeting-assistant',
  voiceExplorer: '/blocks/audio/voice-explorer',
  audiobookReader: '/blocks/audio/audiobook-reader',
} as const;

/**
 * Cold-cache ceiling for steps that trigger a real model download (Whisper
 * tiny ~40MB, bge-small ~34MB, DistilBART ~200MB, Granite 350M ~120MB,
 * Kokoro ~90MB) plus inference. Warm runs finish in seconds.
 */
const COLD_MODEL_TIMEOUT_MS = 8 * 60 * 1000;

/**
 * Words the Whisper transcript of voice-fixture.wav must contain (lowercased
 * containment). Whisper tiny on synthetic speech is imperfect, so requiring at
 * least TWO of these five distinctive words proves real speech recognition ran
 * without being brittle about individual word errors.
 */
const VOICE_WORDS = ['quick', 'brown', 'fox', 'lazy', 'dog'] as const;
/** Same containment contract for meeting-fixture.wav. */
const MEETING_WORDS = ['budget', 'report', 'friday', 'schedule', 'client', 'meeting'] as const;
/** The DistilBART summary of the fixture transcript must mention ≥1 of these. */
const MEETING_TOPIC_WORDS = ['budget', 'quarter', 'report', 'meeting', 'finance', 'marketing'] as const;
const MIN_CONTAINMENT_MATCHES = 2;

function countMatches(text: string, words: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w));
}

/** Hosts / asset patterns that indicate a model (or model asset) download. */
const MODEL_HOST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /\.onnx(\?|$)/i,
  /storage\.googleapis\.com\/mediapipe/i,
  /\.tflite(\?|$)/i,
  /\.task(\?|$)/i,
  /\.wasm(\?|$)/i,
];

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_HOST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

// `test.use({ launchOptions })` REPLACES the config's launchOptions rather than
// merging args, so the two fake-media flags from playwright.config.ts are copied
// here alongside the fixture feed. Chromium loops the WAV for the lifetime of
// the fake capture stream. All lanes share ONE fixture (voice-fixture.wav) — the
// notes/live lanes drive the fake mic with it; the others never touch the mic —
// so a single spec file suffices (no per-block launchOptions conflict).
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${FIXTURE_WAV}`,
    ],
  },
});

// Serial: the lanes trigger multi-minute model downloads and share the one
// dev/start server; keep them ordered in a single worker.
test.describe.configure({ mode: 'serial' });

/** One captured console message or uncaught page error. */
interface CapturedMessage {
  kind: 'console' | 'pageerror';
  type: string;
  text: string;
}

/** Messages captured for the currently running test (tests run serially). */
let captured: CapturedMessage[] = [];

test.beforeEach(({ page }) => {
  captured = [];
  page.on('console', (msg) => {
    captured.push({ kind: 'console', type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    captured.push({ kind: 'pageerror', type: 'pageerror', text: err.stack ?? String(err) });
  });
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('console-messages', {
    body: JSON.stringify(captured, null, 2),
    contentType: 'application/json',
  });
  // Hard-fail on ANY console error or uncaught page error. Allowlist: empty.
  const errors = captured.filter((m) => m.kind === 'pageerror' || m.type === 'error');
  expect(
    errors,
    `Console/page errors during "${testInfo.title}":\n${errors
      .map((e) => `[${e.kind}:${e.type}] ${e.text}`)
      .join('\n')}`,
  ).toEqual([]);
});

/**
 * The block's own error surface — the shared ErrorAlert primitive (role="alert")
 * rendered INSIDE the block's Preview container. Scoping to [data-block-preview]
 * excludes the app-chrome's always-present global alert region (DevTools/toast
 * portal at document.body), which would otherwise register as a stray alert.
 */
function blockAlert(page: Page) {
  return page.locator('[data-block-preview]').getByRole('alert');
}

/**
 * Fails fast with the block's own surfaced error text instead of letting a
 * later assertion time out and bury the root cause.
 */
async function expectNoBlockError(page: Page): Promise<void> {
  const errorTexts = await blockAlert(page).allInnerTexts();
  expect(errorTexts, 'audio block error surface must stay empty').toEqual([]);
}

/** The block's primary live status region, located by its accessible name. */
function statusRegion(page: Page) {
  return page.getByRole('status', { name: 'Status' });
}

test('redirects: /blocks/audio-studio and /blocks/voice both 308 to /blocks/audio; category page gated', async ({
  page,
}) => {
  const modelRequests: string[] = [];
  collectModelRequests(page, modelRequests);

  // Legacy category route + the phase0 voice chain both land on /blocks/audio.
  await page.goto('/blocks/audio-studio');
  await expect(page).toHaveURL(/\/blocks\/audio$/);
  await page.goto('/blocks/voice');
  await expect(page).toHaveURL(/\/blocks\/audio$/);

  // The category page mounts every audio block, each in its own gated BlockShell
  // (six sections: the five split blocks + the regrouped audio-classifier).
  await expect(page.locator('[data-block-preview]')).toHaveCount(6);

  // No-download-on-page-load invariant across all mounted blocks.
  await page.waitForLoadState('networkidle');
  expect(modelRequests, 'the /blocks/audio category page must fetch zero model bytes').toEqual([]);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/category.png'), fullPage: true });
});

test('voice-notes: records fake-mic speech, Whisper transcribes it, and note search ranks it', async ({
  page,
}) => {
  await page.goto(ROUTES.voiceNotes);
  const status = statusRegion(page);
  const transcript = page.getByRole('region', { name: 'Latest transcript' });
  const noteItems = page.getByRole('list', { name: 'Saved notes' }).getByRole('listitem');
  await expect(status).toHaveAttribute('data-status', 'idle');

  // ── record → transcribe (phase0 record scenario, preserved verbatim) ──
  // VoiceButton is push-to-talk (onPointerDown starts); its accessible name is
  // "Hold to talk" at rest — press the real button; the separate "Stop &
  // transcribe" button ends the take.
  await page.getByRole('button', { name: 'Hold to talk' }).dispatchEvent('pointerdown');
  await expect(status).toHaveAttribute('data-status', 'recording');
  await expectNoBlockError(page);

  // Deliberate CAPTURE WINDOW: the fixture is ~2.5 s and Chromium loops it, so
  // ~4 s of recording contains the full phrase.
  await page.waitForTimeout(4000);
  await expect(status).toHaveAttribute('data-status', 'recording'); // still live

  // Stop → the recorded blob goes to REAL Whisper tiny (downloads here cold).
  await page.getByRole('button', { name: 'Stop & transcribe' }).click();
  await expect(status).toHaveAttribute('data-status', 'transcribing');

  const recordOutcome = page
    .getByRole('alert')
    .or(transcript.filter({ hasText: /\S/ }));
  await expect(recordOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);
  await expect(status).toHaveAttribute('data-status', 'ready');

  // Witness 1: the transcript text contains the spoken words.
  const noteAText = ((await transcript.textContent()) ?? '').trim();
  const matches = countMatches(noteAText, VOICE_WORDS);
  expect(
    matches.length,
    `Transcript "${noteAText}" matched only [${matches.join(', ')}] of [${VOICE_WORDS.join(', ')}] — expected at least ${MIN_CONTAINMENT_MATCHES} (real Whisper on the real recording)`,
  ).toBeGreaterThanOrEqual(MIN_CONTAINMENT_MATCHES);

  // Witness 2: real segment timestamps rendered the synced transcript viewer.
  await expect(page.getByRole('region', { name: 'Synced transcript' })).toBeVisible();

  // Witness 3: the note card landed in the list.
  await expect(noteItems).toHaveCount(1);

  // ── second note via the upload path (semantically distinct fixture) ──
  await page
    .getByRole('region', { name: 'Or upload audio' })
    .locator('input[type="file"]')
    .setInputFiles(MEETING_WAV);
  await expect
    .poll(async () => noteItems.count(), {
      timeout: COLD_MODEL_TIMEOUT_MS,
      message: 'uploaded fixture should transcribe into a second note',
    })
    .toBe(2);
  await expectNoBlockError(page);

  // ── semantic search (REAL bge-small; downloads here cold) ──
  const searchInput = page.getByLabel('Search notes');
  await searchInput.fill('a fox jumping over a dog');
  await searchInput.press('Enter');
  const results = page.getByRole('region', { name: 'Note search results' });
  const searchOutcome = blockAlert(page).or(results);
  await expect(searchOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);

  await expect(results).toHaveAttribute('data-count', '2');
  // The fox note must be the TOP-ranked result (its full text mirrored on
  // data-top-label), with the visible per-result score bars beneath.
  await expect(results).toHaveAttribute('data-top-label', noteAText);

  // ── delete leaves the index: remove the FOX note (list is newest-first, so
  // target it by its own transcript text), re-run the query. The note card's
  // own delete affordance is the icon button named "Delete note". ──
  await noteItems
    .filter({ hasText: matches[0] })
    .getByRole('button', { name: 'Delete note' })
    .click();
  await expect(noteItems).toHaveCount(1);
  await searchInput.press('Enter');
  await expect
    .poll(async () => results.getAttribute('data-count'), {
      timeout: 60_000,
      message: 'deleted note must leave the search index',
    })
    .toBe('1');
  const topAfterDelete = (await results.getAttribute('data-top-label')) ?? '';
  expect(topAfterDelete, 'deleted note must not rank anymore').not.toBe(noteAText);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/voice-notes.png'), fullPage: true });
});

test('live-transcription: fake-mic stream through real getUserMedia + energy VAD yields a fixture utterance', async ({
  page,
}) => {
  await page.goto(ROUTES.liveTranscription);
  const status = statusRegion(page);
  const utterances = page.getByRole('list', { name: 'Utterances' }).getByRole('listitem');
  await expect(status).toHaveAttribute('data-status', 'idle');
  // Transcribe mode + energy VAD are the defaults for a standalone block — the
  // segmented pickers expose them as ARIA radios (aria-checked).
  await expect(page.getByRole('radio', { name: 'Transcribe' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Energy/ })).toBeChecked();

  // Start the live session — REAL getUserMedia (fake device), energy VAD,
  // chunker, and Whisper tiny (downloads here cold in this fresh context).
  await page.getByRole('button', { name: 'Start live session' }).click();

  // The looping fixture keeps speech (nearly) continuous, so each utterance
  // finalizes via the 15 s force-flush; Chromium's gapless loop occasionally
  // triggers Whisper's repetition-collapse on a chunk (a degenerate short
  // output). A streaming transcriber segments arbitrarily, so the correct
  // witness is that SOME finalized utterance in the session recognizes the
  // spoken phrase — poll the FULL utterance list (never a sampled slice) until
  // one utterance contains ≥2 distinctive fox words. This preserves the
  // real-recognition assertion while being robust to which segment lands clean.
  const utteranceOutcome = blockAlert(page).or(utterances);
  await expect(utteranceOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);

  let bestUtterance = '';
  await expect
    .poll(
      async () => {
        const texts = await utterances.allInnerTexts();
        for (const t of texts) {
          if (countMatches(t, VOICE_WORDS).length >= MIN_CONTAINMENT_MATCHES) {
            bestUtterance = t;
            return true;
          }
        }
        return false;
      },
      {
        timeout: 3 * 60 * 1000,
        message:
          'no finalized live utterance recognized ≥2 of [quick, brown, fox, lazy, dog] — real streaming STT must transcribe the fake-mic phrase within the capture window',
      },
    )
    .toBe(true);
  await expectNoBlockError(page);
  expect(
    countMatches(bestUtterance, VOICE_WORDS).length,
    `matched utterance "${bestUtterance.trim()}"`,
  ).toBeGreaterThanOrEqual(MIN_CONTAINMENT_MATCHES);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/live-transcription.png'), fullPage: true });

  // Stop releases the session (dispose() releases the mic); utterances persist
  // so the block reads 'ready'.
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expectNoBlockError(page);
});

test('meeting-assistant: pasted fixture transcript → summary + action items + export; audio path + cancel', async ({
  page,
}) => {
  await page.goto(ROUTES.meetingAssistant);
  const status = statusRegion(page);
  await expect(status).toHaveAttribute('data-status', 'idle');

  const block = page.locator('[data-block-preview]');
  // Each pipeline step is a labelled list item carrying its raw data-state.
  const transcribeStep = page.getByRole('listitem', { name: 'Transcribe' });
  const summarizeStep = page.getByRole('listitem', { name: 'Summarize' });
  const extractStep = page.getByRole('listitem', { name: 'Extract' });
  const summaryRegion = page.getByRole('region', { name: 'Summary' });
  const actionsList = page.getByRole('list', { name: 'Action items' });
  const actionItems = actionsList.getByRole('listitem');
  const actionCheckboxes = actionsList.getByRole('checkbox');
  const pasteBox = page.getByLabel('Meeting transcript');

  // ── mid-pipeline cancel FIRST, while Summarize is deterministically in flight.
  // ORDERING RATIONALE (test-timing, learned red-first in the pre-split spec):
  // once a model is warm, summarize/extract on the short fixtures complete
  // faster than Playwright can observe their transient "active" state. The ONLY
  // deterministic in-flight window is the ~200MB COLD DistilBART download, which
  // the pipeline performs INSIDE the Summarize step — so the cancel scenario
  // runs first: summarization aborts, the pasted transcript (the completed
  // input) remains, and no summary or action items are produced. ──
  await pasteBox.fill(MEETING_TRANSCRIPT);
  await page.getByRole('button', { name: 'Process transcript' }).click();
  await expect(transcribeStep).toHaveAttribute('data-state', 'skipped');
  await expect(summarizeStep).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(status).toHaveAttribute('data-status', 'ready');
  await expect(summarizeStep).toHaveAttribute('data-state', 'pending'); // aborted, not done
  // The completed input is preserved: the pasted transcript stays visible…
  await expect(block).toContainText('quarterly budget');
  // …and no downstream artifacts were produced.
  await expect(summaryRegion).toHaveCount(0);
  await expect(actionItems).toHaveCount(0);
  await expectNoBlockError(page);

  // ── reset, then the full paste path (skips Transcribe) ──
  await page.getByRole('button', { name: 'New meeting' }).click();
  await expect(status).toHaveAttribute('data-status', 'idle');
  await pasteBox.fill(MEETING_TRANSCRIPT);
  await page.getByRole('button', { name: 'Process transcript' }).click();
  await expect(transcribeStep).toHaveAttribute('data-state', 'skipped');

  // Summarize: REAL DistilBART (~200MB cold; the cancelled run's background
  // download is joined). Fail fast on the error surface.
  const summaryOutcome = blockAlert(page).or(summaryRegion);
  await expect(summaryOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);
  await expect(summarizeStep).toHaveAttribute('data-state', 'done');

  const summary = ((await summaryRegion.locator('p').textContent()) ?? '').trim();
  expect(summary.length, 'summary must be non-empty').toBeGreaterThan(0);
  const topicMatches = countMatches(summary, MEETING_TOPIC_WORDS);
  expect(
    topicMatches.length,
    `Summary "${summary}" mentions none of [${MEETING_TOPIC_WORDS.join(', ')}] — expected an on-topic summary`,
  ).toBeGreaterThanOrEqual(1);

  // Extract: REAL Granite 4.0 350M structured generation (~120MB cold).
  const extractOutcome = blockAlert(page).or(actionItems);
  await expect(extractOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);
  await expect(extractStep).toHaveAttribute('data-state', 'done');

  const itemCount = await actionItems.count();
  expect(itemCount, 'at least one action item must be extracted').toBeGreaterThanOrEqual(1);
  const priority = await actionItems.first().getAttribute('data-priority');
  expect(['high', 'medium', 'low']).toContain(priority);

  // Toggle completion → the completed count updates. Witnessed directly via the
  // action-item checkboxes' ARIA checked state (the visible "N/M done" badge is
  // derived from the same source).
  const checkedBoxes = actionsList.getByRole('checkbox', { checked: true });
  await expect(checkedBoxes).toHaveCount(0);
  await actionCheckboxes.first().check();
  await expect(checkedBoxes).toHaveCount(1);
  await expect(actionCheckboxes).toHaveCount(itemCount);

  // Export downloads the structured dated .txt with all three sections.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meeting-transcript-\d{4}-\d{2}-\d{2}\.txt$/);
  const exported = fs.readFileSync((await download.path())!, 'utf8');
  expect(exported).toContain('MEETING TRANSCRIPT');
  expect(exported).toContain('SUMMARY');
  expect(exported).toContain('ACTION ITEMS');
  expect(exported).toContain('quarterly budget');
  expect(exported).toContain('[x] 1.'); // the toggled completion state exports

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/meeting.png'), fullPage: true });

  // ── reset, then the audio path on the meeting fixture ──
  await page.getByRole('button', { name: 'New meeting' }).click();
  await expect(status).toHaveAttribute('data-status', 'idle');

  await page
    .getByRole('region', { name: 'Upload meeting audio' })
    .locator('input[type="file"]')
    .setInputFiles(MEETING_WAV);

  // Transcribe: REAL Whisper tiny (~40MB cold in this fresh context). The audio
  // path runs to COMPLETION: all three steps done, the transcript carries the
  // fixture's spoken words, and the audio is playable inline.
  await expect
    .poll(async () => transcribeStep.getAttribute('data-state'), {
      timeout: COLD_MODEL_TIMEOUT_MS,
      message: 'audio path must complete the Transcribe step',
    })
    .toBe('done');
  await expectNoBlockError(page);

  await expect(summarizeStep).toHaveAttribute('data-state', 'done', { timeout: COLD_MODEL_TIMEOUT_MS });
  await expect(extractStep).toHaveAttribute('data-state', 'done', { timeout: COLD_MODEL_TIMEOUT_MS });
  await expect(status).toHaveAttribute('data-status', 'ready');

  const meetingTranscript = (await block.textContent()) ?? '';
  const meetingMatches = countMatches(meetingTranscript, MEETING_WORDS);
  expect(
    meetingMatches.length,
    `Meeting audio transcript matched only [${meetingMatches.join(', ')}] of [${MEETING_WORDS.join(', ')}]`,
  ).toBeGreaterThanOrEqual(MIN_CONTAINMENT_MATCHES);
  await expect(summaryRegion).toBeVisible();
  // The uploaded meeting audio is playable inline (spec: audio path input).
  await expect(block.locator('audio')).toHaveCount(1);
  await expectNoBlockError(page);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/meeting-audio-path.png'), fullPage: true });
});

test('voice-explorer: Kokoro previews and A/B comparison', async ({ page }) => {
  await page.goto(ROUTES.voiceExplorer);
  const status = statusRegion(page);
  await expect(status).toHaveAttribute('data-status', 'idle');

  // Each of the 29 Kokoro voice cards exposes a distinct preview button
  // ("Preview <name>") and a separate selection button.
  const previewButtons = page.getByRole('button', { name: /^Preview / });
  await expect(previewButtons).toHaveCount(29);

  // Search filters the grid by name (af_heart → "Heart", bm_george → "George").
  const search = page.getByLabel('Search voices');
  await search.fill('george');
  await expect(previewButtons).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Preview George' })).toBeVisible();
  await search.fill('');
  await expect(previewButtons).toHaveCount(29);

  // Preview af_heart — REAL Kokoro (~90MB, downloads here cold). The preview
  // plays through a mounted scrub player whose <audio> decodes the real blob.
  await page.getByRole('button', { name: 'Preview Heart' }).click();
  const previewRegion = page.getByRole('region', { name: 'Voice preview' });
  const previewOutcome = blockAlert(page).or(previewRegion);
  await expect(previewOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);
  const previewAudio = previewRegion.locator('audio');
  await expect
    .poll(
      () =>
        previewAudio.evaluate((el) => {
          const media = el as HTMLAudioElement;
          return Number.isFinite(media.duration) ? media.duration : 0;
        }),
      { timeout: 30_000, message: 'af_heart preview <audio> should decode to a duration > 0.5 s' },
    )
    .toBeGreaterThan(0.5);

  // ── A/B comparison: af_heart vs bm_george over shared text ──
  const compare = page.getByRole('group', { name: 'Voice comparison' });
  // Column B's picker is labelled "Voice B voice"; the A/B readiness chips carry
  // the raw data-voice / data-ready hooks and are found by their leading text.
  await compare.getByLabel('Voice B voice').selectOption('bm_george');
  await expect(page.getByText(/^B: /)).toHaveAttribute('data-voice', 'bm_george');
  await page.getByLabel('Comparison text').fill('Local models can speak with many different voices.');
  await compare.getByRole('button', { name: 'Compare' }).click();

  await expect(page.getByText(/^A: /)).toHaveAttribute('data-ready', 'true', {
    timeout: COLD_MODEL_TIMEOUT_MS,
  });
  await expect(page.getByText(/^B: /)).toHaveAttribute('data-ready', 'true', {
    timeout: COLD_MODEL_TIMEOUT_MS,
  });
  await expectNoBlockError(page);

  // Both renditions are independently playable audio with real duration.
  const compareAudios = compare.locator('audio');
  await expect(compareAudios).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect
      .poll(
        () =>
          compareAudios.nth(i).evaluate((el) => {
            const media = el as HTMLAudioElement;
            return Number.isFinite(media.duration) ? media.duration : 0;
          }),
        { timeout: 30_000, message: `comparison audio ${i} should decode to a duration > 0.5 s` },
      )
      .toBeGreaterThan(0.5);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/voice-explorer.png'), fullPage: true });
});

test('audiobook-reader: one-shot synthesis, streaming early playback, transport controls, WAV download', async ({
  page,
}) => {
  await page.goto(ROUTES.audiobookReader);
  const status = statusRegion(page);
  const ttsText = page.getByLabel('Audiobook text');
  const singleTakeRegion = page.getByRole('region', { name: 'Single-take result' });
  await expect(status).toHaveAttribute('data-status', 'idle');

  // ── one-shot synthesis (COLD Kokoro downloads here; warms it for streaming) ──
  await ttsText.fill('Hello from LocalMode');
  // The char-limit ring names itself "<count> of <max> characters used".
  await expect(page.getByRole('status', { name: '20 of 10000 characters used' })).toBeVisible();
  await page.getByRole('button', { name: /^Synthesiz/i }).click();

  const ttsOutcome = singleTakeRegion.or(blockAlert(page));
  await expect(ttsOutcome.first()).toBeVisible({ timeout: COLD_MODEL_TIMEOUT_MS });
  await expectNoBlockError(page);
  await expect(singleTakeRegion).toBeVisible();
  await expect(status).toHaveAttribute('data-status', 'ready');

  // AudioScrubPlayer owns an <audio> whose src is an object URL of the REAL
  // synthesized blob — a decoded duration > 0.5 s proves a playable waveform.
  const oneShotAudio = singleTakeRegion.locator('audio');
  await expect(oneShotAudio).toHaveCount(1);
  await expect
    .poll(
      () =>
        oneShotAudio.evaluate((el) => {
          const media = el as HTMLAudioElement;
          return Number.isFinite(media.duration) ? media.duration : 0;
        }),
      { timeout: 30_000, message: 'synthesized <audio> should decode to a duration > 0.5 s' },
    )
    .toBeGreaterThan(0.5);

  // ── streaming run: early playback overlap, pause/resume, WAV download ──
  // Twelve sentences keep synthesis running for many seconds after playback
  // starts (a fully WARM Kokoro can otherwise finish a short text before the
  // first clause's play() resolves, leaving no playing∧synthesizing overlap).
  const multiSentence =
    'The morning sun rose slowly over the quiet valley. Birds began their songs in the tall trees. ' +
    'A gentle river wound its way past the old stone bridge. Far away, the mountains kept their silent watch. ' +
    'The village below was waking to the smell of fresh bread. Children hurried along the lane with their books. ' +
    'An old dog stretched in the warm light by the gate. Fishermen pushed their small boats onto the calm water. ' +
    'The church bell rang out across the rooftops. Market stalls filled with fruit, cloth, and clay pots. ' +
    'Travelers paused on the ridge to take in the view. It was the beginning of a long and peaceful day.';
  await ttsText.fill(multiSentence);

  const controls = page.getByRole('region', { name: 'Streaming playback' });
  const clauseCount = page.getByText(/^Streamed \d+ clauses?$/);
  // Early-playback witness armed BEFORE the run: an in-page MutationObserver
  // captures the value of data-synthesizing at the EXACT mutation where
  // data-playing first flips true — sampling-free.
  await controls.evaluate((el) => {
    (window as unknown as { __earlyPlayback?: Promise<string> }).__earlyPlayback = new Promise((resolve) => {
      const check = () => {
        if (el.getAttribute('data-playing') === 'true') {
          resolve(el.getAttribute('data-synthesizing') === 'true' ? 'overlap' : 'playback-after-synthesis');
          return true;
        }
        return false;
      };
      if (check()) return;
      const mo = new MutationObserver(() => {
        if (check()) mo.disconnect();
      });
      mo.observe(el, { attributes: true, attributeFilter: ['data-playing'] });
      setTimeout(() => resolve('playback-never-started'), 300_000);
    });
  });
  await page.getByRole('button', { name: /^Generat/i }).click();

  const earlyPlayback = await page.evaluate(
    () => (window as unknown as { __earlyPlayback: Promise<string> }).__earlyPlayback,
  );
  expect(
    earlyPlayback,
    'streaming playback must begin while synthesis is still running (observed at the data-playing mutation)',
  ).toBe('overlap');
  await expectNoBlockError(page);

  // Clause counter increments live.
  await expect
    .poll(async () => Number((await clauseCount.getAttribute('data-count')) ?? '0'), {
      timeout: 120_000,
      message: 'clause counter must increment during the stream',
    })
    .toBeGreaterThanOrEqual(2);

  // Pause halts playback (synthesis may keep running); resume continues it.
  await controls.getByRole('button', { name: 'Pause' }).click();
  await expect(controls).toHaveAttribute('data-playing', 'false');
  await controls.getByRole('button', { name: 'Resume' }).click();
  await expect(controls).toHaveAttribute('data-playing', 'true');

  // Let the run complete (synthesis + playback both settle).
  await expect
    .poll(
      async () =>
        (await controls.getAttribute('data-playing')) === 'false' &&
        (await controls.getAttribute('data-synthesizing')) === 'false',
      { timeout: 240_000, message: 'streaming run must complete' },
    )
    .toBe(true);
  await expectNoBlockError(page);
  const finalClauses = Number((await clauseCount.getAttribute('data-count')) ?? '0');
  expect(finalClauses, 'a multi-sentence text must stream several clauses').toBeGreaterThanOrEqual(3);

  // WAV download: named audio-{voiceId}-{timestamp}.wav (renamed from
  // audio-studio-… in the split), non-trivial size.
  const wavDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download WAV' }).click();
  const wavDownload = await wavDownloadPromise;
  expect(wavDownload.suggestedFilename()).toMatch(/^audio-[a-z_]+-\d+\.wav$/);
  const wavSize = fs.statSync((await wavDownload.path())!).size;
  expect(wavSize, 'downloaded WAV must carry real audio data').toBeGreaterThan(50_000);

  // Stop works mid-run: start a fresh stream, then stop it.
  await page.getByRole('button', { name: /^Generat/i }).click();
  await expect
    .poll(async () => controls.getAttribute('data-synthesizing'), {
      timeout: 60_000,
      message: 'second stream must start',
    })
    .toBe('true');
  await controls.getByRole('button', { name: 'Stop' }).click();
  await expect(controls).toHaveAttribute('data-synthesizing', 'false');
  await expect(controls).toHaveAttribute('data-playing', 'false');
  await expectNoBlockError(page);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'wave3/audio/audiobook-reader.png'), fullPage: true });
});
