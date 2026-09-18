/**
 * @file layout.tsx
 * @description Layout for the public /bench section — wraps the benchmark
 * pages in the shared site nav (HomeLayout) for consistency with /blocks.
 */
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';

export default async function BenchLayout({ children }: { children: ReactNode }) {
  return <HomeLayout {...(await baseOptions())}>{children}</HomeLayout>;
}
