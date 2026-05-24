import Link from 'next/link';
import { models } from '@/lib/source';
import type { Metadata } from 'next';
import { BlogCategories } from '../blog-categories';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export const metadata: Metadata = {
  title: 'AI Models for the Browser | LocalMode',
  description:
    'Explore AI models optimized for in-browser inference. Compare size, speed, accuracy, and browser compatibility for local-first ML.',
  alternates: {
    canonical: `${baseUrl}/blog/models`,
  },
  openGraph: {
    title: 'AI Models for the Browser | LocalMode',
    description:
      'Explore AI models optimized for in-browser inference. Compare size, speed, accuracy, and browser compatibility for local-first ML.',
    type: 'website',
    url: `${baseUrl}/blog/models`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Models for the Browser | LocalMode',
    description:
      'Explore AI models optimized for in-browser inference. Compare size, speed, accuracy, and browser compatibility for local-first ML.',
  },
};

export default function ModelsIndex() {
  const pages = models.getPages().sort((a, b) => {
    const titleA = (a.data.title as string).toLowerCase();
    const titleB = (b.data.title as string).toLowerCase();
    return titleA.localeCompare(titleB);
  });

  return (
    <main className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">AI Models for the Browser</h1>
      <p className="text-fd-muted-foreground mb-12">
        Explore AI models optimized for in-browser inference. Compare size,
        speed, accuracy, and browser compatibility for local-first ML.
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
