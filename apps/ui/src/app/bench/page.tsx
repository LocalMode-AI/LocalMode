/**
 * @file page.tsx
 * @description LocalMode Bench landing + public leaderboard. Aggregated rows come
 * from the open GitHub dataset (ISR, 5-minute revalidate); the page renders
 * fine with an empty dataset. Nothing model-related loads here.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';
import { ogImageUrl } from '@/lib/og';
import { BENCH_PROTOCOL_VERSION } from '@localmode/bench';
import { aggregateIndex, readIndex } from '@/lib/bench/store';
import { LeaderboardTable } from '@/components/bench/leaderboard-table';

const TITLE = 'LocalMode Bench - the browser AI leaderboard';
const DESCRIPTION =
  'An open, reproducible benchmark of LLM and embedding inference across browser ML runtimes - WebLLM, wllama, Transformers.js, LiteRT, Chrome Built-in AI. Run it on your device and submit to the public dataset.';

export const metadata: Metadata = {
  title: `${TITLE} - LocalMode UI`,
  description: DESCRIPTION,
  alternates: { canonical: '/bench' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/bench',
    type: 'website',
    images: [ogImageUrl({ title: 'LocalMode Bench', description: 'The browser AI leaderboard.' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [ogImageUrl({ title: 'LocalMode Bench', description: 'The browser AI leaderboard.' })],
  },
};

export const revalidate = 300;

export default async function BenchPage() {
  const repo = process.env.BENCH_GITHUB_REPO ?? null;
  const entries = repo ? await readIndex(repo, { next: { revalidate: 300 } }) : [];
  const rows = aggregateIndex(entries);
  // Count what the table aggregates: unflagged runs under the current protocol
  // (archived runs from earlier protocol versions stay in the dataset only).
  const verifiedRuns = entries.filter(
    (e) => !e.flagged && e.protocol === BENCH_PROTOCOL_VERSION,
  ).length;

  return (
    <div className="flex w-full flex-1 flex-col">
      <JsonLd
        data={breadcrumbGraph(
          [
            { name: 'Home', item: '/' },
            { name: 'Bench', item: '/bench' },
          ],
          '/bench',
        )}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">LocalMode Bench</h1>
          <p className="max-w-4xl text-pretty text-muted-foreground">
            One protocol, five browser AI runtimes, real devices.
          </p>
          <ul className="max-w-4xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Measures TTFT, decode throughput, and cold vs warm model loads for LLMs and
              embeddings.
            </li>
            <li>
              Runs the same weights family across WebLLM, wllama, Transformers.js (WebGPU and
              WASM), LiteRT, and Chrome Built-in AI.
            </li>
            <li>
              Every submission publishes its raw timing trace to the open dataset; every number
              here is recomputed from those traces.
            </li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/bench/run"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Run it on your device <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/bench/methodology"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Methodology
            </Link>
            {repo && (
              <a
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Open dataset
              </a>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-3" aria-label="Leaderboard">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Leaderboard</h2>
            <p className="text-sm text-muted-foreground">
              {verifiedRuns} verified submission{verifiedRuns === 1 ? '' : 's'} under{' '}
              {BENCH_PROTOCOL_VERSION} · medians of per-device medians · rows need 3+ submissions
              to leave provisional status
            </p>
          </div>
          <LeaderboardTable rows={rows} />
          {rows.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No submissions yet under the current protocol - be the first:{' '}
              <Link className="underline underline-offset-2" href="/bench/run">
                run the benchmark on your device
              </Link>
              .
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
