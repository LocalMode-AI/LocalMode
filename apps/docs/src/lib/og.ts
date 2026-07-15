/**
 * @file og.ts
 * @description Builds the per-page social-share image URL served by /api/og.
 * Returned relative; Next resolves it against `metadataBase` (https://localmode.dev)
 * into the absolute `og:image` / `twitter:image` a crawler needs.
 */
export interface OgParams {
  /** Big headline (page/doc/blog-post title). */
  title: string;
  /** Optional supporting line. */
  description?: string;
  /** Small eyebrow above the title. @default "localmode.dev" */
  eyebrow?: string;
}

/** `/api/og?title=…&desc=…&eyebrow=…` for use in `openGraph.images` / `twitter.images`. */
export function ogImageUrl({ title, description, eyebrow }: OgParams): string {
  const p = new URLSearchParams({ title });
  if (description) p.set('desc', description);
  if (eyebrow) p.set('eyebrow', eyebrow);
  return `/api/og?${p.toString()}`;
}

/**
 * The default site OG image (homepage / any page without its own).
 * Static brand cover in `public/`; resolved to an absolute URL via `metadataBase`.
 */
export const DEFAULT_OG = '/og-default.png';
