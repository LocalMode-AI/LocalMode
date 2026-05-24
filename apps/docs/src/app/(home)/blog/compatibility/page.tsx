import Link from 'next/link';
import { compatibility } from '@/lib/source';
import type { Metadata } from 'next';
import { BlogCategories } from '../blog-categories';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export const metadata: Metadata = {
  title: 'Browser Compatibility | LocalMode',
  description:
    'Browser compatibility guides for local AI features. Check WebGPU, WASM, IndexedDB, and Web Worker support across browsers and devices.',
  alternates: {
    canonical: `${baseUrl}/blog/compatibility`,
  },
  openGraph: {
    title: 'Browser Compatibility | LocalMode',
    description:
      'Browser compatibility guides for local AI features. Check WebGPU, WASM, IndexedDB, and Web Worker support across browsers and devices.',
    type: 'website',
    url: `${baseUrl}/blog/compatibility`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browser Compatibility | LocalMode',
    description:
      'Browser compatibility guides for local AI features. Check WebGPU, WASM, IndexedDB, and Web Worker support across browsers and devices.',
  },
};

export default function CompatibilityIndex() {
  const pages = compatibility.getPages().sort((a, b) => {
    const titleA = (a.data.title as string).toLowerCase();
    const titleB = (b.data.title as string).toLowerCase();
    return titleA.localeCompare(titleB);
  });

  return (
    <main className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">Browser Compatibility</h1>
      <p className="text-fd-muted-foreground mb-12">
        Browser compatibility guides for local AI features. Check WebGPU, WASM,
        IndexedDB, and Web Worker support across browsers and devices.
      </p>
      <BlogCategories />
      <div className="flex flex-col gap-8">
        {pages.map((page) => (
          <Link
            key={page.url}
            href={page.url}
            className="group block rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:bg-fd-accent/50"
          >
            <p className="text-sm text-fd-muted-foreground mb-2">
              {new Date(page.data.date as string).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-fd-primary transition-colors">
              {page.data.title}
            </h2>
            <p className="text-fd-muted-foreground text-sm">
              {page.data.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
