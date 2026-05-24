'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const categories = [
  { href: '/blog', label: 'Articles', description: 'Guides & insights' },
  { href: '/blog/models', label: 'Models', description: 'Browser AI models' },
  { href: '/blog/tasks', label: 'Tasks', description: 'AI capabilities' },
  { href: '/blog/compare', label: 'Comparisons', description: 'Tool comparisons' },
  { href: '/blog/use-cases', label: 'Use Cases', description: 'Industry solutions' },
  { href: '/blog/compatibility', label: 'Compatibility', description: 'Browser support' },
];

export function BlogCategories() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/blog') return pathname === '/blog';
    return pathname.startsWith(href);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-12">
      {categories.map((cat) => (
        <Link
          key={cat.href}
          href={cat.href}
          className={`rounded-lg border p-3 text-center transition-colors ${
            isActive(cat.href)
              ? 'border-fd-primary bg-fd-primary/10 text-fd-primary'
              : 'border-fd-border hover:bg-fd-accent/50'
          }`}
        >
          <p className="font-semibold text-sm">{cat.label}</p>
          <p className={`text-xs ${isActive(cat.href) ? 'text-fd-primary/70' : 'text-fd-muted-foreground'}`}>
            {cat.description}
          </p>
        </Link>
      ))}
    </div>
  );
}
