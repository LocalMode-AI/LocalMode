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
