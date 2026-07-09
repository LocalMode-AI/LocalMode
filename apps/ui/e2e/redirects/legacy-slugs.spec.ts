/**
 * @file legacy-slugs.spec.ts
 * @description Redirect-walk E2E for the 34 legacy slugs
 * (blocks-deprecate-showcase task 2.3 / design D2, D8). Imports the SAME
 * `LEGACY_REDIRECTS` module that `next.config.mjs` consumes, so the deployed
 * redirect map and this test cannot drift.
 *
 * REAL: full production app over HTTP (`next start` on :3000, or E2E_BASE_URL
 * for a deployed host — task 2.4), real navigation through the permanent
 * redirect, real render of the landed block page. No mocked boundary.
 *
 * For every entry it: navigates `/<slug>`, asserts the browser followed the
 * redirect to the mapped `/blocks/<name>` route (the deepened target), and
 * asserts that block page actually rendered — via the BlockShell structural
 * `[data-block-preview]` hook, which is default-mounted on every block page.
 * Console-error policy: hard fail on ANY console error; the allowlist is EMPTY
 * (matching platform.spec.ts).
 *
 * Red-first (task 2.3): temporarily change one entry's `blockPath` in
 * `src/lib/legacy-redirects.ts` (WITHOUT rebuilding — the running server keeps
 * the correct baked redirect while the spec re-reads the mutated module), run
 * this spec, and watch the URL assertion for that slug fail (expected the wrong
 * block, server sent the right one). Restore the entry and it goes green. This
 * proves the assertion compares expected-vs-actual and is not a no-op.
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { LEGACY_REDIRECTS } from '../../src/lib/legacy-redirects';

/**
 * Live block routes the map is allowed to target. Includes the category-page
 * routes (single-block categories keep `/blocks/<name>`) AND the deepened
 * `/blocks/<category>/<block>` routes introduced by the Wave-2 split changes.
 * split-writing-text deepens the 7 writing/text-insights slugs to their exact
 * block routes; the entries are additive so the map stays green in both the
 * pre- and post-central-deepening states.
 */
const KNOWN_BLOCKS = new Set([
  '/blocks/chat',
  '/blocks/image-studio/background-remover',
  '/blocks/image-studio/image-enhancer',
  '/blocks/image-studio/image-captioner',
  '/blocks/privacy/pii-redactor',
  '/blocks/privacy/encrypted-vault',
  '/blocks/agents/research-agent',
  '/blocks/agents/data-extractor',
  '/blocks/device/model-advisor',
  '/blocks/device/gguf-explorer',
  '/blocks/knowledge/document-qa',
  '/blocks/knowledge/rag-chat',
  '/blocks/knowledge/semantic-search',
  '/blocks/knowledge/vector-data-manager',
  '/blocks/photo/duplicate-finder',
  '/blocks/photo/image-search',
  '/blocks/photo/smart-gallery',
  '/blocks/audio/voice-notes',
  '/blocks/audio/meeting-assistant',
  '/blocks/audio/voice-explorer',
  '/blocks/audio/audiobook-reader',
  '/blocks/vision/object-detector',
  '/blocks/vision/live-tracker',
  // split-writing-text deepened routes (design D7).
  '/blocks/writing-tools/write',
  '/blocks/writing-tools/translate',
  '/blocks/writing-tools/summarize',
  '/blocks/writing-tools/complete',
  '/blocks/text-insights/sentiment-analyzer',
  '/blocks/text-insights/text-classifier',
  '/blocks/text-insights/model-evaluator',
]);

function collectConsoleErrors(page: Page, sink: string[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') sink.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    sink.push(`[pageerror] ${err.message}`);
  });
}

test.describe('legacy-slug redirects', () => {
  // Structural guards — cheap, and they catch a bad map before any navigation.
  test('map has exactly 34 unique slugs, all targeting known blocks', () => {
    expect(LEGACY_REDIRECTS).toHaveLength(34);
    const slugs = LEGACY_REDIRECTS.map((r) => r.slug);
    expect(new Set(slugs).size, 'slugs must be unique').toBe(34);
    for (const { slug, blockPath } of LEGACY_REDIRECTS) {
      expect(slug, `slug "${slug}" must be a bare slug`).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(KNOWN_BLOCKS.has(blockPath), `blockPath "${blockPath}" must be a live block`).toBe(true);
    }
  });

  for (const { slug, blockPath } of LEGACY_REDIRECTS) {
    test(`/${slug} → ${blockPath} (permanent) and the block renders`, async ({ page }) => {
      const consoleErrors: string[] = [];
      collectConsoleErrors(page, consoleErrors);

      // Navigate the legacy slug; Playwright follows the 301 to the block route.
      await page.goto(`/${slug}`);

      // The browser landed on the mapped block route.
      await expect(page, `/${slug} must land on ${blockPath}`).toHaveURL(
        new RegExp(`${blockPath.replace(/[/-]/g, (c) => `\\${c}`)}$`),
      );

      // The block page actually rendered: the BlockShell Preview surface is
      // default-mounted (structural `[data-block-preview]` hook). Combined with
      // the URL assertion above, this proves the redirect landed on the
      // deepened target route AND that block page rendered.
      await expect(page.locator('[data-block-preview]')).toBeVisible();

      await page.screenshot({
        path: `e2e-artifacts/redirects/${slug}.png`,
        fullPage: true,
      });

      await test.info().attach(`console-${slug}`, {
        body: consoleErrors.join('\n') || '(none)',
        contentType: 'text/plain',
      });
      expect(consoleErrors, `no console errors on /${slug} → ${blockPath}`).toEqual([]);
    });
  }
});
