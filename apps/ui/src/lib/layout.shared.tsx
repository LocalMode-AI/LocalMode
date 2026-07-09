import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { createElement } from 'react';
import { BookOpen, Boxes, Play, Newspaper } from 'lucide-react';

const GITHUB_URL = 'https://github.com/LocalMode-AI/LocalMode';

/**
 * Shared nav/layout options. The GitHub icon is rendered from `githubUrl`; no
 * star count is shown.
 */
export async function baseOptions(): Promise<BaseLayoutProps> {
  const links: LinkItemType[] = [
    { text: 'Docs', url: '/docs', icon: createElement(BookOpen) },
    { text: 'Components', url: '/docs/components', icon: createElement(Boxes) },
    { text: 'Blocks', url: '/blocks', icon: createElement(Play) },
    { text: 'Blog', url: 'https://localmode.dev/blog', external: true, icon: createElement(Newspaper) },
    { text: 'Core Docs', url: 'https://localmode.dev/docs', external: true },
  ];

  return {
    nav: {
      title: (
        <span className="font-bold text-lg tracking-tight">
          <span className="text-fd-primary">Local</span>
          <span>Mode</span>
          <span className="text-fd-muted-foreground"> /ui</span>
        </span>
      ),
    },
    links,
    githubUrl: GITHUB_URL,
  };
}
