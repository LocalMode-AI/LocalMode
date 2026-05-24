import { tasks } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<'/og/blog/tasks/[slug]'>,
) {
  const { slug } = await params;
  const page = tasks.getPage([slug]);
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      site="Task Reference | LocalMode.dev"
    />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return tasks.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}
