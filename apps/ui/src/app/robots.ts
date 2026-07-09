import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

/**
 * Three-tier crawler policy (seo.md §6.1), kept in sync with /ai.txt
 * (Allow-Training: No, Allow-RAG/Inference: Yes):
 *  1. ALLOW retrieval/answer bots that cite sources (ChatGPT/Claude/Perplexity search).
 *  2. DISALLOW training-only crawlers.
 *  3. ALLOW traditional search crawlers; keep only the machine-only registry JSON
 *     (/r/) out of the index. NOTE: /api/ is intentionally NOT disallowed — the
 *     /api/og social-share images live there, and social scrapers (facebookexternalhit,
 *     Twitterbot, LinkedInBot) honor robots.txt, so blocking /api/ would break link
 *     previews. (/api/md + /api/blocks-md are clean page markdown, fine to crawl.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ['ChatGPT-User', 'OAI-SearchBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot'],
        allow: '/',
      },
      {
        userAgent: [
          'GPTBot',
          'Google-Extended',
          'CCBot',
          'anthropic-ai',
          'Bytespider',
          'Diffbot',
          'Applebot-Extended',
          'Meta-ExternalAgent',
          'cohere-ai',
        ],
        disallow: '/',
      },
      { userAgent: '*', allow: '/', disallow: ['/r/'] },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
