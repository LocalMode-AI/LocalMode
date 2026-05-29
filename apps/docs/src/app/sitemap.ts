import type { MetadataRoute } from 'next';
import { source, blog, models, tasks, compare, useCases, compatibility } from '@/lib/source';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = source.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  const posts = blog.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const taskEntries = tasks.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const modelEntries = models.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const compareEntries = compare.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const useCaseEntries = useCases.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const compatibilityEntries = compatibility.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: page.data.dateModified
      ? new Date(page.data.dateModified as string)
      : new Date(page.data.date as string),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    ...docs,
    ...posts,
    ...taskEntries,
    ...modelEntries,
    ...compareEntries,
    ...useCaseEntries,
    ...compatibilityEntries,
  ];
}
