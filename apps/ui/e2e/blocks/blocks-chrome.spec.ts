/**
 * @file blocks-chrome.spec.ts
 * @description E2E for the block-page chrome added for block navigation +
 * markdown export: the breadcrumb, the persistent left sidebar (desktop) / mobile
 * "Browse blocks" disclosure, and the "Copy page" / "View as Markdown" actions.
 *
 * REAL: full production app over HTTP, real navigation, real clipboard, and a
 * real fetch of the `/api/blocks-md` route the "View as Markdown" link points at.
 * Chrome is static — it must fetch ZERO model bytes and log ZERO console errors
 * (allowlist EMPTY). Selectors are accessibility-based (getByRole/getByText),
 * never data-testid.
 */
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const MODEL_HOST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /\.onnx(\?|$)/i,
  /\.gguf(\?|$)/i,
  /\.litertlm(\?|$)/i,
  /storage\.googleapis\.com\/mediapipe/i,
  /\.tflite(\?|$)/i,
  /\.task(\?|$)/i,
];

function collectConsoleErrors(page: Page, sink: string[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    // ALLOWLIST (documented, `/_vercel/`-scoped): the root layout mounts Vercel
    // Web Analytics + Speed Insights, which request /_vercel/insights/script.js
    // and /_vercel/speed-insights/script.js. Those endpoints only exist on
    // Vercel's edge, so a LOCAL `next start` (where these e2e runs execute) 404s
    // them and logs a 404 + MIME console error. Benign, environment-only
    // (identical on :3000 without this change). The failed-resource 404 carries
    // the script URL in `location`; the MIME error carries it in the message text
    // (location is the page) — so we match BOTH. Any non-`/_vercel/` console error
    // still hard-fails.
    const url = msg.location()?.url ?? '';
    const text = msg.text();
    if (url.includes('/_vercel/') || text.includes('/_vercel/')) return;
    sink.push(`[console.error] ${text} @ ${url}`);
  });
  page.on('pageerror', (err) => sink.push(`[pageerror] ${err.message}`));
}

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_HOST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

test.describe('blocks chrome', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  let consoleErrors: string[];
  let modelRequests: string[];

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    modelRequests = [];
    collectConsoleErrors(page, consoleErrors);
    collectModelRequests(page, modelRequests);
  });

  test.afterEach(async ({}, testInfo) => {
    await testInfo.attach('console-errors', {
      body: consoleErrors.join('\n') || '(none)',
      contentType: 'text/plain',
    });
    expect(consoleErrors, 'no console errors allowed (only the /_vercel/ analytics 404 is allowlisted)').toEqual([]);
    expect(modelRequests, 'chrome must fetch no model assets').toEqual([]);
  });

  test('deep block page: breadcrumb, sidebar highlight, and markdown actions', async ({ page }) => {
    await page.goto('/blocks/knowledge/semantic-search');

    // Breadcrumb: Blocks (link) / Knowledge (link) / Semantic Search (current).
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Blocks' })).toHaveAttribute('href', '/blocks');
    await expect(crumbs.getByRole('link', { name: 'Knowledge' })).toHaveAttribute(
      'href',
      '/blocks/knowledge',
    );
    await expect(crumbs.getByText('Semantic Search')).toHaveAttribute('aria-current', 'page');

    // Desktop sidebar: the active block link is marked current.
    const sidebar = page.getByRole('navigation', { name: 'Blocks' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'All blocks' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Semantic Search' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // View as Markdown → the block's /api/blocks-md route; fetch it and assert the
    // real markdown (title + install + inlined tsx source).
    const view = page.getByRole('link', { name: 'View as Markdown' });
    await expect(view).toHaveAttribute('href', '/api/blocks-md/knowledge/semantic-search');
    const md = await page.request.get('/api/blocks-md/knowledge/semantic-search');
    expect(md.status()).toBe(200);
    const body = await md.text();
    expect(body).toContain('# Semantic Search');
    expect(body).toContain('npx shadcn@latest add @localmode/ui/blocks/knowledge/semantic-search');
    expect(body).toContain('```tsx');

    // Copy page → clipboard holds the same page markdown (client-built).
    await page.getByRole('button', { name: 'Copy page' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('# Semantic Search');
    expect(clip).toContain('```tsx');

    // Sidebar switches blocks: click a sibling → navigate + breadcrumb updates.
    await sidebar.getByRole('link', { name: 'Document QA' }).click();
    await expect(page).toHaveURL(/\/blocks\/knowledge\/document-qa$/);
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Document QA'),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('category page: breadcrumb + all-blocks markdown export', async ({ page }) => {
    await page.goto('/blocks/knowledge');

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Blocks' })).toHaveAttribute('href', '/blocks');
    await expect(crumbs.getByText('Knowledge')).toHaveAttribute('aria-current', 'page');

    const view = page.getByRole('link', { name: 'View as Markdown' });
    await expect(view).toHaveAttribute('href', '/api/blocks-md/knowledge');
    const md = await page.request.get('/api/blocks-md/knowledge');
    const body = await md.text();
    expect(body).toContain('# Knowledge');
    // Every member block appears under its own ## heading.
    for (const h of ['## Semantic Search', '## Document QA', '## RAG Chat', '## Vector Data Manager']) {
      expect(body).toContain(h);
    }
  });

  test('gallery index has no sidebar (it is already the full grid)', async ({ page }) => {
    await page.goto('/blocks');
    await expect(page.getByRole('navigation', { name: 'Blocks' })).toHaveCount(0);
  });

  test('mobile: sidebar hidden, "Browse blocks" disclosure switches blocks', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/blocks/chat');

    // Desktop sidebar is not shown; the nav lives inside a closed disclosure.
    await expect(page.getByRole('navigation', { name: 'Blocks' })).toBeHidden();

    // Open the disclosure, then the grouped nav is reachable.
    await page.getByText('Browse blocks').click();
    const nav = page.getByRole('navigation', { name: 'Blocks' });
    await expect(nav).toBeVisible();

    await nav.getByRole('link', { name: 'Voice Notes' }).click();
    await expect(page).toHaveURL(/\/blocks\/audio\/voice-notes$/);
  });
});
