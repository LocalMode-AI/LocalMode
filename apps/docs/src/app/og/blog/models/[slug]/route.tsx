import { models } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<'/og/blog/models/[slug]'>,
) {
  const { slug } = await params;
  const page = models.getPage([slug]);
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      site="Model Guide | LocalMode.dev"
    />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return models.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}
