/**
 * @file category-map.ts
 * @description Single source of truth for the `/blocks` category structure:
 * which blocks live under which category, and how each block's canonical route
 * and registry item name are derived. Dependency-free (no imports) so the
 * gallery card catalog, the category-page host, and the canonical-route
 * mechanism can all consume it without coupling.
 *
 * Category scheme:
 *  - A category with exactly ONE block keeps the FLAT item name `ui/blocks/<slug>`
 *    and route `/blocks/<slug>` — no `<category>/<slug>` stutter. A single-block
 *    category's `/blocks/<slug>` doubles as the category page.
 *  - A category with N>1 blocks uses `ui/blocks/<category>/<slug>` items and
 *    `/blocks/<category>/<slug>` canonical routes, with `/blocks/<category>`
 *    hosting all N blocks (see {@link canonicalRoute}).
 *
 * Canonical route: the canonical deep route `/blocks/<category>/<block>` is
 * emitted ONLY for multi-block categories. Single-block (flat) categories have
 * NO deep route — their flat `/blocks/<slug>` IS the canonical page, and every
 * `/blocks/<name>` resolves with no redirect. Growing a category to N>1 adds the
 * real `src/app/blocks/<category>/<block>/page.tsx` route files, and every
 * derivation here (item name + route) flips to the deep form automatically.
 *
 * MULTI-BLOCK FILE-LAYOUT CONVENTION. When a category grows to N>1:
 *  - impl:          `src/app/blocks/<category>/<slug>/<slug>.tsx`
 *  - single page:   `src/app/blocks/<category>/<slug>/page.tsx` (canonical route —
 *                    a `BlockShell` over `readBlockSource('<category>/<slug>')`)
 *  - category page: `src/app/blocks/<category>/page.tsx` (a `CategoryShell` over
 *                    every block, each rendered in its own `BlockShellSection`)
 *  - `scripts/generate-block-source.ts` snapshots the nested impl under the key
 *    `<category>/<slug>` (flat blocks stay keyed by `<name>`).
 *  - flip the category's `blocks` array below from one entry to N and every
 *    derivation (item name, canonical route, category page) follows.
 */

/** One block within a category. `slug` is the last route/name segment. */
export interface CategoryBlock {
  /** Block slug — the final `/blocks/…/<slug>` and `ui/blocks/…/<slug>` segment. */
  slug: string;
  /** Human-readable block title (shown in its BlockShell + gallery card). */
  title: string;
}

/** A `/blocks` category: its id, display title, and member blocks. */
export interface BlockCategory {
  /** Category id — matches the `<category>` tag in `registry.json` `categories`. */
  category: string;
  /** Category display title (the `/blocks/<category>` page header). */
  title: string;
  /** Member blocks, in display order. Length 1 ⇒ flat single-block category. */
  blocks: CategoryBlock[];
  /**
   * Layout chrome with no gallery route/page (e.g. `devtools-drawer`, mounted by
   * the `/blocks` layout). Excluded from {@link routeServedCategories}.
   */
  chrome?: boolean;
}

/**
 * The category structure: the route-served categories plus the `devtools-drawer`
 * chrome. A flat single-block category has category id == block slug; multi-block
 * categories have a distinct category id.
 */
