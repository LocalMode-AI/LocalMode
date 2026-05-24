/**
 * @file page.tsx
 * @description Entry point for the Product Search application
 */
'use client';

import dynamic from 'next/dynamic';

const CatalogView = dynamic(() => import('./_components/catalog-view').then((m) => ({ default: m.CatalogView })), { ssr: false });

/** Product Search page component */
export default function ProductSearchPage() {
  return <CatalogView />;
}
