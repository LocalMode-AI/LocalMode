/**
 * @file platform.spec.ts
 * @description Platform-level E2E for the /blocks category-grid gallery
 * (blocks-split-platform Wave 0): legacy-URL redirects, the two-level category
 * grid (category sections + presentational BlockCards), the flat category/block
 * route semantics at Wave 0, homepage teaser + bundle isolation, and the hard
 * no-model-download-on-page-load invariant on the gallery AND every block page.
 *
 * DRIFT-PROOF: the expected cards/routes are derived by importing the SAME
 * modules the app renders from — `blocks-catalog.ts` (the gallery's card data
 * model, what `page.tsx` maps over) and `category-map.ts` (the category→block
 * route structure). The spec and the app therefore cannot disagree about the
 * block list, the category sections, or the routes; adding/splitting a block
 * updates both at once.
 *
 * REAL: full production app over HTTP, real navigation, real network capture.
 * No model is loaded here by design — these tests prove nothing downloads until
 * a block's explicit Load action (the per-block specs cover real loads).
 * Console-error policy: hard fail on any console error; allowlist is EMPTY.
 *
 * Selectors: block/gallery-driving lookups use accessibility selectors
 * (getByRole heading/region/link + name) — no `data-testid`; the sole structural
 * hook is `[data-block-preview]` (the BlockShell preview panel, preserved).
 *
 * The `/blocks/rag|vision|voice` 308 successor redirects are asserted in their
 * own block specs (knowledge-base / vision-lab / audio-studio) and stay green in
 * the same full-suite gate; the re-home did not move them, so this file keeps
 * only the `/demos` + `/test-lab` legacy redirects it already owned.
 */
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';
import { BLOCK_CATEGORIES, BLOCK_CARDS } from '../../src/app/blocks/blocks-catalog';
import { canonicalRoute, categoryRoute, isFlatCategory, routeServedCategories } from '../../src/app/blocks/category-map';

/** Hosts that indicate a model (or model asset) download was attempted. */
const MODEL_HOST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /\.onnx(\?|$)/i,
  /\.gguf(\?|$)/i,
  /\.litertlm(\?|$)/i,
  // MediaPipe task models + wasm runtimes (vision-lab block engines).
  /storage\.googleapis\.com\/mediapipe/i,
  /\.tflite(\?|$)/i,
  /\.task(\?|$)/i,
];

/**
 * The route-served block slugs — the 11 blocks that own a `/blocks/<name>` page.
 * Derived from the gallery's OWN card model (`BLOCK_CARDS`), so this list cannot
 * drift from what the gallery renders. `devtools-drawer` is deliberately absent:
 * it is layout chrome mounted by `blocks/layout.tsx` with no `/blocks/<name>`
 * route or gallery card, and the category map marks it `chrome`.
 */
const BLOCK_NAMES = BLOCK_CARDS.map((c) => c.slug);

function collectConsoleErrors(page: Page, sink: string[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') sink.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    sink.push(`[pageerror] ${err.message}`);
  });
}

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_HOST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