export const CATEGORY_MAP: readonly BlockCategory[] = [
  { category: 'chat', title: 'Chat', blocks: [{ slug: 'chat', title: 'Chat' }] },
  {
    // Renamed from knowledge-base to knowledge, its Ingest/Search/Ask/Data tabs
    // split into four self-sufficient blocks over the promoted useKnowledgeBase
    // engine layer. `/blocks/knowledge-base` 308-redirects to `/blocks/knowledge`
    // (CATEGORY_RENAMES); the legacy `/blocks/rag` chain re-points to
    // `/blocks/knowledge` (next.config.mjs).
    category: 'knowledge',
    title: 'Knowledge',
    blocks: [
      { slug: 'semantic-search', title: 'Semantic Search' },
      { slug: 'document-qa', title: 'Document QA' },
      { slug: 'rag-chat', title: 'RAG Chat' },
      { slug: 'vector-data-manager', title: 'Vector Data Manager' },
    ],
  },
  {
    // Renamed from vision-lab to vision, its Detect and Track tabs split into two
    // single-purpose blocks. `/blocks/vision-lab` 308-redirects to `/blocks/vision`
    // (CATEGORY_RENAMES); each block has its own `/blocks/vision/<slug>`. The Audio
    // + Language tabs REGROUP out of this category entirely (see the `audio` and
    // `text` categories below).
    category: 'vision',
    title: 'Vision',
    blocks: [
      { slug: 'object-detector', title: 'Object Detector' },
      { slug: 'live-tracker', title: 'Live Tracker' },
    ],
  },
  {
    // The dissolved audio-studio tabs become five self-sufficient blocks joining
    // the `audio` category alongside the audio-classifier block regrouped here
    // from vision-lab. The old flat `audio-studio` category is dissolved:
    // `/blocks/audio-studio` 308-redirects to `/blocks/audio` (CATEGORY_RENAMES)
    // and the legacy `/blocks/voice` chain re-points to `/blocks/audio`
    // (next.config.mjs).
    category: 'audio',
    title: 'Audio',
    blocks: [
      { slug: 'voice-notes', title: 'Voice Notes' },
      { slug: 'live-transcription', title: 'Live Transcription' },
      { slug: 'meeting-assistant', title: 'Meeting Assistant' },
      { slug: 'voice-explorer', title: 'Voice Explorer' },
      { slug: 'audiobook-reader', title: 'Audiobook Reader' },
      { slug: 'audio-classifier', title: 'Audio Classifier' },
    ],
  },
  {
    // The vision-lab Language tab REGROUPED into a standalone `text` category
    // (NOT merged into text-insights). Deep-routed (category id `text` ≠ slug
    // `language-detector`).
    category: 'text',
    title: 'Text',
    blocks: [{ slug: 'language-detector', title: 'Language Detector' }],
  },
  {
    // Renamed from device-model-lab to the `device` category, its three stacked
    // sections split into three single-purpose blocks. `/blocks/device-model-lab`
    // 308-redirects to `/blocks/device` (CATEGORY_RENAMES); each block has its own
    // `/blocks/device/<slug>`. All three are zero-download (browser-API detection
    // + ~4KB Range-read GGUF inspection only).
    category: 'device',
    title: 'Device',
    blocks: [
      { slug: 'device-report', title: 'Device Report' },
      { slug: 'model-advisor', title: 'Model Advisor' },
      { slug: 'gguf-explorer', title: 'GGUF Explorer' },
    ],
  },
  {
    // Multi-block category: the tabbed four-tab writing surface split into four
    // single-purpose blocks. Category name UNCHANGED (no rename redirect);
    // `/blocks/writing-tools` is the category page, each block has its own
    // `/blocks/writing-tools/<slug>`.
    category: 'writing-tools',
    title: 'Writing Tools',
    blocks: [
      { slug: 'write', title: 'Write' },
      { slug: 'translate', title: 'Translate' },
      { slug: 'summarize', title: 'Summarize' },
      { slug: 'complete', title: 'Complete' },
    ],
  },
  {
    // Renamed from agent-structured-data to the `agents` category, its two modes
    // split into two self-sufficient blocks — each owning its OWN WebLLM load
    // (same default model id ⇒ browser-cache-shared download, separate in-memory
    // instances). `/blocks/agent-structured-data` 308-redirects to `/blocks/agents`
    // (CATEGORY_RENAMES); each block has its own `/blocks/agents/<slug>`.
    category: 'agents',
    title: 'Agents',
    blocks: [
      { slug: 'research-agent', title: 'Research Agent' },
      { slug: 'data-extractor', title: 'Data Extractor' },
    ],
  },
  {
    // Multi-block category: the tabbed four-mode analysis workbench split into
    // four single-purpose blocks. Category name UNCHANGED (no rename redirect);
    // `/blocks/text-insights` is the category page, each block has its own
    // `/blocks/text-insights/<slug>`.
    category: 'text-insights',
    title: 'Text Insights',
    blocks: [
      { slug: 'sentiment-analyzer', title: 'Sentiment Analyzer' },
      { slug: 'text-classifier', title: 'Text Classifier' },
      { slug: 'model-evaluator', title: 'Model Evaluator' },
      { slug: 'threshold-calibrator', title: 'Threshold Calibrator' },
    ],
  },
  {
    // Renamed from photo-search to photo, its Gallery/Search/Duplicates/Categories
    // tabs split into four self-sufficient blocks, each over its OWN
    // usePhotoLibrary instance (same CLIP id ⇒ browser-cache-shared download).
    // `/blocks/photo-search` 308-redirects to `/blocks/photo` (CATEGORY_RENAMES).
    category: 'photo',
    title: 'Photo',
    blocks: [
      { slug: 'smart-gallery', title: 'Smart Gallery' },
      { slug: 'image-search', title: 'Image Search' },
      { slug: 'duplicate-finder', title: 'Duplicate Finder' },
      { slug: 'photo-categorizer', title: 'Photo Categorizer' },
    ],
  },
  {
    // Multi-block category: the tabbed image-studio tool-switcher split into three
    // single-purpose blocks. `/blocks/image-studio` is the category page; each
    // block has its own `/blocks/image-studio/<slug>`.
    category: 'image-studio',
    title: 'Image Studio',
    blocks: [
      { slug: 'background-remover', title: 'Background Remover' },
      { slug: 'image-enhancer', title: 'Image Enhancer' },
      { slug: 'image-captioner', title: 'Image Captioner' },
    ],
  },
  {
    // Renamed from privacy-vault to privacy. The tabbed two-tab surface split into
    // two blocks; `/blocks/privacy-vault` 308-redirects to `/blocks/privacy`
    // (CATEGORY_RENAMES).
    category: 'privacy',
    title: 'Privacy',
    blocks: [
      { slug: 'pii-redactor', title: 'PII Redactor' },
      { slug: 'encrypted-vault', title: 'Encrypted Vault' },
    ],
  },
  // Layout chrome — mounted by the /blocks layout host, no gallery route.
  {
    category: 'devtools-drawer',
    title: 'DevTools Drawer',
    blocks: [{ slug: 'devtools-drawer', title: 'DevTools Drawer' }],
    chrome: true,
  },
];

