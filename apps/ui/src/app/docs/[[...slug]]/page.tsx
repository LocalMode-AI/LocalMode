import { getLLMText, source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { PageActions } from '@/components/page-actions';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';
import { ogImageUrl } from '@/lib/og';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdown = await getLLMText(page);
  const slug = params.slug ?? [];
  const markdownUrl = `/api/md${slug.length ? `/${slug.join('/')}` : ''}`;

  const breadcrumb = breadcrumbGraph(
    page.url === '/docs'
      ? [{ name: 'Home', item: '/' }, { name: 'Docs', item: '/docs' }]
      : [
          { name: 'Home', item: '/' },
          { name: 'Docs', item: '/docs' },
          { name: page.data.title, item: page.url },
        ],
    page.url,
  );

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <JsonLd data={breadcrumb} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <PageActions markdown={markdown} markdownUrl={markdownUrl} />
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: `${baseUrl}${page.url}`,
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'article',
      url: `${baseUrl}${page.url}`,
      siteName: 'LocalMode UI',
      locale: 'en_US',
      images: [ogImageUrl({ title: page.data.title, description: page.data.description, eyebrow: 'LocalMode Docs' })],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      images: [ogImageUrl({ title: page.data.title, description: page.data.description, eyebrow: 'LocalMode Docs' })],
    },
  };
}
