import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Navbar, NetworkMonitorScript } from './(home)/_components';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LocalMode.AI - Local-First AI Apps Showcase',
  description: 'Complete AI suite running 100% locally in your browser',
  keywords: [
    'local-first',
    'AI',
    'privacy',
    'offline',
    'vector database',
    'embeddings',
    'machine learning',
    'browser',
  ],
  authors: [{ name: 'LocalMode Team' }],
  openGraph: {
    title: 'LocalMode.AI - Local-First AI Apps Showcase',
    description: 'Complete AI suite running 100% locally in your browser',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <NetworkMonitorScript />
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
