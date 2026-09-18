/**
 * @file page.tsx
 * @description The versioned LocalMode Bench protocol, documented for citation:
 * metric definitions, run policy, environment capture, statistics, and the
 * integrity rules applied to community submissions.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';
import { ogImageUrl } from '@/lib/og';

const TITLE = 'LocalMode Bench methodology';
const DESCRIPTION =
  'The versioned protocol behind the browser AI leaderboard: metric definitions (TTFT, pp/tg throughput), run policy, statistics, environment capture, and submission integrity rules.';

export const metadata: Metadata = {
  title: `${TITLE} - LocalMode UI`,
  description: DESCRIPTION,
  alternates: { canonical: '/bench/methodology' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/bench/methodology',
    type: 'article',
    images: [ogImageUrl({ title: 'Methodology', description: 'The LocalMode Bench protocol.' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [ogImageUrl({ title: 'Methodology', description: 'The LocalMode Bench protocol.' })],
  },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function BenchMethodologyPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <JsonLd
        data={breadcrumbGraph(
          [
            { name: 'Home', item: '/' },
            { name: 'Bench', item: '/bench' },
            { name: 'Methodology', item: '/bench/methodology' },
          ],
          '/bench/methodology',
        )}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 [&_p]:text-pretty [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p>
            Protocol <code className="rounded bg-muted px-1 font-mono text-sm">localmode-bench/1</code>.
            Any change to prompts, budgets, policy numbers, or integrity rules bumps this version;
            archived runs are never re-scored silently. The reference implementation is the
            open-source <code className="rounded bg-muted px-1 font-mono text-sm">@localmode/bench</code>{' '}
            package - every definition below is executable code, and every published statistic is
            recomputed server-side from each submission&apos;s raw trace.
          </p>
        </div>

        <Section id="metrics" title="Metric definitions">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">TTFT</strong> - wall-clock time from requesting the
              stream to the first non-empty chunk, measured with{' '}
              <code className="font-mono text-sm">performance.now()</code> on a cross-origin-isolated
              page (5&nbsp;µs timer resolution on Chromium). Browser TTFT includes tokenization,
              prefill, the first decode step, and runtime scheduling.
            </li>
            <li>
              <strong className="text-foreground">Decode throughput (tg128)</strong> - characters
              after the first chunk divided by the time between the first and last chunk; the first
              token is excluded (the MLPerf Client TPS definition), and rates derive from endpoint
              timestamps, never averaged per-token deltas (which sit at timer quantization).
              Chars/sec is the headline (tokenizer-independent); exact tokens/sec is computed
              post-hoc from the stored generated text.
            </li>
            <li>
              <strong className="text-foreground">Prefill (pp128 / pp512)</strong> - approximate
              prompt tokens over TTFT, on fixed public prompts (llama-bench naming).
            </li>
            <li>
              <strong className="text-foreground">Model load</strong> - the provider&apos;s
              download/cache phase, cold (cache probe false) vs warm (probe true) reported
              separately. The untimed warmup that follows absorbs and records first-inference
              readiness (engine init, shader/JIT compilation) as its own number - cold start ={' '}
              load + warmup.
            </li>
            <li>
              <strong className="text-foreground">Embeddings</strong> - single-query latency
              (median) and batch-32 throughput reported separately; WASM can win at batch 1 while
              losing at scale, so one number would mislead.
            </li>
            <li>
              <strong className="text-foreground">Memory</strong> -{' '}
              <code className="font-mono text-sm">performance.measureUserAgentSpecificMemory()</code>{' '}
              deltas at protocol points (baseline → post-load → post-run), Chromium-only, never
              inside a timed region.
            </li>
          </ul>
        </Section>

        <Section id="policy" title="Run policy">
          <ul className="list-disc space-y-2 pl-5">
            <li>Per cell (runtime × model × workload): 1 untimed warmup, then 3 timed runs (5 in the thorough suite).</li>
            <li>Performance runs use temperature 0, a 128-token generation budget, and fixed public prompts.</li>
            <li>8–10&nbsp;s cool-down between model groups; on Chromium the next group also waits for CPU pressure to recover (30&nbsp;s cap).</li>
            <li>
              A screen wake lock is held; timed regions overlapping a hidden tab, a wake-lock
              release, or a GPU device loss are invalidated and recorded - never silently retried.
            </li>
            <li>
              Quality-fidelity lane (optional, untimed): tinyMMLU accuracy and STS-B Spearman at
              temperature 0 - these measure whether a runtime&apos;s build of the weights reproduces
              expected outputs, not model capability.
            </li>
          </ul>
        </Section>

        <Section id="stats" title="Statistics">
          <p>
            Per metric: median headline; mean ± SD, IQR, and a Student-t 95% confidence interval in
            the payload. A coefficient of variation above 5% marks the cell high-variance. Geometric
            means are used only within one device&apos;s run; the leaderboard shows the median of
            per-submission medians and marks any (device, runtime, model, workload) group with fewer
            than 3 submissions provisional.
          </p>
        </Section>

        <Section id="environment" title="Environment capture">
          <p>
            Chromium reports UA Client Hints (platform, version, architecture, model); Firefox and
            Safari freeze their user-agent strings by design, so their OS versions are recorded as
            unknown rather than guessed. WebGPU adapter identity comes from{' '}
            <code className="font-mono text-sm">adapter.info</code>; core counts and device memory
            are recorded but labeled clamped (browsers cap or randomize them). Battery charging
            state and CPU pressure are captured where the APIs exist. The resolved execution
            backend (WebGPU vs WASM vs CPU) is probed, never assumed from the request.
          </p>
        </Section>

        <Section id="integrity" title="Submission integrity">
          <ul className="list-disc space-y-2 pl-5">
            <li>Verified-tier runs happen on this site and carry a server-issued, time-boxed session nonce.</li>
            <li>
              Submissions contain the raw per-chunk timestamp trace and the full generated text;
              the server recomputes every statistic from the trace and rejects client summaries
              that disagree.
            </li>
            <li>
              Versioned plausibility rules: timestamp monotonicity, decode-rate envelopes by model
              size, text/chunk-length agreement, timer-quantization-grid conformance, environment
              cross-field consistency, software/virtual-renderer detection (a GPU-lane result from
              a SwiftShader/WARP-class adapter is rejected - cloud VMs report CPU numbers as GPU
              numbers), and a mandatory ~1&nbsp;s deterministic matmul calibration check whose throughput
              must be plausible for the claimed rates.
            </li>
            <li>
              Flagged runs are quarantined publicly (hidden from charts, never deleted). The entire
              dataset - verified and quarantined - is an open GitHub repository anyone can audit.
            </li>
            <li>
              Residual limits, stated honestly: we cannot detect background native load, virtual
              machines, or browser flags; the min-3-submissions rule and median-of-medians limit
              their influence.
            </li>
          </ul>
        </Section>

        <Section id="reproduce" title="Reproduce it">
          <p>
            The harness is MIT-licensed. Run the suite at{' '}
            <Link className="underline underline-offset-2" href="/bench/run">
              /bench/run
            </Link>
            , export the raw JSON, or wire your own runtimes into{' '}
            <code className="rounded bg-muted px-1 font-mono text-sm">@localmode/bench</code> - the
            adapter interface takes any model exposing a streaming generation method. Aggregation
            and CSV tooling for analysis ship in the same package.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