/** Look up a category by its id. */
export function getCategory(category: string): BlockCategory | undefined {
  return CATEGORY_MAP.find((c) => c.category === category);
}

/** Find the category that contains a given block slug. */
export function getCategoryOf(slug: string): BlockCategory | undefined {
  return CATEGORY_MAP.find((c) => c.blocks.some((b) => b.slug === slug));
}

/** Categories that have a public gallery route (chrome excluded). */
export function routeServedCategories(): BlockCategory[] {
  return CATEGORY_MAP.filter((c) => !c.chrome);
}

/**
 * True when a category uses flat names/routes: exactly one block AND that
 * block's slug equals the category id (e.g. `chat`/`chat`). A single-block
 * category whose id differs from its slug (a regrouped category seeded with one
 * block, e.g. `audio`/`audio-classifier`, `text`/`language-detector`) is DEEP:
 * it keeps the `<category>/<slug>` item name + `/blocks/<category>/<slug>` route
 * so those stay stable as more blocks are added. Backward-compatible for every
 * flat category (all have slug === category id).
 */
export function isFlatCategory(category: BlockCategory): boolean {
  return category.blocks.length === 1 && category.blocks[0].slug === category.category;
}

/**
 * Pure item-name derivation for a `(category, slug)` pair — flat categories →
 * `<slug>`, multi-block → `<category>/<slug>`. Exported (independent of
 * {@link CATEGORY_MAP}) so the N>1 route mechanism is testable with a synthetic
 * multi-block fixture.
 */
export function itemNameFor(category: BlockCategory, slug: string): string {
  return isFlatCategory(category) ? slug : `${category.category}/${slug}`;
}

/** Pure `/blocks/…` route derivation for a `(category, slug)` pair. */
export function routeFor(category: BlockCategory, slug: string): string {
  return `/blocks/${itemNameFor(category, slug)}`;
}

/**
 * The registry item name segment after `ui/blocks/` for a block slug:
 * flat categories → `<slug>`, multi-block categories → `<category>/<slug>`.
 * Returns the bare slug for unknown slugs (defensive; treated as flat).
 */
export function blockItemName(slug: string): string {
  const cat = getCategoryOf(slug);
  if (!cat) return slug;
  return itemNameFor(cat, slug);
}

/**
 * Canonical `/blocks/…` route for a block slug: `/blocks/<slug>` for flat
 * single-block categories, `/blocks/<category>/<slug>` for multi-block ones.
 */
export function canonicalRoute(slug: string): string {
  const cat = getCategoryOf(slug);
  return cat ? routeFor(cat, slug) : `/blocks/${slug}`;
}

/** Category page route: `/blocks/<category>`. */
export function categoryRoute(category: string): string {
  return `/blocks/${category}`;
}
