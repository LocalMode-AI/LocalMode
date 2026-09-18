/**
 * @file page.tsx
 * @description The /bench/run page - server shell (metadata + breadcrumbs)
 * around the client BenchRunner. No model bytes move until the user presses
 * Run inside the runner.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';
import { ogImageUrl } from '@/lib/og';
import { BenchRunner } from '@/components/bench/bench-runner';

const TITLE = 'Run LocalMode Bench on your device';
const DESCRIPTION =
  'Benchmark browser AI runtimes on your own hardware - WebLLM, wllama, Transformers.js, LiteRT, Chrome Built-in AI - and submit your run to the open leaderboard.';

export const metadata: Metadata = {
  title: `${TITLE} - LocalMode UI`,
  description: DESCRIPTION,
  alternates: { canonical: '/bench/run' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/bench/run',
    type: 'website',
    images: [ogImageUrl({ title: 'Run LocalMode Bench', description: 'Benchmark your browser.' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [ogImageUrl({ title: 'Run LocalMode Bench', description: 'Benchmark your browser.' })],
  },
};

export default function BenchRunPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <JsonLd
        data={breadcrumbGraph(
          [
            { name: 'Home', item: '/' },
            { name: 'Bench', item: '/bench' },
            { name: 'Run', item: '/bench/run' },
          ],
          '/bench/run',
        )}
      />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="max-w-3xl text-pretty text-muted-foreground">
            Pick a suite, keep the tab visible, and press Run. Models download once (they cache for
            next time), the protocol runs warmups and timed iterations per the{' '}
            <Link className="underline underline-offset-2" href="/bench/methodology">
              published methodology
            </Link>
            , and when the run completes the result publishes automatically to the{' '}
            <Link className="underline underline-offset-2" href="/bench">
              public leaderboard
            </Link>{' '}
            (switch publishing off to keep a run local; you can always export the raw JSON).
          </p>
        </div>
        <BenchRunner />
      </main>
      <SiteFooter />
    </div>
  );
}
