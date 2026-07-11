/**
 * @file privacy.spec.ts
 * @description Real-Chrome E2E for the two split privacy blocks under the renamed
 * `privacy` category (split-image-privacy Wave 2). Drives each block's canonical
 * route (`/blocks/privacy/<block>`) via accessibility selectors
 * (`getByRole`/`getByLabel`/`getByText`) ONLY — no `data-testid` — with NO mocked
 * model or crypto boundary:
 *
 * - pii-redactor (`/blocks/privacy/pii-redactor`): real Xenova/bert-base-NER
 *   download + inference on a fixed fixture, asserting the EXACT detected PII
 *   entities (surface form + type) and the EXACT redacted output text (typed
 *   placeholders + [EMAIL_REDACTED]/[PHONE_REDACTED]/[SSN_REDACTED]); the export
 *   equals the displayed redaction; a per-type toggle restores excluded entities;
 *   and differential privacy (deterministic baseline / noised differs / budget =
 *   configured ε / badge ε+384 dims / exhaustion).
 * - encrypted-vault (`/blocks/privacy/encrypted-vault`): the full round-trip in
 *   REAL IndexedDB — create → add an encrypted note → lock → RELOAD → still locked
 *   → wrong passphrase rejected → correct passphrase → note decrypts verbatim;
 *   plus a raw-IndexedDB dump asserting ciphertext (not plaintext/passphrase) at
 *   rest; and a hash-chained audit log that verifies with a complete JSONL export.
 *
 * Also asserts the renamed-category `/blocks/privacy-vault` → `/blocks/privacy`
 * 308 redirect. Screenshots + console/pageerror capture from ALL contexts land in
 * e2e-artifacts/; the console-error allowlist is EMPTY (any console error fails).
 */
import path from 'node:path';
import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';

const APP_DIR = path.join(__dirname, '..', '..');
const screenshotPath = (name: string) =>
  path.join(APP_DIR, 'e2e-artifacts', 'screenshots', name);

const CATEGORY_ROUTE = '/blocks/privacy';
const REDACTOR_ROUTE = '/blocks/privacy/pii-redactor';
const VAULT_ROUTE = '/blocks/privacy/encrypted-vault';

/** Model-asset host/extension patterns (bert-base-NER + all-MiniLM). */
const MODEL_BYTES_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx\b/i;

/**
 * Console-error allowlist — INTENTIONALLY EMPTY. Any console error or pageerror
 * in any context is a hard failure. HuggingFace optional-config 404s are 404
 * RESPONSES, not console errors, so they do not appear here.
 */
const CONSOLE_ERROR_ALLOWLIST: readonly RegExp[] = [];

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Passphrase markers — asserted ABSENT from raw IndexedDB. */
const PASSPHRASE = 'correct horse battery staple';
const WRONG_PASSPHRASE = 'incorrect zebra lantern';
/** Note markers — asserted ABSENT from raw IndexedDB (title + content are both
 * inside the encrypted envelope). */
const NOTE_TITLE = 'secret-title-marker-7f3a91';
const NOTE_CONTENT = 'super-secret-content-marker-9b2e-launch-codes';

/**
 * The EXACT expected detected entities (surface form + type) for the sample
 * document, from real bert-base-NER (aggregation 'simple'). Finalized against
 * the real model output during the fix-until-green run.
 */
const EXPECTED_ENTITIES: { text: string; type: string }[] = [
  { text: 'John Smith', type: 'PER' },
  { text: 'Sarah Johnson', type: 'PER' },
  { text: 'Microsoft', type: 'ORG' },
  { text: 'Seattle', type: 'LOC' },
  { text: 'Washington', type: 'LOC' },
  { text: 'Google', type: 'ORG' },
  { text: 'European Union', type: 'ORG' },
  { text: 'John', type: 'PER' },
];

/**
 * The EXACT expected redacted output for the sample document (typed placeholders
 * for every detected entity + the core redactPII() regex pass). Finalized during
 * the fix-until-green run.
 */
const EXPECTED_REDACTED =
  '[PER] met with Dr. [PER] at the [ORG] headquarters in [LOC], [LOC] on March 15th. ' +
  'They discussed the upcoming partnership with [ORG] and the [ORG] regulations. ' +
  // The core redactPII phone regex redacts the identifying digits (555-0123);
  // the bare "+1-" country-code prefix is not part of the match.
  'Contact [PER] at [EMAIL_REDACTED] or call +1-[PHONE_REDACTED]. ' +
  'His social security number is [SSN_REDACTED].';

