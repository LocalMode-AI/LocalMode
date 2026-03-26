import { Feed } from 'feed';
import { blog } from '@/lib/source';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export function getRSS() {
  const feed = new Feed({
    title: 'LocalMode Blog',
    id: `${baseUrl}/blog`,
    link: `${baseUrl}/blog`,
    language: 'en',
    description:
      'Insights on local-first AI, browser ML, and privacy-first engineering.',
    copyright: `All rights reserved ${new Date().getFullYear()}, LocalMode`,
    favicon: `${baseUrl}/favicon.ico`,
  });

  const posts = blog.getPages().sort((a, b) => {
    const dateA = new Date(a.data.date as string).getTime();
    const dateB = new Date(b.data.date as string).getTime();
    return dateB - dateA;
  });

  for (const page of posts) {
    feed.addItem({
      id: page.url,
      title: page.data.title,
      description: page.data.description,
      link: `${baseUrl}${page.url}`,
      date: new Date(page.data.date as string),
      author: [
        {
          name: page.data.author,
        },
      ],
    });
  }

  return feed.rss2();
}
