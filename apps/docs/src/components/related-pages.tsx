/**
 * @file related-pages.tsx
 * @description Reusable component for rendering internal links to related pages
 */

interface RelatedPageLink {
  title: string;
  url: string;
  type: 'Model' | 'Task' | 'Comparison' | 'Use Case' | 'Compatibility' | 'Blog';
}

interface RelatedPagesProps {
  links: RelatedPageLink[];
}

export function RelatedPages({ links }: RelatedPagesProps) {
  if (links.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-fd-border">
      <h2 className="text-xl font-semibold mb-4">Related Pages</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            className="flex items-center gap-3 rounded-lg border border-fd-border p-3 hover:bg-fd-accent/50 transition-colors"
          >
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-fd-primary/10 text-fd-primary whitespace-nowrap">
              {link.type}
            </span>
            <span className="text-sm text-fd-foreground">{link.title}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
