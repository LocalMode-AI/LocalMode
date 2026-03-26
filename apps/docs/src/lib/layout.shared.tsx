import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { createElement } from 'react';
import { BookOpen, Newspaper } from 'lucide-react';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-bold text-lg tracking-tight">
          <span className="text-fd-primary">Local</span>
          <span>Mode</span>
        </span>
      ),
    },
    links: [
      {
        text: 'Docs',
        url: '/docs',
        icon: createElement(BookOpen),
      },
      {
        text: 'Blog',
        url: '/blog',
        icon: createElement(Newspaper),
      },
      {
        text: 'GitHub',
        url: 'https://github.com/LocalMode-AI/LocalMode',
        external: true,
      },
      {
        text: 'Demo Apps',
        url: 'https://LocalMode.ai',
        external: true,
      },
    ],
    githubUrl: 'https://github.com/LocalMode-AI/LocalMode',
  };
}