test.describe('blocks platform', () => {
  let consoleErrors: string[];

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    collectConsoleErrors(page, consoleErrors);
  });

  test.afterEach(async ({}, testInfo) => {
    await testInfo.attach('console-errors', {
      body: consoleErrors.join('\n') || '(none)',
      contentType: 'text/plain',
    });
    expect(consoleErrors, 'no console errors allowed (allowlist is empty)').toEqual([]);
  });

  // ── Structural guards ───────────────────────────────────────────────────────
  // Cheap, navigation-free, and they catch drift between the gallery card model
  // and the route map (and a broken Wave-0 flat-route invariant) before any
  // browser work runs.
  test('gallery card model and category route map agree on the 11 flat blocks', () => {
    // 11 route-served blocks, unique slugs.
    expect(BLOCK_NAMES.length, 'route-served block cards present (regression floor)').toBeGreaterThanOrEqual(11);
    expect(new Set(BLOCK_NAMES).size, 'block slugs are unique').toBe(BLOCK_NAMES.length);

    // The two SOURCES the app renders from agree on the same set of slugs. Order
    // may differ between the modules (they list writing-tools/agent-structured-data
    // in different positions); the SET must match exactly so neither can gain or
    // drop a block without the other.
    const routeMapSlugs = routeServedCategories().flatMap((c) => c.blocks.map((b) => b.slug));
    expect([...routeMapSlugs].sort(), 'category-map route-served slugs === gallery card slugs').toEqual(
      [...BLOCK_NAMES].sort(),
    );

    // devtools-drawer is chrome — never a gallery card, never a route-served slug.
    expect(BLOCK_NAMES).not.toContain('devtools-drawer');
    expect(routeMapSlugs).not.toContain('devtools-drawer');

    // Wave-0 flat-route semantics: every card links to the block's canonical
    // route, which is the flat `/blocks/<slug>` (single-block category ⇒ no
    // `<category>/<slug>` stutter), and the category page route collapses onto
    // that same flat route.
    for (const card of BLOCK_CARDS) {
      expect(card.route, `${card.slug} card links to its canonical route`).toBe(canonicalRoute(card.slug));
    }
    // Wave-agnostic category semantics: a flat category's page route IS its single
    // block's route; a deep category's page route hosts routes prefixed by it.
    for (const cat of routeServedCategories()) {
      if (isFlatCategory(cat)) {
        expect(
          categoryRoute(cat.category),
          `${cat.category} page route == its single block's flat route`,
        ).toBe(canonicalRoute(cat.blocks[0].slug));
      } else {
        expect(categoryRoute(cat.category), `${cat.category} category page route`).toBe(`/blocks/${cat.category}`);
        for (const b of cat.blocks) {
          expect(
            canonicalRoute(b.slug).startsWith(`/blocks/${cat.category}/`),
            `${b.slug} canonical route lives under /blocks/${cat.category}/`,
          ).toBe(true);
        }
      }
    }
  });

  test('legacy /demos and /test-lab URLs redirect to /blocks', async ({ page }) => {
    await page.goto('/demos');
    await expect(page).toHaveURL(/\/blocks$/);

    // Wave-agnostic: the `/demos/:name` + `/test-lab/:name` rules map to the flat
    // `/blocks/:name` SEGMENT — post-split, the top-level `/blocks/<segment>`
    // pages are the category pages (deep categories) + the flat single-block
    // pages. Derive that segment set from the route map (a flat category's
    // `categoryRoute` is its block's flat route; a deep category's is
    // `/blocks/<category>`) so the legacy redirect is asserted against every live
    // top-level page and cannot land a 404. (Deep split-block slugs like `write`
    // never had a `/demos/<slug>` URL; their capabilities are reached via the
    // category page + the deepened showcase slugs, covered elsewhere.)
    const topLevelSegments = [
      ...new Set(routeServedCategories().map((c) => categoryRoute(c.category).slice('/blocks/'.length))),
    ];
    for (const seg of topLevelSegments) {
      await page.goto(`/demos/${seg}`);
      await expect(page).toHaveURL(new RegExp(`/blocks/${seg}$`));
      await page.goto(`/test-lab/${seg}`);
      await expect(page).toHaveURL(new RegExp(`/blocks/${seg}$`));
    }
  });

  test('gallery renders every category section and block card, fetching zero model bytes', async ({
    page,
  }) => {
    // No-download-on-page-load invariant extended to the gallery itself (8.2):
    // the category grid is presentational (static cards, zero live previews), so
    // opening it must trigger no model-host request even though every block it
    // links to loads real models behind an explicit action.
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    await page.goto('/blocks');
    // The gallery is the page <main>; the "Blocks" h1 witnesses it mounted.
    const gallery = page.getByRole('main');
    await expect(gallery.getByRole('heading', { name: 'Blocks', level: 1 })).toBeVisible();

    // Exactly one category section per catalog category (each `<section>` is a
    // named landmark region via aria-labelledby, its accessible name === the
    // category title), and exactly one card link per catalog block (each BlockCard
    // link is `aria-label="Open <title>"`). Scope the region count to the category
    // titles specifically — the index also renders a "Browser capabilities" panel
    // as a named region that is not a category, so counting every region in main
    // would overshoot by the non-category landmark(s).
    const categoryTitleRe = new RegExp(
      `^(${BLOCK_CATEGORIES.map((c) => c.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
    );
    await expect(gallery.getByRole('region', { name: categoryTitleRe })).toHaveCount(
      BLOCK_CATEGORIES.length,
    );
    await expect(gallery.getByRole('link', { name: /^Open / })).toHaveCount(BLOCK_CARDS.length);

    for (const category of BLOCK_CATEGORIES) {
      // The category section renders as a region named by its heading.
      const section = gallery.getByRole('region', { name: category.title, exact: true });
      await expect(section, `category "${category.id}" section renders`).toBeVisible();
      await expect(
        gallery.getByRole('heading', { name: category.title, level: 2, exact: true }),
        `category "${category.id}" header shows its title`,
      ).toBeVisible();
      // The section hosts exactly its card links.
      await expect(
        section.getByRole('link', { name: /^Open / }),
        `category "${category.id}" hosts its card(s)`,
      ).toHaveCount(category.blocks.length);

      // Each card renders inside its category section, is an anchor to the
      // block's canonical route, and its route matches the route mechanism.
      for (const card of category.blocks) {
        const link = section.getByRole('link', { name: `Open ${card.title}`, exact: true });
        await expect(link, `card ${card.slug} renders in ${category.id}`).toBeVisible();
        await expect(link, `card ${card.slug} links to ${card.route}`).toHaveAttribute('href', card.route);
        expect(card.route, `card ${card.slug} route === canonicalRoute`).toBe(canonicalRoute(card.slug));
      }
    }

    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'gallery must not fetch model assets on load').toEqual([]);

    await page.screenshot({
      path: 'e2e-artifacts/screenshots/blocks-index.png',
      fullPage: true,
    });
  });

  test('homepage carries the static chat teaser and fetches no model bytes', async ({ page }) => {
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    await page.goto('/');
    // The Chat card in the featured-blocks grid links to /blocks/chat.
    const teaser = page.getByTestId('home-chat-teaser');
    await expect(teaser).toBeVisible();
    await expect(teaser).toHaveAttribute('href', '/blocks/chat');

    // Bundle-isolation witness: loading the homepage must trigger zero
    // model-host requests (the chat block and its transformers import no
    // longer ship with the homepage).
    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'homepage must not fetch model assets').toEqual([]);

    await page.screenshot({
      path: 'e2e-artifacts/screenshots/home-teaser.png',
      fullPage: true,
    });
  });

  for (const name of BLOCK_NAMES) {
    test(`${canonicalRoute(name)} resolves at its canonical route and downloads nothing on page load (Preview default-mounted)`, async ({
      page,
    }) => {
      const modelRequests: string[] = [];
      collectModelRequests(page, modelRequests);

      // Wave-agnostic route semantics: a single-block (flat) category's canonical
      // block route is the flat `/blocks/<slug>` route AND doubles as the category
      // page; a split (deep) category's canonical route is
      // `/blocks/<category>/<block>`. Either way it must resolve DIRECTLY, with no
      // redirect chain. Derived from `canonicalRoute` so the spec can't drift from
      // the app's own route structure.
      const route = canonicalRoute(name);
      await page.goto(route);
      expect(new URL(page.url()).pathname, `${name} resolves at its canonical route with no redirect`).toBe(route);

      // Preview tab is the default-mounted surface, and the block body actually
      // rendered its content — the preview panel's first child element is visible
      // (a uniform, accessibility-grade mount witness across every block, with no
      // reliance on a per-block testid). A mount crash would also trip the
      // empty-allowlist console-error gate.
      await expect(page.locator('[data-block-preview]')).toBeVisible();
      await expect(page.locator('[data-block-preview] > *').first()).toBeVisible();

      await page.waitForLoadState('networkidle');
      expect(modelRequests, `${name} must not fetch model assets on load`).toEqual([]);
    });
  }
});
