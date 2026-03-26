import Link from 'next/link';
import { blog } from '@/lib/source';
import type { Metadata } from 'next';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export const metadata: Metadata = {
  title: 'Blog | LocalMode',
  description:
    'Insights on local-first AI, browser ML, and privacy-first engineering.',
  alternates: {
    canonical: `${baseUrl}/blog`,
  },
  openGraph: {
    title: 'Blog | LocalMode',
    description:
      'Insights on local-first AI, browser ML, and privacy-first engineering.',
    type: 'website',
    url: `${baseUrl}/blog`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | LocalMode',
    description:
      'Insights on local-first AI, browser ML, and privacy-first engineering.',
  },
};

export default function BlogIndex() {
  const posts = blog.getPages().sort((a, b) => {
    const dateA = new Date(a.data.date as string).getTime();
    const dateB = new Date(b.data.date as string).getTime();
    return dateB - dateA;
  });

  return (
    <main className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">Blog</h1>
      <p className="text-fd-muted-foreground mb-12">
        Insights on local-first AI, browser ML, and privacy-first engineering.
      </p>
      <div className="flex flex-col gap-8">
        {posts.map((post) => (
          <Link
            key={post.url}
            href={post.url}
            className="group block rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:bg-fd-accent/50"
          >
            <p className="text-sm text-fd-muted-foreground mb-2">
              {new Date(post.data.date as string).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {' · '}
              {post.data.author}
            </p>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-fd-primary transition-colors">
              {post.data.title}
            </h2>
            <p className="text-fd-muted-foreground text-sm">
              {post.data.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
