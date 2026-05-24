import Link from 'next/link';
import { tasks } from '@/lib/source';
import type { Metadata } from 'next';
import { BlogCategories } from '../blog-categories';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export const metadata: Metadata = {
  title: 'Browser AI Tasks & Capabilities | LocalMode',
  description:
    'Learn how to run AI tasks entirely in the browser. Guides for embeddings, classification, translation, summarization, and more.',
  alternates: {
    canonical: `${baseUrl}/blog/tasks`,
  },
  openGraph: {
    title: 'Browser AI Tasks & Capabilities | LocalMode',
    description:
      'Learn how to run AI tasks entirely in the browser. Guides for embeddings, classification, translation, summarization, and more.',
    type: 'website',
    url: `${baseUrl}/blog/tasks`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browser AI Tasks & Capabilities | LocalMode',
    description:
      'Learn how to run AI tasks entirely in the browser. Guides for embeddings, classification, translation, summarization, and more.',
  },
};

export default function TasksIndex() {
  const pages = tasks.getPages().sort((a, b) => {
    const titleA = (a.data.title as string).toLowerCase();
    const titleB = (b.data.title as string).toLowerCase();
    return titleA.localeCompare(titleB);
  });

  return (
    <main className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">Browser AI Tasks & Capabilities</h1>
      <p className="text-fd-muted-foreground mb-12">
        Learn how to run AI tasks entirely in the browser. Guides for
        embeddings, classification, translation, summarization, and more.
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
