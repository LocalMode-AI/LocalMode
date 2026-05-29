import { notFound } from 'next/navigation';
import Link from 'next/link';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { getMDXComponents } from '@/mdx-components';
import { models } from '@/lib/source';
import type { Metadata } from 'next';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

function getRelatedModels(currentSlug: string, limit = 3) {
  const allPages = models.getPages().sort((a, b) => {
    return new Date(b.data.date as string).getTime() - new Date(a.data.date as string).getTime();
  });
  return allPages.filter((p) => p.slugs[0] !== currentSlug).slice(0, limit);
}

export default async function ModelPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const page = models.getPage([params.slug]);

  if (!page) notFound();
  const MDX = page.data.body;

  const dateISO = new Date(page.data.date as string).toISOString();
  const modifiedISO = page.data.dateModified
    ? new Date(page.data.dateModified as string).toISOString()
    : dateISO;
  const faqItems = page.data.faq;
  const related = getRelatedModels(params.slug);

  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: page.data.title,
      description: page.data.description,
      datePublished: dateISO,
      dateModified: modifiedISO,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web Browser',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: {
        '@type': 'Organization',
        name: 'LocalMode',
        url: baseUrl,
      },
      url: `${baseUrl}${page.url}`,
      image: `${baseUrl}/og/blog/models/${page.slugs[0]}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${baseUrl}/blog` },
        { '@type': 'ListItem', position: 3, name: 'Models', item: `${baseUrl}/blog/models` },
        { '@type': 'ListItem', position: 4, name: page.data.title, item: `${baseUrl}${page.url}` },
      ],
    },
  ];

  jsonLd.push({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['article > header > h1', 'article > header > p'],
    },
  });

  if (faqItems.length > 0) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    });
  }

  return (
    <article className="flex-1 w-full max-w-[900px] mx-auto px-6 py-16">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <nav aria-label="Breadcrumb" className="text-sm text-fd-muted-foreground mb-8">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-fd-primary transition-colors">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/blog" className="hover:text-fd-primary transition-colors">Blog</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/blog/models" className="hover:text-fd-primary transition-colors">Models</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-fd-foreground truncate max-w-[300px]" aria-current="page">{page.data.title}</li>
        </ol>
      </nav>
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
          {page.data.dateModified && (
            <>
              <span>·</span>
              <span>Updated <time dateTime={modifiedISO}>
                {new Date(page.data.dateModified as string).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time></span>
            </>
          )}
        </div>
      </header>
      <InlineTOC items={page.data.toc} />
      <div className="prose prose-fd min-w-0 mt-8">
        <MDX components={getMDXComponents()} />
      </div>
      {faqItems.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-6">Frequently Asked Questions</h2>
          <dl className="space-y-6">
            {faqItems.map((item, i) => (
              <div key={i}>
                <dt className="font-medium text-fd-foreground">{item.question}</dt>
                <dd className="mt-2 text-fd-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {related.length > 0 && (
        <aside className="mt-16 pt-8 border-t border-fd-border">
          <h2 className="text-xl font-semibold mb-6">More Models</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((post) => (
              <Link key={post.url} href={post.url} className="group block rounded-lg border border-fd-border p-4 transition-colors hover:bg-fd-accent/50">
                <h3 className="text-sm font-medium group-hover:text-fd-primary transition-colors line-clamp-2">{post.data.title}</h3>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </article>
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = models.getPage([params.slug]);

  if (!page) notFound();

  const ogImage = `${baseUrl}/og/blog/models/${page.slugs[0]}`;
  const dateISO = new Date(page.data.date as string).toISOString();
  const modifiedISO = page.data.dateModified
    ? new Date(page.data.dateModified as string).toISOString()
    : dateISO;

  return {
    title: `${page.data.title} | Browser AI Model | LocalMode`,
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
      modifiedTime: modifiedISO,
      siteName: 'LocalMode',
      locale: 'en_US',
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
  return models.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}
