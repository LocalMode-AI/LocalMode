import { compatibility } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<'/og/blog/compatibility/[slug]'>,
) {
  const { slug } = await params;
  const page = compatibility.getPage([slug]);
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      site="Compatibility | LocalMode.dev"
    />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return compatibility.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}
