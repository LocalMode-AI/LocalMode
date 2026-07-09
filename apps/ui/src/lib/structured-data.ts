/**
 * @file structured-data.ts
 * @description JSON-LD builders (schema.org) for localmode.ai — the homepage
 * `@graph` (Organization + WebSite + SoftwareApplication, seo.md §3.1/§3.6/§3.8),
 * BreadcrumbList (§3.3), a homepage FAQPage (§3.4), and per-block
 * SoftwareApplication. External identities (Wikidata, X handle) are env-gated so
 * they simply fall out of `sameAs` until provided. WebSite SearchAction is
 * intentionally omitted — the site search is a client cmdk dialog with no
 * crawlable `?q=` results URL, and a bogus target is worse than none.
 */
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

const DESCRIPTION =
  'A shadcn-style registry of copy-owned, composable AI UI components for the browser, plus installable blocks that run real models on-device. Local-first, privacy-first: inference runs entirely in the browser, data never leaves the device.';

/** Organization sameAs — env-gated externals drop out when unset. */
function orgSameAs(): string[] {
  return [
    'https://github.com/LocalMode-AI/LocalMode',
    'https://www.npmjs.com/org/localmode',
    'https://localmode.dev',
    process.env.WIKIDATA_ENTITY_URL,
    process.env.NEXT_PUBLIC_TWITTER_URL,
  ].filter((v): v is string => Boolean(v));
}

const organizationNode = {
  '@type': 'Organization',
  '@id': `${BASE}/#organization`,
  name: 'LocalMode',
  url: BASE,
  logo: `${BASE}/icon.svg`,
  description: 'Local-first, privacy-first AI that runs entirely in the browser.',
  sameAs: orgSameAs(),
};

/** The homepage @graph: Organization + WebSite + SoftwareApplication. */
export function homepageGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode,
      {
        '@type': 'WebSite',
        '@id': `${BASE}/#website`,
        name: 'LocalMode UI',
        url: BASE,
        description: DESCRIPTION,
        publisher: { '@id': `${BASE}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${BASE}/#software`,
        name: 'LocalMode UI',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web Browser',
        description: DESCRIPTION,
        url: BASE,
        softwareLicense: 'https://opensource.org/licenses/MIT',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@id': `${BASE}/#organization` },
        publisher: { '@id': `${BASE}/#organization` },
      },
    ],
  };
}

/** One crumb: a visible label and an absolute-or-relative path. */
export interface Crumb {
  name: string;
  /** Path (e.g. `/blocks`) or absolute URL. */
  item: string;
}

/** BreadcrumbList JSON-LD from an ordered crumb list (paths resolved against BASE). */
export function breadcrumbGraph(crumbs: Crumb[], pageUrl: string) {
  const abs = (p: string) => (p.startsWith('http') ? p : `${BASE}${p}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${abs(pageUrl)}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.item),
    })),
  };
}

/** FAQPage JSON-LD from a Q/A list (caller must only emit when non-empty). */
export function faqGraph(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Per-block SoftwareApplication (each block is a free, browser-run tool). */
export function blockSoftwareApp(opts: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${BASE}${opts.path}#software`,
    name: `${opts.title} — LocalMode`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web Browser',
    description: opts.description,
    url: `${BASE}${opts.path}`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isAccessibleForFree: true,
    author: { '@id': `${BASE}/#organization` },
  };
}
