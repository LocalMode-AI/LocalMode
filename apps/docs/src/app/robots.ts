import type { MetadataRoute } from 'next';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ['ChatGPT-User', 'OAI-SearchBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot'],
        allow: '/',
      },
      {
        userAgent: ['GPTBot', 'Google-Extended', 'CCBot', 'anthropic-ai', 'Bytespider', 'Diffbot', 'Applebot-Extended', 'Meta-ExternalAgent', 'cohere-ai'],
        disallow: '/',
      },
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
