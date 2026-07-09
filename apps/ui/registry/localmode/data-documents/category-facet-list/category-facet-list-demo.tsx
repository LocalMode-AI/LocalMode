'use client';

import * as React from 'react';
import { CategoryFacetList } from './category-facet-list';

const COUNTS: Record<string, number> = {
  Privacy: 12,
  Security: 8,
  Performance: 5,
  Tutorials: 3,
};
const CATEGORIES = Object.keys(COUNTS);

/**
 * Demo for the CategoryFacetList component, used by the docs live preview.
 * Shows the vertical list and horizontal pill variants sharing one selection.
 * Re-click the active facet to deselect, or "All" to clear. Fully
 * presentational — no model download.
 */
export default function CategoryFacetListDemo() {
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">List variant</p>
        <CategoryFacetList
          categories={CATEGORIES}
          counts={COUNTS}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Pills variant</p>
        <CategoryFacetList
          variant="pills"
          categories={CATEGORIES}
          counts={COUNTS}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Selected: <span className="font-mono">{selected ?? 'All'}</span>
      </p>
    </div>
  );
}
