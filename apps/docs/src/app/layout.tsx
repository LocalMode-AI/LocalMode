import { RootProvider } from 'fumadocs-ui/provider/next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { DEFAULT_OG } from '@/lib/og';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev'),
  title: 'LocalMode.dev - Local-First AI for the Web',
  description:
    'Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision, and LLMs - all locally in the browser.',
  keywords: [
    'local-first',
    'AI',
    'privacy',
    'offline',
    'vector database',
    'embeddings',
    'machine learning',
    'browser',
    'rag',
    'classification',
    'vision',
    'llms',
    'local-mode',
    'local-first',
    'local-first-ai',
  ],
  authors: [{ name: 'LocalMode' }],
  alternates: {
    types: {
      'application/rss+xml': [
        { title: 'LocalMode Blog', url: '/blog/rss.xml' },
      ],
    },
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'LocalMode.dev - Local-First AI for the Web',
    description:
      'Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision, and LLMs - all locally in the browser.',
    type: 'website',
    siteName: 'LocalMode',
    locale: 'en_US',
    images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: 'LocalMode.dev' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LocalMode.dev - Local-First AI for the Web',
    description:
      'Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision, and LLMs - all locally in the browser.',
    images: [DEFAULT_OG],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <script type="speculationrules">
          {JSON.stringify({
            prerender: [{ where: { href_matches: ['/docs/*', '/blog/*'] }, eagerness: 'moderate' }],
            prefetch: [{ where: { href_matches: '/*' }, eagerness: 'conservative' }],
          })}
        </script>
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
