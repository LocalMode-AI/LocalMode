import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

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
  openGraph: {
    title: 'LocalMode.dev - Local-First AI for the Web',
    description:
      'Privacy-first AI utilities. Run embeddings, vector search, RAG, classification, vision, and LLMs - all locally in the browser.',
    type: 'website',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
