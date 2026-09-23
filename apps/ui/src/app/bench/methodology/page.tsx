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
            Protocol <code className="rounded bg-muted px-1 font-mono text-sm">localmode-bench/5</code>.
            Any change to prompts, budgets, policy numbers, or integrity rules bumps this version;
            archived runs are never re-scored silently. The reference implementation is the
            open-source <code className="rounded bg-muted px-1 font-mono text-sm">@localmode/bench</code>{' '}
            package - every definition below is executable code, and every published statistic is
            recomputed server-side from each submission&apos;s raw trace. The changelog at the bottom
            of this page records what each version changed and why.
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
              <strong className="text-foreground">Stream coherence</strong> - TTFT, decode, and
              prefill rates are derived only when every timed iteration&apos;s chunk trace is
              genuinely incremental: at least two non-empty chunks whose visible span covers at
              least 20% of the request wall time. Some runtime
              surfaces compute the whole generation and flush every chunk in a terminal burst
              (observed on LiteRT-LM: 128 chunks inside 0.8&nbsp;ms of a 30&nbsp;s request);
              deriving decode timing from such a trace would report an artifact, so those lanes
              report the end-to-end rate instead, marked <em>e2e</em>.
            </li>
            <li>
              <strong className="text-foreground">End-to-end rate</strong> - total generated
              characters over the full request wall time (prefill and decode conflated), reported
              for every generation lane. It is the only rate lanes with non-incremental streams
              can honestly claim.
            </li>
            <li>
              <strong className="text-foreground">Prefill (pp128 / pp512)</strong> - approximate
              prompt tokens over TTFT, on fixed public prompts (llama-bench naming).
            </li>
            <li>
              <strong className="text-foreground">Model load</strong> - the provider&apos;s
              preload path, cold (cache probe false) vs warm (probe true) reported separately.
              This is download-to-cache for wllama, and download plus a first engine/session
              initialization (then released) for WebLLM, LiteRT, and Transformers.js, so load
              alone is not comparable across runtimes. The untimed warmup that follows
              records first-inference readiness (engine init, shader/JIT compilation) as its own
              number; cold start = load + warmup is the cross-runtime comparable figure. The
              warm-reload cell repeats the preload path against a populated cache, so for wllama it
              times the cache probe and its <code className="font-mono text-sm">offloadedLayers</code>{' '}
              stays &quot;unreported&quot; (llama.cpp loads in the warmup). Chrome
              Built-in AI is the exception: Chrome downloads Gemini Nano once, browser-wide, and
              only from a user activation, so the Run click starts that download while the other
              lanes run; the lane is recorded cold in that case and its load phase measures the
              remaining wait, not the whole download.
            </li>
            <li>
              <strong className="text-foreground">Embeddings</strong> - single-query latency
              (median) and batch-32 throughput reported separately; WASM can win at batch 1 while
              losing at scale, so one number would mislead.
            </li>
            <li>
              <strong className="text-foreground">Memory</strong> -{' '}
              <code className="font-mono text-sm">performance.measureUserAgentSpecificMemory()</code>{' '}
              deltas at protocol points (baseline → post-load → post-run, plus a failure-time
              sample on error cells), Chromium-only, never inside a timed region.
            </li>
          </ul>
        </Section>

        <Section id="policy" title="Run policy">
          <ul className="list-disc space-y-2 pl-5">
            <li>Per cell (runtime × model × workload): 1 untimed warmup, then 3 timed runs (5 in the thorough suite).</li>
            <li>
              Watchdog: a load that reports no progress for 3 minutes, a generation that streams
              nothing for 2 minutes, or a call that outlives its absolute budget (10 to 15 minutes
              per iteration, 30 to 45 per quality lane) is aborted as a timeout; the cell is retried
              once with the failed attempt kept on the cell, then recorded as an error, and the run
              continues. Nothing is retried silently. An abort a runtime raises on its own (a
              WebGPU buffer that can no longer be mapped, a failed fetch) is an error with its
              cause and the same single retry, never a cancellation: only the submitter&apos;s
              Cancel ends a run, and it ends it at once. The Transformers.js WASM lane runs in a
              dedicated worker so the page stays responsive during inference.
            </li>
            <li>
              Hidden tab: browsers throttle background tabs (timers, process priority, GPU work; iOS
              can suspend the tab), so a timed iteration the tab was hidden during measures the
              browser&apos;s scheduling, not the runtime. It is set aside on the cell, the runner waits
              up to 10 minutes for the tab to be visible again, and the iteration is repeated (twice
              at most); a tab that stays hidden leaves the cell invalid with the reason. Iterations
              never start while the tab is hidden.
            </li>
            <li>Performance runs use temperature 0, a 128-token generation budget, and fixed public prompts.</li>
            <li>
              Every runtime receives the fixed prompt as a single user turn through its own chat
              template; runtime-native templating is part of what is measured. Cross-request
              prompt/KV caching is disabled where a runtime enables it by default (wllama&apos;s
              <code className="font-mono text-sm"> cache_prompt</code>), so each timed iteration
              pays prefill - with the cache on, a repeated prompt&apos;s TTFT fell from 1,018&nbsp;ms
              to 24&nbsp;ms from the second iteration.
            </li>
            <li>
              A timed iteration that generates fewer than 16 characters is gated as degenerate
              output (an instruct model answering with EOS has no decode phase to time) and the
              cell is marked invalid rather than scored.
            </li>
            <li>
              Deterministic runtime execution order: transformers-wasm, transformers-webgpu,
              chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama. Fixing the order makes
              runs reproducible (runtime interleaving is not a confounder) and runs the WASM-arena
              runtimes before the multi-gigabyte-heap runtimes; it is a reproducibility measure,
              not a correctness fix. The Transformers.js WASM lane runs before its WebGPU lane
              because Transformers.js serializes every ONNX session creation on one promise chain
              that never catches a rejection: the first session that fails to create (a WebGPU
              execution provider the browser cannot initialize, an allocation failure under memory
              pressure) fails every later Transformers.js session in the page with the same error,
              which is how an iPhone on iOS 18 lost both Transformers.js lanes to one WebGPU error.
            </li>
            <li>5–10&nbsp;s cool-down after every model group that ran (5&nbsp;s quick, 8&nbsp;s standard, 10&nbsp;s thorough; a group whose cells were all skipped pays none); on Chromium the next group also waits for CPU pressure to recover (15&nbsp;s cap in quick, 30&nbsp;s otherwise).</li>
            <li>
              A screen wake lock is held; timed regions overlapping a hidden tab, a wake-lock
              release, or a GPU device loss are invalidated and recorded - never silently retried.
            </li>
            <li>
              Quality-fidelity lane (optional, untimed): tinyMMLU accuracy and STS-B Spearman at
              temperature 0 - these measure whether a runtime&apos;s build of the weights reproduces
              expected outputs, not model capability. MMLU items use a 48-token budget; reasoning
              blocks (<code className="font-mono text-sm">&lt;think&gt;</code>) are stripped before
              answer parsing; pairings that ship thinking-mode builds carry a fixed no-think prompt
              suffix applied identically to every runtime of that pairing; raw per-item outputs and
              the parse rate are stored so every score is auditable and recomputable. Unparsed
              items count as wrong, and the parse rate is shown beside the score: a low parse rate
              marks a format-limited result (a build that reasons out loud past the budget), not
              low fidelity.
            </li>
          </ul>
        </Section>

        <Section id="stats" title="Statistics">
          <p>
            Per metric: median headline; mean ± SD, IQR, and a Student-t 95% confidence interval in
            the payload. A coefficient of variation above 5% marks the cell high-variance. Geometric
            means are used only within one device&apos;s run; the leaderboard shows the median of
            per-submission medians and marks any (device, runtime, model, workload) group with fewer
            than 3 submissions provisional. Devices group by what the browser discloses, at two
            levels: the coarse class is the platform plus the WebGPU adapter&apos;s vendor and
            architecture (<code className="font-mono text-sm">macos/apple-metal-3</code>,{' '}
            <code className="font-mono text-sm">windows/amd-rdna-2</code>, or{' '}
            <code className="font-mono text-sm">no-webgpu</code>), which every browser can supply
            and which is the unit for cross-device rollups; the subclass splits a class by the GPU
            model where the browser names a specific part (
            <code className="font-mono text-sm">macos/apple-m1-pro</code>,{' '}
            <code className="font-mono text-sm">android/adreno-650</code>) and equals the class
            where it names nothing more specific (Safari&apos;s &quot;Apple GPU&quot;, a
            generation-less &quot;AMD Radeon(TM) Graphics&quot;, Firefox&apos;s masked
            &quot;..., or similar&quot; buckets). Leaderboard rows are subclass rows; the class is
            shown beneath. Nothing typed by a submitter enters either. Rows never mix protocol
            versions: every row carries the version its runs were measured under, and the
            leaderboard shows the current protocol and the previous one side by side (v5 beside v4,
            because v5 changed only the llama.cpp lanes and every other lane measures identically).
            Older archived runs stay in the dataset and never enter a leaderboard row.
          </p>
        </Section>

        <Section id="environment" title="Environment capture">
          <p>
            Every run records what the browser discloses about the device, whether or not the
            leaderboard uses it yet, so later analyses never depend on a field that was not kept.
            Chromium reports UA Client Hints (platform, version, architecture, bitness, model, form
            factors); Firefox and Safari freeze their user-agent strings by design, so their OS
            versions are recorded as unknown rather than guessed, and the raw user-agent string is
            kept verbatim for future parsers. That now includes iPhones: Safari 27 on iOS 27
            advertises &quot;iPhone OS 18_7&quot; (WebKit froze the token there, as macOS froze at
            10_15_7), so a Safari or Firefox for iOS run whose token reads 18_7 under a Safari
            version of 26 or higher is recorded as unknown, while Chrome for iOS still writes the
            real version. The form factor (phone, tablet, desktop) is derived
            from the hints, the user agent, and touch points. WebGPU adapter identity comes from{' '}
            <code className="font-mono text-sm">adapter.info</code> together with the adapter&apos;s
            feature list and limits; the WebGL renderer string is kept as a second GPU identity
            channel and parsed into a GPU model (for example &quot;Apple M4&quot; or &quot;NVIDIA
            GeForce RTX 4070&quot;). Core counts and device memory are recorded but labeled clamped
            (browsers cap or randomize them: Chrome reports memory as a bucket capped at 8 GB on
            Android and older desktop builds and at 32 GB on current desktop builds, so the value
            is a floor, never the size; Safari clamps core counts); the JavaScript heap ceiling, storage quota, battery
            state, CPU pressure support, network type, display and locale tag are captured where the
            APIs exist. The WebAssembly proposal matrix (SIMD, relaxed SIMD, threads,
            exceptions, GC, memory64, tail calls, JSPI and the rest) is probed by validating
            canonical modules, and the availability of every API the runtimes depend on (WebGPU,
            WebNN, OPFS, Cache API, workers, Chrome Built-in AI) is recorded as a presence check.
            The harness stamps the exact versions of the runtime packages it bundled (and wllama&apos;s
            CDN pin), per run and per cell. The resolved execution backend (WebGPU vs WASM vs CPU)
            is probed, never assumed from the request.
          </p>
          <p>
            What a public run file does not carry (schema 3): the time zone, UTC offset and
            calendar (they place a device in a city), the language list, the exact battery
            percentage and time-to-full (they track a device across runs; the level is kept to the
            quarter, and whether it is charging), display preferences such as color scheme, the
            submission nonce, and the submitter&apos;s network address, which the server uses only
            as a rate-limit key and never writes down. A file published before schema 3 that
            carried any of these was rewritten without them and carries{' '}
            <code className="font-mono text-sm">scrubbedAt</code> with a recomputed digest.
          </p>
        </Section>

        <Section id="integrity" title="Submission integrity">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Verified-tier runs happen on this site and carry a server-issued, time-boxed session
              nonce that accepts exactly one submission (a second upload under the same nonce is
              refused; reloading the page issues a new one). Submissions are limited to 20 per hour
              per network address; a refused upload is retried by the page after the wait the
              server states, and nothing about the run is lost in between.
            </li>
            <li>
              Submissions contain the raw per-chunk timestamp trace and the full generated text;
              the server recomputes every statistic from the trace and rejects client summaries
              that disagree.
            </li>
            <li>
              Versioned plausibility rules: timestamp monotonicity, decode-rate and end-to-end-rate
              envelopes by model size, text/chunk-length agreement, stream-coherence gating of
              TTFT/decode claims, rejection of an ok cell whose timed iteration generated fewer
              than 16 characters (the degenerate-output gate, re-checked server-side), MMLU score
              recomputation from the stored raw outputs, timer-quantization-grid conformance,
              environment cross-field consistency,
              software/virtual-renderer detection (a GPU-lane result from a SwiftShader/WARP-class
              adapter is rejected - cloud VMs report CPU numbers as GPU numbers), and a mandatory
              deterministic matmul calibration (at least 600&nbsp;ms of single-threaded f32
              matmuls) whose recorded throughput must fall within silicon reality.
            </li>
            <li>
              Flagged runs are quarantined publicly (hidden from charts, never deleted). The entire
              dataset - verified and quarantined - is an open GitHub repository anyone can audit.
            </li>
            <li>
              Residual limits, stated honestly: we cannot detect background native load, virtual
              machines, or browser flags; the min-3-submissions rule and median-of-medians limit
              their influence. Memory is the other edge: a standard suite peaks near 9&nbsp;GB of
              browser memory and a thorough suite above 8&nbsp;GB, so on a 16&nbsp;GB machine with
              other applications open the Transformers.js lanes (one shared ONNX Runtime WASM heap
              per page, which never shrinks) can fail session creation with{' '}
              <code className="font-mono text-sm">std::bad_alloc</code>, after which every later
              Transformers.js cell in that run fails too. Those cells are recorded as errors with
              their cause and a failure-time memory sample, never as data.
            </li>
            <li>
              Known device limitation: on the Galaxy Z Fold 7 (Adreno 830, Chrome 153 on Android)
              the llama.cpp WebGPU lane (<code className="font-mono text-sm">wllama-webgpu</code>)
              generates incoherent SmolLM2 text. All 18 timed chat iterations recorded on that phone
              across six runs and three protocol versions are strings of isolated letters and word
              fragments, and the lane&apos;s MMLU cell fails in every run with &quot;Invalid typed
              array length&quot;. The WASM lane and every other runtime on the same phone produce
              coherent text, and no other device in the dataset shows this. The degenerate-output
              gate is length-based and 17 of the 18 iterations pass it, so those cells are ok and
              the adreno-830 <code className="font-mono text-sm">wllama-webgpu</code> SmolLM2 chat
              rows (about 60 chars/s under v4 and v5, plus a v2 adreno-830 llama.cpp row from before
              the lane split) are kept: they time a backend that is not producing a usable answer.
              The generated text of every iteration is stored in the run files, so anyone can check
              it. An output-coherence check would be a protocol change and is reserved for a future
              version.
            </li>
          </ul>
        </Section>

        <Section id="changelog" title="Protocol changelog">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">localmode-bench/5</strong> (2026-09-22) - the
              llama.cpp lanes request half the browser&apos;s logical thread count (at least two)
              instead of all of it, and load with a 2,048-token context. Under v4 the CPU lane asked
              for every logical thread, and on hybrid and SMT processors a pool that spans the
              efficiency cores or the second hardware threads runs at half speed with high variance:
              natively on an M1 Pro, tg128 was 178 ± 42 tokens/s at 10 threads against 395 ± 16 at
              8, and in the browser the M4 Max&apos;s 16-thread pool decoded a third as fast as the
              M1 Pro&apos;s 10. The browser exposes no core topology, so half the logical count is
              the rule; it lands on the performance or physical cores on every lab device, and both
              the requested count and the pool the runtime built are recorded on the cell. The
              context change sizes the KV cache to what the workloads need (at most about 700
              tokens) instead of the provider&apos;s 8,192 default, which matters most for the
              3.46 GB Gemma 4 E2B GGUF inside the CPU lane&apos;s 4 GB wasm heap. It does not
              rescue that lane&apos;s Gemma quality cell: with the weights resident, the per-request
              state allocation still fails (<code className="font-mono text-sm">std::bad_alloc</code>)
              and the cell is recorded as an error, as it was under v4. Every other lane measures
              exactly as under v4, so the leaderboard shows v4 rows beside v5 rows; nothing is
              re-scored.
            </li>
            <li>
              <strong className="text-foreground">localmode-bench/4</strong> (2026-09-20) - the
              llama.cpp lanes load every language model as text only. The wllama provider attaches
              the vision projector its catalog lists for Gemma 4 E2B, so under v3 both llama.cpp
              lanes loaded a 557 MB projector the text-only workloads never use: its download and
              CLIP warmup ran inside the untimed warmup, the provider turned wllama&apos;s model
              cache off for the two-file source (so the warmup and the warm reload re-downloaded
              the 3.46 GB weights), and on the CPU lane the pair did not fit the 4 GB wasm heap,
              which failed the three Gemma 4 E2B cells on every Thorough run. v4 loads the language
              model alone (<code className="font-mono text-sm">runtimeConfig.mmproj: false</code>);
              the other pairings measure exactly as under v3, and the version is bumped so that no
              leaderboard row mixes the two configurations.
            </li>
            <li>
              <strong className="text-foreground">localmode-bench/3</strong> (2026-09-20) - the
              wllama lane is split in two. Under v2 the lane was documented and recorded as
              llama.cpp on the CPU (WASM), but wllama 3.5 offloads every layer to WebGPU by
              default whenever the browser exposes it, and llama.cpp&apos;s own load log on those
              runs reads &quot;offloaded 31/31 layers to GPU&quot;: every v2 wllama cell measured on a
              WebGPU-capable browser is a llama.cpp-WebGPU number labelled &quot;wasm&quot;, and
              its comparison against the Transformers.js WASM lane was GPU against CPU. v3 pins
              the <code className="font-mono text-sm">wllama</code> lane to the CPU (n_gpu_layers 0)
              and adds <code className="font-mono text-sm">wllama-webgpu</code> (every layer
              offloaded) over the same GGUF files; every cell now carries a{' '}
              <code className="font-mono text-sm">runtimeConfig</code> with the thread count, the
              GPU layers requested, and llama.cpp&apos;s offload report, and the recorded backend
              follows that report, not the request. Archived v2 runs remain published as v2; read
              their wllama cells as WebGPU wherever{' '}
              <code className="font-mono text-sm">environment.gpu.available</code> is true.
            </li>
            <li>
              <strong className="text-foreground">localmode-bench/2</strong> (2026-09-19) - from
              three real-Chrome thorough-suite pilots; the third ran all 51 cells green. (1)
              Stream-coherence gating - LiteRT-LM&apos;s surface flushed all chunks in a terminal
              burst, which v1 scored as a 693,902 chars/s decode rate (correctly quarantined by
              the envelope rule); v2 derives TTFT/decode only from incremental streams and reports
              the end-to-end rate otherwise. (2) Quality lane rebuilt - the 8-token budget scored
              thinking-mode builds (Qwen3) at 0 for format reasons, not fidelity; now a 48-token
              budget, reasoning-block stripping, uniform per-pairing no-think suffixes, stored raw
              outputs, server-side recomputation, and a surfaced parse rate. (3) Degenerate-output
              gate. (4) Uniform user-turn contract with cross-request prompt caching disabled
              (wllama&apos;s prompt-KV reuse had cut repeated-prompt TTFT 40x). (5) A
              deterministic runtime execution order for reproducibility (not a correctness fix:
              the Transformers.js failures that motivated it were primarily a session leak in the
              provider&apos;s preload path, fixed in @localmode/transformers 4.1.2, independent of
              order; the shared ONNX Runtime heap itself remains fragile under memory pressure, see
              Residual limits). Archived
              v1 runs remain published as v1 and are never re-scored.
            </li>
            <li>
              <strong className="text-foreground">localmode-bench/1</strong> (2026-09-18) - initial
              public protocol.
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
