# LocalMode Bench - deployment setup

The runner is fully client-side; only the leaderboard needs configuration.

## 1. The public results repository

The dataset lives at **https://github.com/LocalMode-AI/LocalMode-Bench**
(public, default branch `main` - the leaderboard reads
`raw.githubusercontent.com/<repo>/main/index/summary.json`, so the default
branch must stay `main`). It is scaffolded with:

```
README.md          # dataset description, integrity model, reproduce/analyze instructions
SCHEMA.md          # the BenchRunResult run-file schema + metric recompute definitions
CITATION.cff       # makes the dataset citable
LICENSE            # CC0 1.0 (public domain) for the data
.gitattributes     # run JSONs marked linguist-generated
runs/  quarantine/  index/
controls/          # control runs, filed by collect-control-runs.ts (section 9); never indexed
```

The submission API creates missing `runs/YYYY/MM/` paths on first write.

## 2. Create a fine-grained GitHub token

GitHub → Settings → Developer settings → Fine-grained tokens:
- Repository access: **only** the results repo
- Permissions: **Contents: Read and write** (nothing else)

## 3. Set the deployment env vars (Vercel → Project → Environment Variables)

| Var | Value |
| --- | --- |
| `BENCH_GITHUB_REPO` | `LocalMode-AI/LocalMode-Bench` |
| `BENCH_GITHUB_TOKEN` | the fine-grained token |
| `BENCH_NONCE_SECRET` | `openssl rand -hex 32` |

Behavior without them: `/bench` renders with an empty leaderboard, `/bench/run`
works fully (export JSON), and `POST /api/bench/submit` answers
`503 bench-store-unbound` - runs are never lost.

`BENCH_GITHUB_API_URL` (unset in production) points the store at another
GitHub-compatible REST endpoint instead of `https://api.github.com`. The bench
e2e spec uses it to run a bound `next start` against a local endpoint that
receives the commits, so the successful-upload path of the runner is driven
end to end without writing to a real repository.

