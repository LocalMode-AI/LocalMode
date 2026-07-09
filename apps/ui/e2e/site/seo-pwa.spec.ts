/**
 * @file seo-pwa.spec.ts
 * @description Regression guard for the site-level SEO + PWA surfaces added to
 * localmode.ai (apps/ui): robots.txt (3-tier crawler policy), sitemap.xml,
 * manifest.webmanifest, the /api/og social-share image, the service worker + PWA
 * icons, COOP/COEP cross-origin-isolation headers, the custom 404, and the
 * per-page canonicals / OpenGraph / JSON-LD structured data.
 *
 * REAL: hits the production app over HTTP (endpoints via request, tags via a real
 * navigation). Drift-proof: the expected block routes are derived from the SAME
 * `category-map` the app renders from, so adding/splitting a block updates the
 * sitemap assertion for free. Some checks (/sw.js) are production-build artifacts,
 * so run this against a built server (the suite's webServer does `build && start`).
 *
 * These assertions deliberately pin two things a careless edit would silently
 * break: robots must NOT `Disallow: /api/` (social scrapers fetch /api/og there),
 * and COEP must be `credentialless` (require-corp blocks cross-origin model
 * downloads). No console-error gate here — that's other specs' job.
 */
import { expect, test } from '@playwright/test';
import {
  routeServedCategories,
  canonicalRoute,
  categoryRoute,
  isFlatCategory,
} from '../../src/app/blocks/category-map';

/** Every route the sitemap must list for blocks (category pages + block details). */
function expectedBlockRoutes(): string[] {
  const routes: string[] = [];
  for (const cat of routeServedCategories()) {
    if (isFlatCategory(cat)) {
      routes.push(canonicalRoute(cat.blocks[0].slug));
    } else {
      routes.push(categoryRoute(cat.category));
      for (const b of cat.blocks) routes.push(canonicalRoute(b.slug));
    }
  }
  return routes;
}

/** A representative deep block route (for the per-block tag checks). */
function sampleDeepBlockRoute(): string {
  const deep = routeServedCategories().find((c) => !isFlatCategory(c));
  return deep ? canonicalRoute(deep.blocks[0].slug) : '/blocks/chat';
}

/** Read the concatenated JSON-LD of a loaded page, retrying (some is client-rendered). */
async function jsonLd(page: import('@playwright/test').Page): Promise<string> {
  return (await page.locator('script[type="application/ld+json"]').allTextContents()).join(' ');
}

test.describe('site platform — SEO + PWA surfaces', () => {
  test('robots.txt: 3-tier crawler policy, sitemap ref, /api/og NOT blocked', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/plain');
    const body = await res.text();

    // Tier 1 — allow retrieval/answer bots that cite sources.
    for (const ua of ['ChatGPT-User', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']) {
      expect(body, `robots allows ${ua}`).toContain(ua);
    }
    // Tier 2 — disallow training-only crawlers.
    for (const ua of ['GPTBot', 'Google-Extended', 'CCBot', 'Bytespider']) {
      expect(body, `robots names ${ua}`).toContain(ua);
    }
    expect(body).toMatch(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/);
    // Keep registry JSON out, but NEVER block /api/ — social scrapers fetch /api/og.
    expect(body).toContain('Disallow: /r/');
    expect(body, 'robots must NOT block /api/ (breaks OG previews)').not.toContain('Disallow: /api/');
  });

  test('sitemap.xml: valid + lists hubs and every block route (drift-proof)', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const xml = await res.text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

    for (const p of ['/', '/docs', '/blocks', '/capabilities']) {
      expect(paths, `sitemap lists ${p}`).toContain(p);
    }
    for (const route of expectedBlockRoutes()) {
      expect(paths, `sitemap lists ${route}`).toContain(route);
    }
  });

  test('manifest.webmanifest: installable PWA with the icon set', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const m = JSON.parse(await res.text());
    expect(m.name).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });

  test('/api/og: renders a cacheable PNG social image', async ({ request }) => {
    const res = await request.get('/api/og?title=Regression%20Test&desc=hello&eyebrow=demo');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    expect(res.headers()['cache-control']).toContain('max-age');
    const body = await res.body();
    expect(body.byteLength, 'a real image was rendered').toBeGreaterThan(5000);
  });

  test('service worker + PWA icons are served', async ({ request }) => {
    const assets: [string, string][] = [
      ['/sw.js', 'javascript'],
      ['/icon.svg', 'svg'],
      ['/apple-icon.png', 'image/png'],
      ['/icons/icon-192x192.png', 'image/png'],
      ['/icons/icon-512x512.png', 'image/png'],
      ['/icons/icon-512x512-maskable.png', 'image/png'],
    ];
    for (const [path, ct] of assets) {
      const r = await request.get(path);
      expect(r.status(), `${path} served`).toBe(200);
      expect(r.headers()['content-type'], `${path} content-type`).toContain(ct);
    }
  });

  test('security headers: HSTS + cross-origin isolation (COOP/COEP)', async ({ request }) => {
    const h = (await request.get('/')).headers();
    expect(h['strict-transport-security']).toContain('max-age');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    // credentialless (NOT require-corp) so cross-origin model downloads still load.
    expect(h['cross-origin-embedder-policy'], 'COEP must stay credentialless').toBe('credentialless');
  });

  test('custom 404 for unknown paths', async ({ page }) => {
    const res = await page.goto('/this-path-does-not-exist-xyz');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /isn't here/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Blocks gallery' })).toBeVisible();
  });

  test('homepage: canonical + OG image + Organization/WebSite/SoftwareApplication/FAQPage JSON-LD', async ({
    page,
  }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href');
    expect(canonical).toMatch(/^https?:\/\//);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage).toMatch(/^https?:\/\/.*\/api\/og\?/);
    expect(await page.locator('meta[property="og:image:width"]').first().getAttribute('content')).toBe('1200');
    expect(await page.locator('meta[property="og:image:height"]').first().getAttribute('content')).toBe('630');
    expect(await page.locator('meta[name="twitter:image"]').first().getAttribute('content')).toContain('/api/og');

    const ld = await jsonLd(page);
    for (const type of ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']) {
      expect(ld, `homepage JSON-LD has ${type}`).toContain(`"${type}"`);
    }
  });

  test('block page: self-canonical + OG image + BreadcrumbList JSON-LD', async ({ page }) => {
    const route = sampleDeepBlockRoute();
    await page.goto(route);
    expect(await page.locator('link[rel="canonical"]').first().getAttribute('href')).toContain(route);
    expect(await page.locator('meta[property="og:image"]').first().getAttribute('content')).toContain('/api/og');
    // The breadcrumb graph is client-rendered, so poll for it.
    await expect.poll(() => jsonLd(page)).toContain('"BreadcrumbList"');
  });

  test('docs page: self-canonical + OG image', async ({ page }) => {
    await page.goto('/docs/components');
    expect(await page.locator('link[rel="canonical"]').first().getAttribute('href')).toContain('/docs/components');
    expect(await page.locator('meta[property="og:image"]').first().getAttribute('content')).toContain('/api/og');
  });
});
