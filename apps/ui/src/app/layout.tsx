import { RootProvider } from 'fumadocs-ui/provider/next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { DEFAULT_OG } from '@/lib/og';
import { SuppressOrtWarnings } from '@/components/suppress-ort-warnings';
import { SWRegistrar } from '@/components/sw-registrar';
import { SpeculationRules } from '@/components/speculation-rules';

const inter = Inter({
  subsets: ['latin'],
});

const TITLE = 'LocalMode UI - Local-First AI Components';
const DESCRIPTION =
  'A shadcn-style registry of copy-owned, composable AI UI components for the browser, plus installable blocks that run real models on-device. Local-first, privacy-first. Install with the shadcn CLI.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai'),
  title: {
    default: TITLE,
    template: '%s',
  },
  description: DESCRIPTION,
  applicationName: 'LocalMode UI',
  keywords: [
    'shadcn',
    'registry',
    'ui components',
    'local-first',
    'AI',
    'privacy',
    'offline',
    'react',
    'browser ai',
    'webgpu',
    'on-device ai',
    'localmode',
  ],
  authors: [{ name: 'LocalMode', url: 'https://github.com/LocalMode-AI/LocalMode' }],
  creator: 'LocalMode',
  publisher: 'LocalMode',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LocalMode',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'LocalMode UI',
    locale: 'en_US',
    images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: 'LocalMode UI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [DEFAULT_OG],
  },
  // Env-gated: these render only when the tokens are provided (seo.md §2.7 / §20.1).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {/* Filters known-harmless ORT/LiteRT WASM console noise (module-eval side effect). */}
        <SuppressOrtWarnings />
        <RootProvider>{children}</RootProvider>
        {/* PWA + perf, mounted once site-wide. */}
        <SWRegistrar />
        <SpeculationRules />
        {/* Vercel-only: both scripts are served from `/_vercel/*` by Vercel's
            edge. Outside Vercel (a local `next start`, a self-hosted build) they
            404 and every page logs two MIME-type console errors. */}
        {process.env.VERCEL_ENV ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
