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
otherwise), and the published file never contains it: the server applies
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
drop a run it lists (`--allow-shrink` overrides the last two). Review the diff
and commit the file in the dataset clone.

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
