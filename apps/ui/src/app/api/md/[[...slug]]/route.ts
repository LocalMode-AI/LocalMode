/**
 * @file route.ts
 * @description Per-page raw-markdown route. Serves any docs page as markdown at
 * `/api/md/<slug>` (e.g. `/api/md/conversation/message`), reusing the same
 * `getLLMText` pipeline that backs `llms-full.txt`. Backs each docs page's
 * "View as Markdown" action and lets agents fetch a single page's content.
 */
import { getLLMText, source } from '@/lib/source';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  const page = source.getPage(slug ?? []);
  if (!page) notFound();

  const text = await getLLMText(page);
  return new Response(text, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
