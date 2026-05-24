/**
 * @file page.tsx
 * @description Entry point for the Model Advisor application
 */
'use client';

import dynamic from 'next/dynamic';

const AdvisorView = dynamic(() => import('./_components/advisor-view').then((m) => ({ default: m.AdvisorView })), { ssr: false });

/** Model Advisor page component */
export default function ModelAdvisorPage() {
  return <AdvisorView />;
}
