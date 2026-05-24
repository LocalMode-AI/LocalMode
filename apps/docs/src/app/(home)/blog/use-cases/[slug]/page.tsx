import { notFound } from 'next/navigation';
import Link from 'next/link';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { getMDXComponents } from '@/mdx-components';
import { useCases } from '@/lib/source';
import type { Metadata } from 'next';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export default async function UseCasePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const page = useCases.getPage([params.slug]);

  if (!page) notFound();
  const MDX = page.data.body;

  const dateISO = new Date(page.data.date as string).toISOString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.data.title,
    description: page.data.description,
    datePublished: dateISO,
    dateModified: dateISO,
    author: {
      '@type': 'Organization',
      name: 'LocalMode',
      url: baseUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'LocalMode',
      url: baseUrl,
    },
    url: `${baseUrl}${page.url}`,
    image: `${baseUrl}/og/blog/use-cases/${page.slugs[0]}`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${baseUrl}${page.url}`,
    },
  };

  return (
    <article className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <Link
        href="/blog/use-cases"
        className="text-sm text-fd-muted-foreground hover:text-fd-primary mb-8 inline-block"
      >
        &larr; Back to Use Cases
      </Link>
      <header className="mb-12">
        <h1 className="text-3xl font-bold mb-3">{page.data.title}</h1>
        <p className="text-fd-muted-foreground mb-4">{page.data.description}</p>
        <div className="flex items-center gap-3 text-sm text-fd-muted-foreground">
          <time dateTime={dateISO}>
            {new Date(page.data.date as string).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </div>
      </header>
      <InlineTOC items={page.data.toc} />
      <div className="prose prose-fd min-w-0 mt-8">
        <MDX components={getMDXComponents()} />
      </div>
    </article>
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = useCases.getPage([params.slug]);

  if (!page) notFound();

  const ogImage = `${baseUrl}/og/blog/use-cases/${page.slugs[0]}`;
  const dateISO = new Date(page.data.date as string).toISOString();

  return {
    title: `${page.data.title} | AI Use Case | LocalMode`,
    description: page.data.description,
    alternates: {
      canonical: `${baseUrl}${page.url}`,
    },
    ...(page.data.noindex && {
      robots: { index: false, follow: false },
    }),
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'article',
      publishedTime: dateISO,
      modifiedTime: dateISO,
      url: `${baseUrl}${page.url}`,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: page.data.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      images: [ogImage],
    },
  };
}

export function generateStaticParams(): { slug: string }[] {
  return useCases.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}
