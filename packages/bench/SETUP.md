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
in-instance window without it.

## 4. Verify after deploy

1. `GET https://localmode.ai/api/bench/nonce` → `{ nonce: "…" }` (not `dev.`-prefixed).
2. Run the quick suite on a real device → Submit → the run file appears in
   `runs/YYYY/MM/` and the leaderboard row shows within ~5 minutes (ISR).
3. Confirm `index/summary.json` gained the entry (each entry carries the run's
   `protocol`).

The leaderboard aggregates only index entries whose `protocol` matches the
current `BENCH_PROTOCOL_VERSION` (`localmode-bench/3`); entries without the
field predate v2 and are excluded. After a protocol bump the leaderboard is
therefore empty until the first run under the new protocol is published.
Archived runs stay in `runs/` as-is and are never re-scored.

## Optional integration check (real GitHub API, opt-in)

With the env vars exported locally you can exercise the real store path against
a scratch repo before pointing at production:

```
BENCH_GITHUB_REPO=you/scratch-repo BENCH_GITHUB_TOKEN=... \
  npx tsx --eval "import('./apps/ui/src/lib/bench/store.ts').then(async m => { \
    const cfg = m.benchStoreConfig(); console.log('bound:', !!cfg); })"
```

The unit suite covers all pure logic (validation, aggregation, nonce); the
GitHub network boundary is deliberately exercised only here and in production -
documented gap per the repo test-integrity policy.