Build-time stamps (no configuration needed): `next.config.mjs` resolves the
installed versions of the provider packages and the runtimes they wrap (plus
wllama's CDN pin) into `NEXT_PUBLIC_BENCH_RUNTIME_VERSIONS`, recorded on every
run as `harness.runtimeVersions`; the build commit comes from
`VERCEL_GIT_COMMIT_SHA` (set by Vercel), `GITHUB_SHA`, or `BENCH_BUILD_COMMIT`
and lands in `harness.commit`.

Rate limiting automatically uses the already-bound Upstash Redis
(`UPSTASH_REDIS_REST_URL/TOKEN` or `KV_REST_API_URL/TOKEN`) and degrades to an
in-instance window without it. The submit endpoint allows 20 submissions per
hour per client address (`SUBMIT_RATE_LIMIT` in `apps/ui/src/lib/bench/store.ts`;
rejected attempts count too), sized for several devices behind one NAT; a 429
carries `Retry-After` and `retryAfterSec`, and the runner keeps the run and
resubmits it by itself when the window opens. A session nonce fronts one
submission (`consumeNonce`; Redis `SET NX EX` when bound, in-instance set
otherwise) and is valid for 24 hours (`NONCE_MAX_AGE_MS` in
`apps/ui/src/lib/bench/nonce.ts`; a used nonce is remembered for as long). The
page fetches one when a run starts and a fresh one right before every upload
attempt, so the age of the run does not matter; the digest does not cover the
nonce, so the swap leaves it valid. The published file never contains it: the server applies
`scrubRunForPublication` before committing, recomputing the digest and
stamping `scrubbedAt` when a pre-schema-3 page's payload had to be cleaned.

## 4. Verify after deploy

1. `GET https://localmode.ai/api/bench/nonce` → `{ nonce: "…" }` (not `dev.`-prefixed).
2. Run the quick suite on a real device → Submit → the run file appears in
   `runs/YYYY/MM/` and the leaderboard row shows within ~5 minutes (ISR).
3. Confirm `index/summary.json` gained the entry (each entry carries the run's
   `protocol`).

The leaderboard aggregates index entries whose `protocol` is one of
`LEADERBOARD_PROTOCOL_VERSIONS` (the current `localmode-bench/5` and the
previous `localmode-bench/4`), in separate rows that never mix; entries
without the field predate v2 and are excluded. After a protocol bump the
previous version's rows therefore stay on the leaderboard beside the new
version's as those runs arrive. Archived runs stay in `runs/` as-is and are
never re-scored.

Model files are pinned. Every LiteRT and llama.cpp file URL in the bench
catalog (`apps/ui/src/lib/bench/catalog.ts`, which must equal the provider
catalogs `packages/litert/src/models.ts` and `packages/wllama/src/models.ts`)
names a repository revision, `/resolve/<40-hex commit>/`, never
`resolve/main`; `apps/ui/scripts/bench-catalog.test.ts` fails on an unpinned
URL. A branch URL follows upstream replacements, and the providers cache a
file by its URL, so browsers end up running different files under one label
(the `Qwen3-0.6B.litertlm` replaced on 2026-10-12 is the case that led to the
pin; site build 2.16.16). To move a lane to a newer file, change the pinned
revision and the declared `sizeBytes` together, check the file with the
Hugging Face API (`POST /api/models/<repo>/paths-info/<revision>` with
`paths=<file>&expand=true` gives its size and LFS sha256), and bump the
protocol version: a new file is a new configuration, and leaderboard rows must
not mix the two. Pinning to the file a protocol version already measured, as
2.16.16 did, is not a protocol change. LiteRT cells record the revision they
loaded in `runtimeConfig.modelRevision` and the bytes the engine read in
`modelBytes`.

## 5. Rebuilding the index

`index/summary.json` is derived data: every entry can be regenerated from the
run files. The submit route reads the index through the Git blobs API (the
contents API returns no inline content for files over 1 MiB) and never writes
an index it could not read in full; when the append fails, the run file is
still committed and the submitter gets `index-update-failed` with the run's
path. To restore missing entries, rebuild from a clone of the dataset:

```
cd apps/ui
pnpm exec tsx scripts/rebuild-bench-index.ts --dataset ../../../LocalMode-Bench --dry-run
pnpm exec tsx scripts/rebuild-bench-index.ts --dataset ../../../LocalMode-Bench
```

Every `runs/**.json` (verified) and `quarantine/**.json` (flagged) file
becomes one entry, built with the submit route's own `toIndexEntry()`, ordered
by `createdAt` then path. The tool writes nothing when a run file cannot be
indexed, or when the result would hold fewer entries than the current index or
drop a run it lists (`--allow-shrink` overrides the last two). The one entry
key no run file holds, `importedAt` (section 8), is carried over from the
current index. Review the diff and commit the file in the dataset clone.

Since bench 0.9.5 the entry builder corrects Chromium's WebGPU architecture
label for the AMD integrated GPUs listed in `AMD_DEVICE_ID_ARCHITECTURE`
(`packages/bench/src/aggregate.ts`), reading the PCI device id from the run's
`environment.webglRenderer`: Barcelo (0x15E7) and Lucienne (0x164C) are GCN 5
(Vega), not `rdna-2`, and Kaveri (0x1304 to 0x131D) is GCN 2, not `gcn-1`. The
first rebuild after this release applies the correction to the existing
entries: those runs move to a new `deviceClass` (and `deviceSubclass` where the
GPU model names no part number), `gpuArchitecture` takes the corrected value
and `gpuArchitectureReported` keeps the browser's label; their leaderboard
group changes accordingly. Every other entry stays byte-identical and the run
files are not touched. A dry run against the dataset on 2026-10-02 found five
such runs (two 0x164C and two 0x15E7 moving from `windows/amd-rdna-2` to
`windows/amd-gcn-5`, one 0x130A moving from `windows/amd-gcn-1` to
`windows/amd-gcn-2` with its subclass `windows/amd-radeon-r5-graphics`
unchanged). Runs submitted after the deploy are indexed with the correction
directly.

### Errata

`index/errata.json` (since bench 0.9.11, site build 2.16.17) lists published
cells that every aggregate leaves out, each with a reason: a JSON array of
`{ runId, cellIds, reason, recordedAt, reference }` (schema in the package
README and the dataset's SCHEMA.md). A maintainer edits it by hand in the
dataset clone; nothing writes it automatically. An entry names only `ok`
cells (any other status already enters no aggregate). Before committing,
check it with the rebuild tool's dry run, which validates it against the run
files and refuses (exit 1, nothing written) when an entry is malformed or
names a run or cell the dataset does not hold:

```
cd apps/ui
pnpm exec tsx scripts/rebuild-bench-index.ts --dataset ../../../LocalMode-Bench --dry-run
# [rebuild-bench-index] index/errata.json: 12 entries, 12 cells excluded by erratum from the leaderboard
```

The leaderboard reads the file from `main` beside the index on every
revalidation and validates it against the index; a file that fails is logged,
and the previously cached board (or, before one exists, an empty board) is
served instead of a board without the exclusions. The index itself is
unchanged by errata. Errata never re-score a cell and never bump the protocol.

## 6. Matching participants of a paid study

A paid-study link (`/bench/run?...&cc=<code>&PROLIFIC_PID=<id>`) records the
participant only as `prolific:<first 12 hex digits of SHA-256(id)>` in
`environment.userReportedDevice`, and the hardware the participant reported
on the page in `environment.userReportedHardware`. To check the participants
of a study against the dataset, export the participant list from the study
platform (CSV with a "Participant id" column, or a plain file with one id per
line) and run, from `apps/ui`:

```
pnpm exec tsx scripts/match-study-submissions.ts participants.csv --dataset ../../../LocalMode-Bench
pnpm exec tsx scripts/match-study-submissions.ts participants.csv --pid-column "Participant id" --json > matches.json
```

`--dataset` defaults to `../../../LocalMode-Bench` (a clone beside this
repository). Each id is hashed with the page's own `parseStudySession()`, looked
up in `index/summary.json`, and each matched run file is read. One row per
participant without a run and one per run otherwise: the verdict (`approve`
when exactly one run carries the hash, `duplicate` when several do, all
listed, `no-match` when none does), the run id, `createdAt`, browser name and
engine, the browser eligibility recomputed with `studyEligibility()` from the
run's user agent and UA-CH brands, and the reported hardware. `--json` prints
the same rows as JSON. The tool reads the clone only; it writes nothing.

## 7. Scrubbing a participant answer from a published run

The answers a participant types are published as typed, after
`sanitizeReportedGpu()` has removed control characters, URLs, email
addresses and computer names (`DESKTOP-XXXXXXX`, `LAPTOP-XXXXXXX`,
`WIN-XXXXXXXXXXX`, other uppercase `NAME-X1X2X` tokens) from the GPU name.
When a published run still carries something a public file must not, rewrite
that one answer from a clone of the dataset, from `apps/ui`:

```
pnpm exec tsx scripts/scrub-run-field.ts --dataset ../../../LocalMode-Bench --run <runId> --field environment.userReportedHardware.gpu --sanitize --dry-run
pnpm exec tsx scripts/scrub-run-field.ts --dataset ../../../LocalMode-Bench --run <runId> --field environment.userReportedHardware.gpu --sanitize
pnpm exec tsx scripts/scrub-run-field.ts --dataset ../../../LocalMode-Bench --run <runId> --field <path> --value "<new value>"
pnpm exec tsx scripts/scrub-run-field.ts --dataset ../../../LocalMode-Bench --run <runId> --field <path> --delete
```

Only the participant's answers may be edited:
`environment.userReportedHardware.gpu`, `.chassis`, `.ramGB`,
`.otherAppsRunning`, and `environment.userReportedDevice`; any other path is
refused. `--sanitize` applies the current `sanitizeReportedGpu()` to the GPU
name. The run file goes through the submit route's publication path
(`scrubRunForPublication`, `scrubbedAt` stamped, digest recomputed with
`computeRunDigest`), is validated and its digest verified, and is written back
in the dataset's compact JSON layout. The run's entry in
`index/summary.json` is rewritten only in the fields `toIndexEntry()` derives
from the edited answer (for the GPU name, `reportedGpu`). The tool prints the
before and after of the field, the digest and the index entry; review
`git diff` (exactly the run file and the index should change) and commit both
files in the dataset clone. The old value stays in the dataset's Git history.

## 8. Importing a run whose upload failed

A participant whose finished run could not be uploaded (the page showed "the
upload did not go through") can export it with Export JSON and send the file.
Add it to a clone of the dataset, from `apps/ui`:

```
pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json --dry-run
pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json
```

The file goes through the submit route's own pipeline
(`apps/ui/src/lib/bench/submission.ts`, the module the route calls): the 4 MB
cap and JSON parsing, `verifyRunDigest`, `validateSubmission` with the
quarantine decision (reject-severity flags send it to `quarantine/`), the
publication scrub (the nonce is dropped; `scrubbedAt` and a recomputed digest
only when an older page captured fields schema 3 removes), the dataset path,
the run file bytes and the index entry from `toIndexEntry()`. An imported run
therefore passed the same validation as a submitted one; it lacks only the
live nonce check (an exported file's nonce has expired by the time it arrives)
and the rate limit. The run file is exactly what the route would have committed
for the same file, digest included. Its index entry is marked: it carries
`importedAt`, the ISO time of the import, a key no submitted run's entry has;
the index rebuild tool keeps it from the current index. A run id that is
already in the index or under `runs/` or `quarantine/` is refused, and so is a
file whose digest does not verify. `--dry-run` prints the path, the
verified/quarantine decision, the flags and the index entry, and writes
nothing. Review `git diff` (one new run file, one appended index entry) and
commit both in the dataset clone.

A run that a `/bench/run` page assembled after a series had finished on it
(site 2.16.9 and earlier) carries that series' record numbered past its count,
for example `harness.series` index 11 of count 10, and the route refuses it
with "harness.series.index must be an integer from 1 to
harness.series.count". Import such a file with `--drop-stale-series`:

```
pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json --drop-stale-series --dry-run
pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json --drop-stale-series
```

The tool first verifies the participant's digest over the file as exported,
then removes `harness.series` as a publication scrub: `scrubbedAt` is stamped,
the digest recomputed, and the rest of the run is untouched. The output prints
the removed record and the client digest, and the index entry carries
`importNote: "stale series record removed"` after `importedAt` (the rebuild
tool keeps both). The flag is refused for a run whose series record is
consistent (index within its count) or absent, so it cannot strip a genuine
series place.

## 9. Control runs

A control run is a control experiment for the methodology: the same suite as
a protocol run, in the runtime execution order its kind names, so that the
lane ratios under two orders can be compared (see the package README, Control
runs). There are five kinds:

- `order-reversed` runs the runtimes in the exact reverse of the protocol
  order.
- `fixed-order` runs them in the protocol order itself, marked as a control
  run. Use it for the reference series of an order-reversed series: record
  both on the same machine, with the same browser build, on the same day and
  with the same settings, so the two orders are compared within one browser
  build (the protocol runs on the leaderboard may come from another build).
- `wasm-default` runs them in the protocol order with the Transformers.js
  WASM lane at the runtime's own defaults instead of the protocol's
  configuration: the lane's models load at dtype `q8` (Transformers.js 4.2's
  WASM default; the protocol loads the language model's `q4` files and the
  embedding model at `fp32`) and ONNX Runtime's WASM thread count is set to
  `navigator.hardwareConcurrency` (ONNX Runtime's own default is
  `min(4, ceil(cores / 2))`). Every other lane and every rule is the
  protocol's. Record it beside a `fixed-order` series on the same machine,
  browser build, day and settings, so the WASM lane at the two
  configurations is compared within one build. Run it on the Standard tier
  (the link below), the smallest suite with a Transformers.js WASM
  language-model cell (Qwen3 0.6B); the Quick suite has none.
- `wasm-q8` and `wasm-threads` each make one of the two changes
  `wasm-default` makes, in the protocol order, so that its effect can be
  split between the dtype and the thread count. `wasm-q8` loads the WASM
  lane's models at `q8` and leaves ONNX Runtime's thread count at its own
  default (the page does not set it); `wasm-threads` keeps the protocol's
  files (`q4` language model, `fp32` embedding model) and sets the thread
  count to `navigator.hardwareConcurrency`. With `fixed-order` (neither) and
  `wasm-default` (both) they form a 2x2 factorial: record all four series on
  the same machine, browser build, day and settings, on the Standard tier
  (the links below).

A control run is opted into only by the query parameter:

```
https://localmode.ai/bench/run?control=order-reversed
https://localmode.ai/bench/run?control=fixed-order
https://localmode.ai/bench/run?tier=quick&quality=off&runs=10&cooldown=0&cold=off&control=order-reversed
https://localmode.ai/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=fixed-order
https://localmode.ai/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-default
https://localmode.ai/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-q8
https://localmode.ai/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-threads
```

Leave a cool-down between the runs of a series: `cooldown=5` waits five
minutes between runs (the parameter is in minutes, capped at 30). On a
laptop still warm from the previous run, the Compute Pressure state can
reach `serious` or `critical` during the next one, and an analysis that
excludes runs by their `pressureCriticalFraction` would drop them.

For as long as control mode is on, the page shows "Control run: reversed
runtime order; not published to the leaderboard" (`order-reversed`),
"Control run: protocol runtime order; not published to the leaderboard"
(`fixed-order`), "Control run: Transformers.js WASM lane at runtime
defaults (q8, all cores); not published to the leaderboard" (`wasm-default`),
"Control run: Transformers.js WASM lane at q8, runtime thread default; not
published to the leaderboard" (`wasm-q8`) or "Control run: Transformers.js
WASM lane at q4 on all cores; not published to the leaderboard"
(`wasm-threads`).
The run file carries `harness.control = { kind, runtimeOrder: [...] }` with
the kind and the order the runner used; a `wasm-default` run adds
`wasmLane: { dtype: 'q8', numThreads, simd: true }` (`numThreads` is the
page's `navigator.hardwareConcurrency`), and each of its
`transformers-wasm` cells records `dtype: 'q8'` and the `numThreads` ONNX
Runtime actually initialised with in its `runtimeConfig` (every run records
that thread count for the lane, so a protocol or `fixed-order` run shows
ONNX Runtime's default beside it). A `wasm-q8` run adds
`wasmLane: { dtype: 'q8', numThreads: null, simd: true }` (`null`: the page
left the thread count to ONNX Runtime) and its WASM cells record `dtype:
'q8'` with the count ONNX Runtime chose; a `wasm-threads` run adds
`wasmLane: { dtype: 'q4', numThreads, simd: true }` and its WASM cells record
the protocol's dtype (`q4` on the language-model cells, `fp32` on the
embedding cells) with `numThreads` equal to the core count. Everything else (cells, rules, traces,
environment capture) is a protocol run's. A control run is never uploaded: the publish
toggle is locked off, the results offer Export JSON only, the page fetches no
upload token, and the submit route refuses a run carrying `harness.control`
with 422 `control-run`. Runs N works as usual, so ten executions run
unattended; each run of the series is exported as a JSON download, and the
series keeps its control mode across its reloads. A paid-study link with the
parameter, or an unknown kind, is refused on the page and Run stays disabled.

### Saved exports: getting every run file

Chrome blocks a site's repeated automatic downloads unless you allow them, and
the page cannot tell when it did. A series saves each run with an automatic
download and then reloads for the next run, so without that permission only
some of the files reach the disk. The page therefore keeps every finished run
in the browser before it tries to download it: every run of a series
(published or not), and a single run that is only exported (a control run, a
run with publishing off, or a run whose upload failed). The copies live in
the page's IndexedDB database `localmode-bench-progress`, object store
`finished-runs`, keyed by run id; Clear model caches does not touch them, and
nothing removes them by age.

To get the files, open `/bench/run` in the same browser profile (after the
series ends, or any time later). The **Saved exports** panel lists each kept
run: short run id, suite, control kind, series place, finish time, size, and
when its download last started.

- **Download all (.zip)** saves one archive holding every kept run, each as
  `localmode-bench-<runId>.json`. A click is a user action, so Chrome allows
  this download even where it blocked the automatic ones. Unzip it and point
  the collector at the folder (`--dir`).
- **Download** on a row saves that one run file.
- **Remove** (it asks first) deletes the browser's copy; do this once the file
  is safe on disk.

Every saved file is byte for byte the file Export JSON and the series'
automatic download save (two-space indented JSON with the page's digest), so
the collector and `import-exported-run.ts` accept it as is. To also get the
files on disk while a series runs, allow automatic downloads for the site in
Chrome (the blocked-download icon in the address bar, or Settings → Privacy
and security → Site settings → Additional permissions → Automatic downloads). The series panel says how
many of its runs the browser holds and whether each download was triggered.

Control runs never enter the leaderboard index: `import-exported-run.ts`
refuses them. File the exported runs into a clone of the dataset, from
`apps/ui`:

```
pnpm exec tsx scripts/collect-control-runs.ts --dataset ../../../LocalMode-Bench --dir ~/Downloads/control-runs --dry-run
pnpm exec tsx scripts/collect-control-runs.ts --dataset ../../../LocalMode-Bench --dir ~/Downloads/control-runs
```

(`--file <export.json>` may be given several times instead of `--dir`, which
takes every `.json` file directly inside the folder.) Each file must be a
control run whose digest verifies and whose shape validates
(`validateSubmission`; plausibility flags are printed and kept). The nonce is
dropped if the file has one, and the run is written as compact JSON to
`controls/<kind>/<YYYY-MM-DD>/<runId>.json`, the date being `createdAt` in
UTC (`controls/order-reversed/...`, `controls/fixed-order/...`, `controls/wasm-default/...`, `controls/wasm-q8/...` or `controls/wasm-threads/...`). `index/summary.json` is not read or written. A run id already under
`runs/`, `quarantine/` or `controls/` is refused, and one refused file stops
the whole batch before anything is written. Check `git diff` (only new files
under `controls/`) and commit them in the dataset clone. The dataset's
`SCHEMA.md` should carry the same note on `harness.control` and `controls/`.

## Optional integration check (real GitHub API, opt-in)

With the env vars exported locally you can exercise the real store path against
a scratch repo before pointing at production:

```
BENCH_GITHUB_REPO=you/scratch-repo BENCH_GITHUB_TOKEN=... \
  npx tsx --eval "import('./apps/ui/src/lib/bench/store.ts').then(async m => { \
    const cfg = m.benchStoreConfig(); console.log('bound:', !!cfg); })"
```

The unit suite covers all pure logic (validation, aggregation, nonce) and the
index read-modify-write against a fake GitHub that answers as the real API does
(base64 content up to 1 MiB, `content: ""` with `encoding: "none"` above it,
blobs at any size, 409 on a stale sha). The real GitHub API itself is exercised
only here and in production - documented gap per the repo test-integrity
policy.