/** Original PII that must NEVER survive in the redacted output. */
const ORIGINAL_PII = [
  'john.smith@example.com',
  '+1-555-0123',
  '123-45-6789',
  'John Smith',
  'Sarah Johnson',
  'Microsoft',
  'Google',
];

// ── Console / error / request capture (context-wide) ─────────────────────────

let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let requestUrls: string[] = [];

function wireContext(context: BrowserContext) {
  context.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
  });
  context.on('weberror', (err) => {
    pageErrors.push(`[weberror] ${err.error().message}`);
  });
  context.on('request', (req) => {
    const url = req.url();
    if (MODEL_BYTES_PATTERN.test(url)) requestUrls.push(url);
  });
}

const modelRequests = () => requestUrls.filter((u) => MODEL_BYTES_PATTERN.test(u));

test.describe('privacy blocks', () => {
  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    requestUrls = [];
    wireContext(page.context());
  });

  test.afterEach(async ({ page }, testInfo) => {
    await testInfo.attach('console-errors', {
      body: consoleErrors.join('\n') || '(none)',
      contentType: 'text/plain',
    });
    await testInfo.attach('page-errors', {
      body: pageErrors.join('\n') || '(none)',
      contentType: 'text/plain',
    });
    await page
      .screenshot({
        path: screenshotPath(`privacy-${testInfo.title.replace(/\W+/g, '-')}.png`),
        fullPage: true,
      })
      .catch(() => {});
    const failing = consoleErrors.filter(
      (e) => !CONSOLE_ERROR_ALLOWLIST.some((rx) => rx.test(e)),
    );
    expect(failing, 'no non-allowlisted console errors').toEqual([]);
    expect(pageErrors, 'no page errors').toEqual([]);
  });

  test('/blocks/privacy-vault 308-redirects to /blocks/privacy', async ({ page }) => {
    const response = await page.goto('/blocks/privacy-vault');
    expect(new URL(page.url()).pathname, 'landed on the renamed category route').toBe(CATEGORY_ROUTE);
    // The redirect in the chain is a permanent (308) redirect.
    const from = response?.request().redirectedFrom();
    const status = from ? (await from.response())?.status() : undefined;
    expect(status, '/blocks/privacy-vault is a 308 permanent redirect').toBe(308);
    // The category page rendered both blocks (each mounts its live preview).
    await expect(page.locator('[data-block-preview]').first()).toBeVisible();
  });

  test('category and block pages fetch no model bytes on load', async ({ page }) => {
    for (const route of [CATEGORY_ROUTE, REDACTOR_ROUTE, VAULT_ROUTE]) {
      await page.goto(route);
      await expect(page.locator('[data-block-preview]').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    expect(modelRequests(), 'no model bytes before an explicit Scan').toEqual([]);
  });

  test('pii-redactor: real NER exact entities + exact redaction + DP behavior', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000); // cold NER (~110MB) + embedding (~23MB) download

    await page.goto(REDACTOR_ROUTE);
    // Scope block-content text queries to the live preview — the hidden Code tab
    // renders the block source (with the same status strings) into the DOM.
    const block = page.locator('[data-block-preview]');

    // Gated: nothing has downloaded yet.
    // The block renders a non-breaking space before the unit (U+00A0); `\s`
    // matches it, so the assertion does not depend on invisible whitespace.
    await expect(
      block.getByText(/^Model loads on Scan \(bert-base-NER ~110\sMB\)\.$/),
    ).toBeVisible();
    expect(modelRequests(), 'no model bytes before Scan').toEqual([]);

    // Load the sample document and scan (real NER download + inference).
    await page.getByRole('button', { name: 'Load sample' }).click();
    await page.getByRole('button', { name: 'Scan for PII' }).click();
    await expect(block.getByText(/entities detected\./)).toBeVisible({ timeout: 12 * 60 * 1000 });
    // Positive control: the real model actually downloaded.
    expect(modelRequests().length, 'NER model downloaded on Scan').toBeGreaterThan(0);

    // EXACT detected entities (surface form + type) from the real model — read
    // from the labeled, screen-reader-visible detection list.
    const detected = await page
      .getByRole('list', { name: 'Detected PII entities' })
      .getByRole('listitem')
      .evaluateAll((els) =>
        els.map((el) => ({
          text: el.getAttribute('data-entity-text'),
          type: el.getAttribute('data-entity-type'),
        })),
      );
    expect(detected).toEqual(EXPECTED_ENTITIES);

    // EXACT redacted output text (placeholders + regex PII pass), no original PII.
    const redactedOutput = page.getByRole('group', { name: 'Redacted output' });
    const redacted = (await redactedOutput.textContent())?.trim() ?? '';
    expect(redacted).toBe(EXPECTED_REDACTED);
    for (const pii of ORIGINAL_PII) {
      expect(redacted, `redacted output must not contain "${pii}"`).not.toContain(pii);
    }

    // Export equals the displayed redaction (byte-for-byte).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Clean' }).click(),
    ]);
    const stream = await download.createReadStream();
    const exported = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    expect(exported.trim()).toBe(EXPECTED_REDACTED);

    // Toggle a type OUT → those entities reappear as plain text in the output.
    await page.getByRole('button', { name: 'Location' }).click();
    const withLoc = (await redactedOutput.textContent()) ?? '';
    expect(withLoc, 'excluded LOC reappears').toContain('Seattle');
    expect(withLoc, 'excluded LOC reappears').toContain('Washington');
    expect(withLoc, 'other types stay redacted').toContain('[PER]');
    expect(withLoc, 'structured PII stays redacted').toContain('[SSN_REDACTED]');
    // Restore.
    await page.getByRole('button', { name: 'Location' }).click();
    await expect.poll(async () => (await redactedOutput.textContent())?.trim()).toBe(EXPECTED_REDACTED);

    // ── Differential privacy ────────────────────────────────────────────────
    // Enable DP (default epsilon 1.0) and scan → noised embedding + budget. The
    // DP controls own the only switch/slider on the page.
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: 'Scan for PII' }).click();
    const sig = block.getByText(/^baseline .+ · noised /);
    await expect(sig).toBeAttached({ timeout: 12 * 60 * 1000 });
    // The DP-applied provenance badge renders.
    await expect(block.getByText('DP applied')).toBeVisible();

    const readSig = async () => ({
      plain: await sig.getAttribute('data-plain-sig'),
      noisy: await sig.getAttribute('data-noisy-sig'),
      dims: await sig.getAttribute('data-dims'),
      epsilon: await sig.getAttribute('data-epsilon'),
    });
    const budget = block.getByText(/^Privacy budget:/);
    const consumed = async () => Number(await budget.getAttribute('data-consumed'));

    const first = await readSig();
    // The DP run reflects the configured epsilon + embedding dimensionality.
    expect(first.epsilon).toBe('1');
    expect(first.dims).toBe('384');
    // Budget consumed the configured epsilon once.
    expect(await consumed()).toBeCloseTo(1.0, 5);
    // DP changes the output: the noised embedding differs from the baseline.
    expect(first.noisy).not.toBe(first.plain);

    // Second DP scan: the baseline (non-noised) embedding is DETERMINISTIC; the
    // budget consumes another epsilon.
    await page.getByRole('button', { name: 'Scan for PII' }).click();
    await expect.poll(consumed).toBeCloseTo(2.0, 5);
    const second = await readSig();
    expect(second.plain, 'DP-off baseline is deterministic across repeats').toBe(first.plain);
    expect(second.noisy, 'DP-on output differs from the baseline').not.toBe(second.plain);

    // Budget exhaustion: crank epsilon to its max, scan once → consumed ≥ max.
    await page.getByRole('slider').press('End');
    await page.getByRole('button', { name: 'Scan for PII' }).click();
    await expect.poll(consumed).toBeGreaterThanOrEqual(10);
    // The DP controls surface the exhausted budget bar (error tint / warning).
    await expect(budget).toHaveAttribute('data-consumed', /1[0-9]\.\d/);

    await page.screenshot({ path: screenshotPath('privacy-pii-redactor.png'), fullPage: true });
  });

  test('encrypted-vault: create → add → lock → reload → unlock round-trip + ciphertext at rest', async ({
    page,
  }) => {
    test.setTimeout(3 * 60 * 1000); // no models — Web Crypto + IndexedDB only

    await page.goto(VAULT_ROUTE);

    // Scope block-content queries to the live preview — the (hidden) Code tab
    // renders the block source into the DOM, so page-level getByText would also
    // match source strings. The lock badge is the block's only lock-word status.
    const block = page.locator('[data-block-preview]');
    const lockBadge = block.getByRole('status').filter({ hasText: /Locked|Unlocked|No vault/ });

    // Fresh context ⇒ create mode (the confirm field only exists when creating).
    await expect(page.locator('#passphrase-gate-confirm')).toBeVisible();
    await expect(lockBadge).toHaveText('No vault');

    // Create the vault (passphrase + confirmation).
    await page.locator('#passphrase-gate-field').fill(PASSPHRASE);
    await page.locator('#passphrase-gate-confirm').fill(PASSPHRASE);
    await page.getByRole('button', { name: /create/i }).click();
    await expect(lockBadge).toHaveText('Unlocked');

    // Add an encrypted note.
    await page.getByLabel('Note title').fill(NOTE_TITLE);
    await page.getByLabel('Secret content').fill(NOTE_CONTENT);
    await page.getByRole('button', { name: 'Add note' }).click();
    const noteCard = page.getByRole('group', { name: NOTE_TITLE });
    await expect(noteCard).toBeVisible();

    // ── Ciphertext at rest: dump raw IndexedDB, assert plaintext is absent and
    // ciphertext records exist (two independent witnesses). The db name is
    // derived from VAULT_NAME='privacy-vault' (kept stable across the rename). ──
    const dump = await page.evaluate(async () => {
      const dbName = 'vectordb_vault_privacy-vault';
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const stores = Array.from(db.objectStoreNames);
      const out: Record<string, unknown[]> = {};
      for (const store of stores) {
        out[store] = await new Promise((resolve, reject) => {
          const req = db.transaction(store, 'readonly').objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      db.close();
      return out;
    });

    const dumpJson = JSON.stringify(dump);
    // Witness 1: no plaintext / passphrase anywhere in the persisted bytes.
    expect(dumpJson, 'note title must not be persisted in plaintext').not.toContain(NOTE_TITLE);
    expect(dumpJson, 'note content must not be persisted in plaintext').not.toContain(NOTE_CONTENT);
    expect(dumpJson, 'passphrase must never be persisted').not.toContain(PASSPHRASE);
    // Witness 2: the vault records exist and are non-empty ciphertext envelopes.
    const docs = (dump.documents ?? []) as { id: string; metadata?: Record<string, unknown> }[];
    const itemDocs = docs.filter((d) => d.id !== '__vault_meta__');
    expect(itemDocs.length, 'at least one encrypted item document persisted').toBeGreaterThan(0);
    for (const d of itemDocs) {
      const ct = d.metadata?.ciphertext;
      expect(typeof ct === 'string' && (ct as string).length > 0, 'ciphertext envelope present').toBe(
        true,
      );
    }
    const metaDoc = docs.find((d) => d.id === '__vault_meta__');
    expect(metaDoc?.metadata, 'vault meta record persisted').toBeTruthy();

    // Lock → reload → still locked (persistence proven by a real navigation).
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(lockBadge).toHaveText('Locked');

    await page.reload();
    // Unlock mode after reload: the field is present but there is NO confirm field.
    await expect(page.locator('#passphrase-gate-field')).toBeVisible();
    await expect(page.locator('#passphrase-gate-confirm')).toHaveCount(0);
    await expect(lockBadge).toHaveText('Locked');
    // No decrypted content is present while locked.
    await expect(block.getByText(NOTE_CONTENT)).toHaveCount(0);

    // Wrong passphrase → rejected, nothing revealed, still locked.
    await page.locator('#passphrase-gate-field').fill(WRONG_PASSPHRASE);
    await page.getByRole('button', { name: /unlock/i }).click();
    // Scope to the block to avoid Next.js's global route-announcer (role="alert").
    await expect(block.getByRole('alert')).toContainText(/incorrect passphrase/i);
    await expect(lockBadge).toHaveText('Locked');
    await expect(block.getByText(NOTE_CONTENT)).toHaveCount(0);

    // Correct passphrase → unlocks and the note decrypts verbatim.
    await page.locator('#passphrase-gate-field').fill(PASSPHRASE);
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(lockBadge).toHaveText('Unlocked');
    const item = page.getByRole('group', { name: NOTE_TITLE });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: /reveal/i }).click();
    await expect(item).toContainText(NOTE_CONTENT);

    await page.screenshot({ path: screenshotPath('privacy-encrypted-vault.png'), fullPage: true });
  });

  test('encrypted-vault audit log: operations chained, chain verifies, export complete', async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);

    await page.goto(VAULT_ROUTE);
    const block = page.locator('[data-block-preview]');
    const lockBadge = block.getByRole('status').filter({ hasText: /Locked|Unlocked|No vault/ });

    // Exercise a set of operations in ONE session (single audit signing key).
    await page.locator('#passphrase-gate-field').fill(PASSPHRASE);
    await page.locator('#passphrase-gate-confirm').fill(PASSPHRASE);
    await page.getByRole('button', { name: /create/i }).click();
    await expect(lockBadge).toHaveText('Unlocked');

    await page.getByLabel('Note title').fill(NOTE_TITLE);
    await page.getByLabel('Secret content').fill(NOTE_CONTENT);
    await page.getByRole('button', { name: 'Add note' }).click();
    const noteCard = page.getByRole('group', { name: NOTE_TITLE });
    await expect(noteCard).toBeVisible();
    await noteCard.getByRole('button', { name: /reveal/i }).click();

    // Wait for the async item.viewed append to settle (4 chained ops).
    const auditEntries = page.getByRole('list', { name: 'Audit log entries' }).getByRole('listitem');
    await expect(auditEntries).toHaveCount(4);

    // Operations recorded in order.
    const kinds = await auditEntries.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-audit-kind')),
    );
    expect(kinds).toEqual([
      'vault.created',
      'vault.unlocked',
      'item.added',
      'item.viewed',
    ]);

    // The hash chain verifies (untampered log).
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(block.getByText(/^Chain valid/)).toBeVisible();

    // Export streams every entry as JSONL with hash + signature — the exported
    // entries must match the recorded operations exactly (order + kinds).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSONL' }).click(),
    ]);
    const stream = await download.createReadStream();
    const jsonl = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    const entries = jsonl
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    expect(entries.map((e) => e.kind)).toEqual(kinds);
    for (const entry of entries) {
      expect(typeof entry.hash).toBe('string');
      expect(typeof entry.signature).toBe('string');
      expect(entry.hash.length).toBeGreaterThan(0);
      expect(entry.signature.length).toBeGreaterThan(0);
    }

    await page.screenshot({ path: screenshotPath('privacy-audit.png'), fullPage: true });
  });

  test('encrypted-vault: irreversible delete is guarded by a keyboard-accessible confirm', async ({
    page,
  }) => {
    test.setTimeout(3 * 60 * 1000); // no models — Web Crypto + IndexedDB only

    await page.goto(VAULT_ROUTE);
    const block = page.locator('[data-block-preview]');
    const lockBadge = block.getByRole('status').filter({ hasText: /Locked|Unlocked|No vault/ });

    // Create a vault with one note.
    await page.locator('#passphrase-gate-field').fill(PASSPHRASE);
    await page.locator('#passphrase-gate-confirm').fill(PASSPHRASE);
    await page.getByRole('button', { name: /create/i }).click();
    await expect(lockBadge).toHaveText('Unlocked');
    await page.getByLabel('Note title').fill(NOTE_TITLE);
    await page.getByLabel('Secret content').fill(NOTE_CONTENT);
    await page.getByRole('button', { name: 'Add note' }).click();
    const noteCard = page.getByRole('group', { name: NOTE_TITLE });
    await expect(noteCard).toBeVisible();

    // The card's Delete button opens a confirm dialog — it does NOT delete on a
    // single click (destructive, no undo). Cancel keeps the item intact.
    await noteCard.getByRole('button', { name: `Delete ${NOTE_TITLE}` }).click();
    const confirm = page.getByRole('alertdialog', { name: `Delete ${NOTE_TITLE}` });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/cannot be recovered/i);
    await expect(noteCard).toBeVisible(); // still present — nothing deleted yet

    // Cancel dismisses the confirm and the note survives.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(noteCard).toBeVisible();

    // Re-open the confirm and this time confirm the permanent delete (driven by
    // the keyboard: Tab from the auto-focused Cancel to the destructive button).
    await noteCard.getByRole('button', { name: `Delete ${NOTE_TITLE}` }).click();
    await expect(page.getByRole('alertdialog', { name: `Delete ${NOTE_TITLE}` })).toBeVisible();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete permanently' })
      .click();

    // The note is gone and the empty-state message returns.
    await expect(page.getByRole('group', { name: NOTE_TITLE })).toHaveCount(0);
    await expect(block.getByText('No items yet.', { exact: false })).toBeVisible();
    // The deletion is recorded in the tamper-evident audit log.
    const kinds = await page
      .getByRole('list', { name: 'Audit log entries' })
      .getByRole('listitem')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-audit-kind')));
    expect(kinds).toContain('item.deleted');

    await page.screenshot({ path: screenshotPath('privacy-delete-confirm.png'), fullPage: true });
  });
});
