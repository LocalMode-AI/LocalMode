import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { icons } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const tree = {
    ...source.pageTree,
    children: [
      ...source.pageTree.children,
      { type: 'separator' as const, name: 'Resources' },
      {
        type: 'page' as const,
        name: 'llms-full.txt',
        url: '/llms-full.txt',
        external: true,
        icon: createElement(icons.FileText),
      },
    ],
  };

  return (
    <DocsLayout
      tree={tree}
      {...baseOptions()}
      sidebar={{
        collapsible: true,
      }}
    >
      {children}
    </DocsLayout>
  );
}
