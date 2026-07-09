/**
 * @file og.ts
 * @description Builds the per-page social-share image URL served by /api/og.
 * Returned relative; Next resolves it against `metadataBase` (https://localmode.ai)
 * into the absolute `og:image` / `twitter:image` a crawler needs.
 */
export interface OgParams {
  /** Big headline (page/block/doc title). */
  title: string;
  /** Optional supporting line. */
  description?: string;
  /** Small eyebrow above the title. @default "localmode.ai" */
  eyebrow?: string;
}

/** `/api/og?title=…&desc=…&eyebrow=…` for use in `openGraph.images` / `twitter.images`. */
export function ogImageUrl({ title, description, eyebrow }: OgParams): string {
  const p = new URLSearchParams({ title });
  if (description) p.set('desc', description);
  if (eyebrow) p.set('eyebrow', eyebrow);
  return `/api/og?${p.toString()}`;
}

/** The default site OG image (homepage / any page without its own). */
export const DEFAULT_OG = ogImageUrl({
  title: 'Local-first AI UI components',
  description: 'Copy-owned React components and installable blocks that run real models in the browser.',
});
