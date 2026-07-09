/**
 * @file legacy-redirects.ts
 * @description Single source of truth for the 34 legacy slug → block redirects.
 * This module is imported by BOTH `next.config.mjs`'s `redirects()` (emitting
 * `permanent: true` entries) AND the redirect-walk E2E spec
 * (`e2e/redirects/legacy-slugs.spec.ts`), so the deployed config and the test
 * that verifies it cannot drift.
 *
 * Retired app `apps/showcase-nextjs` served 34 slugs at `localmode.ai/<slug>`;
 * each is permanently redirected to the `/blocks/<name>` route that absorbed its
 * functionality. There is deliberately NO catch-all `/:slug` entry — an unknown
 * legacy path 404s naturally rather than shadowing a real blocks-app route.
 */

/** One legacy slug and the block route that absorbed it. */
export interface LegacyRedirect {
  /** Legacy slug served at `localmode.ai/<slug>` (no leading slash). */
  slug: string;
  /** Absorbing block route, e.g. `"/blocks/chat"` (leading slash, no trailing). */
  blockPath: string;
}

/**
 * The 34-entry legacy-slug → block map. Grouped by absorbing block for
 * readability; order is not significant to the redirect behavior.
 *
 * Absorption tally: chat 1 + knowledge-base 7 + audio-studio 4 + vision-lab 2 +
 * image-studio 3 + photo-search 4 + text-insights 3 + writing-tools 4 +
 * agent-structured-data 2 + privacy-vault 2 + device-model-lab 2 = 34.
 */
export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // chat (1)
  { slug: 'llm-chat', blockPath: '/blocks/chat' },

  // knowledge-base (7)
  { slug: 'semantic-search', blockPath: '/blocks/knowledge/semantic-search' },
  { slug: 'qa-bot', blockPath: '/blocks/knowledge/document-qa' },
  { slug: 'pdf-search', blockPath: '/blocks/knowledge/semantic-search' },
  { slug: 'invoice-qa', blockPath: '/blocks/knowledge/document-qa' },
  { slug: 'ocr-scanner', blockPath: '/blocks/knowledge/semantic-search' },
  { slug: 'langchain-rag', blockPath: '/blocks/knowledge/rag-chat' },
  { slug: 'data-migrator', blockPath: '/blocks/knowledge/vector-data-manager' },

  // audio-studio (4)
  { slug: 'voice-notes', blockPath: '/blocks/audio/voice-notes' },
  { slug: 'meeting-assistant', blockPath: '/blocks/audio/meeting-assistant' },
  { slug: 'voice-studio', blockPath: '/blocks/audio/voice-explorer' },
  { slug: 'audiobook-creator', blockPath: '/blocks/audio/audiobook-reader' },

  // vision-lab (2)
  { slug: 'object-detector', blockPath: '/blocks/vision/object-detector' },
  { slug: 'mediapipe-studio', blockPath: '/blocks/vision/live-tracker' },

  // image-studio (3)
  { slug: 'background-remover', blockPath: '/blocks/image-studio/background-remover' },
  { slug: 'photo-enhancer', blockPath: '/blocks/image-studio/image-enhancer' },
  { slug: 'image-captioner', blockPath: '/blocks/image-studio/image-captioner' },

  // photo-search (4)
  { slug: 'smart-gallery', blockPath: '/blocks/photo/smart-gallery' },
  { slug: 'duplicate-finder', blockPath: '/blocks/photo/duplicate-finder' },
  { slug: 'cross-modal-search', blockPath: '/blocks/photo/image-search' },
  { slug: 'product-search', blockPath: '/blocks/photo/image-search' },

  // text-insights (3)
  { slug: 'sentiment-analyzer', blockPath: '/blocks/text-insights/sentiment-analyzer' },
  { slug: 'email-classifier', blockPath: '/blocks/text-insights/text-classifier' },
  { slug: 'model-evaluator', blockPath: '/blocks/text-insights/model-evaluator' },

  // writing-tools (4)
  { slug: 'smart-writer', blockPath: '/blocks/writing-tools/write' },
  { slug: 'translator', blockPath: '/blocks/writing-tools/translate' },
  { slug: 'smart-autocomplete', blockPath: '/blocks/writing-tools/complete' },
  { slug: 'text-summarizer', blockPath: '/blocks/writing-tools/summarize' },

  // agent-structured-data (2)
  { slug: 'research-agent', blockPath: '/blocks/agents/research-agent' },
  { slug: 'data-extractor', blockPath: '/blocks/agents/data-extractor' },

  // privacy-vault (2)
  { slug: 'document-redactor', blockPath: '/blocks/privacy/pii-redactor' },
  { slug: 'encrypted-vault', blockPath: '/blocks/privacy/encrypted-vault' },

  // device-model-lab (2)
  { slug: 'model-advisor', blockPath: '/blocks/device/model-advisor' },
  { slug: 'gguf-explorer', blockPath: '/blocks/device/gguf-explorer' },
];

/**
 * One renamed category route: old `/blocks/<from>` → new `/blocks/<to>`.
 * @see CATEGORY_RENAMES
 */
export interface CategoryRename {
  /** Old category/block route segment, e.g. `"knowledge-base"` (no slashes). */
  from: string;
  /** New category route segment it was renamed to, e.g. `"knowledge"`. */
  to: string;
}

/**
 * Renamed-category 308 redirect table. Consumed by `next.config.mjs`'s
 * `redirects()` alongside {@link LEGACY_REDIRECTS} — this is the single source
 * shared with the redirect-walk E2E spec so config and test cannot drift.
 *
 * When a category is renamed (e.g. `knowledge-base → knowledge`, `photo-search →
 * photo`), its `{ from, to }` entry here produces a `permanent: true` 308 from
 * the old route to the new one.
 */
export const CATEGORY_RENAMES: CategoryRename[] = [
  // privacy-vault split into pii-redactor + encrypted-vault under the renamed
  // `privacy` category page.
  { from: 'privacy-vault', to: 'privacy' },
  // vision-lab renamed to the `vision` category page (Detect + Track split into
  // object-detector + live-tracker; Audio + Language regrouped to `audio`/`text`).
  // The old `/blocks/vision → /blocks/vision-lab` redirect was removed in
  // next.config.mjs so this reverse 308 does not loop.
  { from: 'vision-lab', to: 'vision' },
  // knowledge-base → knowledge (four self-sufficient knowledge blocks) and
  // photo-search → photo (four self-sufficient photo blocks). The legacy
  // `/blocks/rag` chain re-points to `/blocks/knowledge` in next.config.mjs so
  // that reverse 308 does not loop through knowledge-base.
  { from: 'knowledge-base', to: 'knowledge' },
  { from: 'photo-search', to: 'photo' },
  // agent-structured-data → agents (research-agent + data-extractor) and
  // device-model-lab → device (device-report + model-advisor + gguf-explorer).
  // Each emits a `/blocks/<from>` 308 → `/blocks/<to>`.
  { from: 'agent-structured-data', to: 'agents' },
  { from: 'device-model-lab', to: 'device' },
  // The flat `audio-studio` category dissolves into the `audio` category (five
  // blocks join the regrouped audio-classifier), so `/blocks/audio-studio`
  // 308 → `/blocks/audio`. The legacy `/blocks/voice` chain re-points from
  // `/blocks/audio-studio` to `/blocks/audio` in next.config.mjs so that reverse
  // 308 does not loop.
  { from: 'audio-studio', to: 'audio' },
];
