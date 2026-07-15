# Contributing to LocalMode

First off — thank you. LocalMode is **local-first, privacy-first, offline-first AI for the browser**, and it gets better every time someone files a sharp bug report, tightens a type, writes a test, or ships a new component. This guide explains how to set up the repo, the conventions we hold the line on, and how to get a change merged.

New here? Jump to [Your first contribution](#your-first-contribution).

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [The golden rule: read the existing code first](#the-golden-rule-read-the-existing-code-first)
- [Development workflow](#development-workflow)
- [Architecture rules (non-negotiable)](#architecture-rules-non-negotiable)
- [Testing — the most important section](#testing--the-most-important-section)
- [Code style](#code-style)
- [Changesets & versioning](#changesets--versioning)
- [Contributing to `apps/ui` (the UI registry & blocks)](#contributing-to-appsui-the-ui-registry--blocks)
- [Contributing to docs](#contributing-to-docs)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs & requesting features](#reporting-bugs--requesting-features)
- [Reporting a security issue](#reporting-a-security-issue)
- [Your first contribution](#your-first-contribution)
- [License](#license)

---

## Code of conduct

Be kind, be constructive, assume good faith. We welcome contributors of every background and experience level. Harassment, personal attacks, and dismissive behavior aren't tolerated in issues, pull requests, or discussions. If something crosses that line, contact the maintainers privately (see [Reporting a security issue](#reporting-a-security-issue) for the private channel).

---

## Ways to contribute

You don't need to write framework internals to help:

- **Report a bug** with a minimal reproduction (see [Reporting bugs](#reporting-bugs--requesting-features)).
- **Improve docs** — package `README.md`s, the docs site (`apps/docs`), JSDoc, or this file.
- **Add tests** for an under-covered function or edge case.
- **Fix a bug** — small, well-tested fixes are the easiest reviews.
- **Add a UI component or block** to `apps/ui` (see the dedicated section below).
- **Add a model** to a provider catalog, or a provider for an existing core interface.
- **Triage** — reproduce open issues, add missing details, suggest labels.

If a change is large or changes public API, **open an issue or a discussion first** so we can align on the approach before you invest the time.

---

## Repository layout

LocalMode is a **pnpm monorepo**.

```
packages/
  core/            Zero-dependency core — all functions, interfaces, VectorDB, agents, RAG, security
  react/           React hooks for every core function (+ pipeline step factories)
  ai-sdk/          Vercel AI SDK provider
  transformers/    HuggingFace Transformers.js provider (ONNX)
  webllm/          WebLLM provider (WebGPU)
  wllama/          GGUF provider via llama.cpp WASM
  litert/          Google LiteRT-LM provider
  mediapipe/       Google MediaPipe Tasks provider
  chrome-ai/       Chrome Built-in AI provider (Gemini Nano)
  langchain/       LangChain.js adapters
  devtools/        In-app AI observability (hooks)
  pdfjs/           PDF text extraction
  dexie/ idb/ localforage/   Storage adapters
apps/
  ui/              @localmode/ui — the shadcn-style registry + /blocks gallery (localmode.ai)
  docs/            Documentation site (localmode.dev)
```

---

## Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| **Node.js** | `>= 18` | `20 LTS` or newer recommended |
| **pnpm** | `>= 10` | The required package manager — do **not** use npm or yarn to install |
| **git** | any recent | |

A modern browser (Chrome/Edge for WebGPU, or any modern browser for WASM) is needed to run the `apps/ui` demos and Playwright end-to-end tests.

---

## Getting started

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/LocalMode.git
cd LocalMode

# 2. Install every workspace's dependencies (pnpm links them together)
pnpm install

# 3. Build all packages once (providers peer-depend on core's build output)
pnpm build

# 4. Run the test suite to confirm a clean baseline
pnpm test
pnpm test:types
```

Working on a single package? Filter to it:

```bash
pnpm --filter @localmode/core dev       # tsup --watch for the core package
pnpm --filter @localmode/core test      # run just core's tests
pnpm --filter ui dev                     # run the localmode.ai app locally
pnpm --filter docs dev                   # run the localmode.dev docs site locally
```

---

## The golden rule: read the existing code first

**The implemented code is the source of truth. Before writing anything new, find the closest existing implementation and match it exactly** — its structure, naming, error handling, and JSDoc style. A change that looks like it was always part of the codebase is a change that's easy to review and easy to maintain.

| You're touching… | Read first |
| ---------------- | ---------- |
| A core function | `packages/core/src/embeddings/embed.ts`, `classification/classify.ts` |
| A core interface | `packages/core/src/<domain>/types.ts` |
| Error handling | `packages/core/src/errors/index.ts`, `errors/format.ts` |
| A provider implementation | `packages/transformers/src/implementations/` |
| A storage adapter | `packages/dexie/src/storage.ts`, `packages/idb/src/storage.ts` |
| A UI primitive | `apps/ui/registry/localmode/<family>/<component>/` |
| A block | `apps/ui/src/app/blocks/<name>/` |

---

## Development workflow

1. **Create a branch** off `main`:
   ```bash
   git checkout -b fix/embed-abort-signal      # or feat/…, docs/…, test/…, chore/…
   ```
2. **Make the change**, matching the surrounding code.
3. **Add or update tests** — see the testing section; this is not optional.
4. **Add a changeset** if you changed any published package (see below).
5. **Run the local checks** (the same gates a reviewer will expect green):
   ```bash
   pnpm lint          # ESLint over packages/**
   pnpm test          # Vitest — packages/**/*.test.ts and *.spec.ts
   pnpm test:types    # tsc type-level contract tests (*.test-d.ts)
   pnpm typecheck     # tsc --noEmit across every workspace
   pnpm build         # ensure every package still builds
   ```
6. **Commit** using [Conventional Commits](#commit-messages) and open a PR.

### Handy scripts (run from the repo root)

| Command | What it does |
| ------- | ------------ |
| `pnpm build` | Build every package (`pnpm -r build`) |
| `pnpm test` | Run the Vitest suite over `packages/**` |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with a v8 coverage report |
| `pnpm test:types` | Type-level tests (`tsc --noEmit` on the typetest project) |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm lint` / `pnpm lint:fix` | ESLint over `packages/**` (autofix with `:fix`) |
| `pnpm format` | Prettier `--write` over the repo |
| `pnpm changeset` | Record a version bump + changelog entry |
| `pnpm check:peers` | Verify provider peer-dependency ranges |

> Apps carry their own scripts (Next.js presets). Run app-specific checks with `pnpm --filter ui <script>` / `pnpm --filter docs <script>` — see the [UI](#contributing-to-appsui-the-ui-registry--blocks) section.

---

## Architecture rules (non-negotiable)

These are what keep LocalMode small, portable, and private. A PR that breaks one won't merge until it's addressed.

1. **Zero-dependency core.** `packages/core/package.json` has `"dependencies": {}` and it **stays empty**. No external runtime deps in core, ever. ML frameworks live in provider packages.
2. **Provider pattern.** A provider package depends on its external library as a normal dependency, keeps `@localmode/core` as a **peer** dependency, and implements core interfaces. Study `packages/transformers/` before adding a new provider.
3. **Function-first API.** Public API is top-level async functions (`embed()`, `classify()`, `streamText()`), not class methods.
4. **Options object.** Every function takes a single options object, not positional parameters.
5. **Structured results.** Functions return `{ result, usage, response }`-shaped objects — never a bare value.
6. **`AbortSignal` everywhere.** Every async function accepts `abortSignal` and calls `abortSignal?.throwIfAborted()` before starting and before each expensive step.
7. **`Float32Array` for vectors.** Never plain `Array` for embeddings/vectors.
8. **No telemetry, no network from core.** No `fetch`, no analytics, no tracking anywhere in `packages/core` (or in shipped UI primitives). Providers may download model files from their hubs; that's the only network exception. A CI check (`check-no-shipped-telemetry`) enforces this for shipped UI surfaces.

**Errors** must answer three questions — *what happened, why, and how to fix it* — via `LocalModeError`'s `code`/`hint`/`context`. See `packages/core/src/errors/`.

**Storage adapters** must persist the **full `Collection` object** on read and write (never a cherry-picked subset) and must pass the shared conformance suite:

```ts
import { createStorageAdapterConformanceSuite } from '@localmode/core';
// 21 cases: document/vector/index/collection ops, Uint8Array fidelity,
// extended-field round-trip, ingest → close → reopen → search, SQ8 fidelity after reopen.
```

---

## Testing — the most important section

> ⚠️ **Tests must verify real functionality through real flows.** A test that reaches green by avoiding the thing it claims to verify is worse than no test — it lies to the next contributor.

**When fixing a bug, write the failing test first (red), then fix the code (green).** Reproduce the reported failure in the harness before you touch the fix. If the test passed while the bug existed, the test is the bug — rewrite it from the reporter's perspective.

**Never, to make a test pass:**

- **Bypass the real call path.** If production goes through a public API / message bus / UI / queue, the test goes through it too — no reaching into private state or calling internal helpers to shortcut it.
- **Stub the boundary the test claims to cover.** A unit test may mock the layer *below* it; a test *for* that boundary may not. An end-to-end test for a feature that loads a real model may not swap in an instant mock — that latency and failure surface is the point.
- **Loosen assertions until they pass** (widening a regex, `toBeTruthy()` where a specific value matters, adding the offending value to an allowlist).
- **Skip or swallow** — no `it.skip`/`xit`/`it.todo` on a failing assertion left in `main`, no `try { …assert… } catch {}`, no `if (process.env.CI) return`.
- **Shrink the search window** until the bug disappears (checking only the last N events, sampling a subset). Capture the full record, assert against the whole thing.

**Every test should:** replicate the real call path, capture everything observable (console, errors, side effects), assert on observable side effects (prefer two independent witnesses for a non-trivial outcome), run against a realistic backing environment for its layer, fail on the first divergence, and be reproducible from a clean checkout. Document any gap you couldn't exercise end-to-end (real GPU, real microphone, real third-party service) and say what manual verification is still needed.

### Running tests

```bash
pnpm test              # Vitest over packages/**  (jsdom environment, globals on)
pnpm test:types        # Type-level tests (*.test-d.ts) — NOT run by `pnpm test`
pnpm --filter @localmode/core test        # just one package
```

- **Where tests live:** `packages/<pkg>/tests/**` and colocated `*.test.ts` / `*.spec.ts`.
- **Type-level contracts** go in `packages/core/tests/**/*.test-d.ts` and are checked by `pnpm test:types` (Vitest does **not** run them — run both when you touch generic signatures).
- **Mock utilities** (`createMockEmbeddingModel()`, `createMockStorage()`, `createSeededRandom()`, the conformance suite, …) live in `packages/core/src/testing/index.ts`.
- **Benchmarks** use Vitest's `bench()`.
- **`apps/ui` has its own layers** — unit (`test:unit`), consumer install tests (`test:portability`, `test:blocks`), and real-model Playwright E2E (`test:e2e`). See below.

---

## Code style

- **TypeScript strict.** No `any` — the ESLint config warns on `no-explicit-any`, unsafe function types, and unused bindings. Prefer precise types and generics.
- **Formatting is automated.** Run `pnpm format` (Prettier) before committing; `pnpm lint:fix` for autofixable lint.
- **Named exports only** — no default exports (better tree-shaking). Keep `"sideEffects": false` accurate.
- **JSDoc on every public API** — description, `@param` for each parameter, `@returns`, one concise `@example`, `@throws`, and `@see` for related functions. Match the existing style in `packages/core/src/embeddings/embed.ts`.
- **Comment hygiene — comments must be timeless.** They explain *what the code does and why* for a future reader. **Never** reference internal process artifacts: no design-decision labels, spec/change names, roadmap/phase/"wave" language, or task numbers. State the technical fact directly. This matters doubly in `apps/ui` **block** sources, which ship to consumers.
- **Don't frame features against another SDK.** Describe functionality directly rather than "AI SDK compatible" / "follows the X pattern."

### Commit messages

Use [**Conventional Commits**](https://www.conventionalcommits.org/) — it matches the existing history and pairs cleanly with changesets:

```
feat(core): add streamObject() partial-object events
fix(ui): guard static preview scroll during demo mount
docs(transformers): correct Kokoro voice count
test(wllama): cover GGUF metadata parser rate-limit path
chore(react): bump peer range for @localmode/core
```

Keep the subject imperative and under ~72 chars; explain the *why* in the body when it isn't obvious.

---

## Changesets & versioning

We publish with [Changesets](https://github.com/changesets/changesets). **If your change affects any published package under `packages/*`, add a changeset:**

```bash
pnpm changeset
```

Pick the affected package(s), choose a bump level, and write a short, user-facing summary (it becomes the `CHANGELOG.md` entry):

- **patch** — bug fix, no API change
- **minor** — backward-compatible new feature
- **major** — breaking change (discuss in an issue first)

Changes that touch only `apps/*`, docs, tests, or tooling generally **don't** need a changeset. Maintainers handle the actual version bump and npm publish (`pnpm version` / `pnpm release`) — you don't publish.

---

## Contributing to `apps/ui` (the UI registry & blocks)

`apps/ui` is the `@localmode/ui` platform — a shadcn-style registry of **copy-owned** primitives plus the **`/blocks`** gallery. It is **not** published to npm; consumers install components with the shadcn CLI and own the copied `.tsx`. **`apps/ui/README.md` is the source of truth**; the highlights:

- **Styling is shadcn/ui CSS variables** (`bg-background`, `text-foreground`, `border-border`, …).
- **Portability invariant.** A primitive must compile with **zero `@localmode/*` packages installed**: define prop shapes locally, list only real npm imports in `dependencies`, and pull browser helpers from the copy-owned `@localmode/ui/lib/*` items via `@/lib/<name>`. **Blocks are the sole carve-out** — they're the wiring layer and may declare `@localmode/*` deps.
- **No model download on page load.** Docs demos auto-render and `/blocks` pages default-mount the live block, but **every model load must be gated behind an explicit user action**. Mark a docs demo `<ComponentPreview gated>` if it would otherwise fetch on mount.
- **No `data-testid` in blocks.** The block tree is testid-free; E2E specs select via **role/label/text** accessibility selectors. Give every control a role and an accessible name instead.
- **Aggregates and `public/r/` are generated** — never hand-edit `ui/all` / family aggregates or commit `public/r/` (it's gitignored). The gallery grid derives from `blocks-catalog.ts` and redirects from `legacy-redirects.ts` — edit those, not `page.tsx` / `next.config.mjs`.

Adding something? Follow the step-by-step **"How to add a component"** / **"How to add a block"** recipes in `apps/ui/README.md`, then verify:

```bash
pnpm --filter ui build            # runs registry:build, then next build
pnpm --filter ui test:unit        # transform + helper unit tests
pnpm --filter ui test:portability # real shadcn-CLI install; asserts zero @localmode/* leakage
pnpm --filter ui test:blocks      # real install of a block; asserts the carve-out
pnpm --filter ui test:e2e         # Playwright — real model downloads + inference, no mocked model boundary
```

> The E2E suite runs **real models in a real browser** and captures to `e2e-artifacts/`. When you change vision or audio streaming behavior, also do a **manual real-hardware sweep** (real webcam/microphone) — fixtures stand in for CI, and that gap is documented in the affected spec headers.

---

## Contributing to docs

- **Package `README.md`s** live next to each package and should match the API. Keep numbers (package counts, model counts, versions) accurate — stale claims are a common bug.
- **The docs site** (`apps/docs`, localmode.dev) has **strict, non-overlapping ownership**: core pages own the API reference (options, result types, `AbortSignal`, custom-provider examples, middleware); transformers/provider pages own model tables, provider config, and recipes. **Never duplicate the API reference across the two** — cross-link instead.
- Run the docs site locally with `pnpm --filter docs dev`.

---

## Submitting a pull request

1. Push your branch to your fork and open a PR against `LocalMode-AI/LocalMode:main`.
2. **Fill in the description**: what changed, why, how you verified it, and any follow-ups. Link the issue it closes (`Closes #123`).
3. **Confirm the checklist:**
   - [ ] Followed the closest existing implementation's patterns
   - [ ] Added/updated tests that exercise the **real** path (bug fixes include a red-first reproducer)
   - [ ] `pnpm lint`, `pnpm test`, `pnpm test:types`, `pnpm typecheck`, and `pnpm build` are green locally
   - [ ] Added a changeset if a published package changed
   - [ ] Updated docs / README / JSDoc if behavior or API changed
   - [ ] For `apps/ui`: ran the relevant `--filter ui` checks; no on-mount model download, no `data-testid` in blocks
4. Keep PRs **focused** — one logical change per PR reviews far faster than a grab-bag.
5. Respond to review feedback by pushing new commits (we squash on merge, so you don't need to rebase-squash yourself unless asked).

---

## Reporting bugs & requesting features

Open an issue at **https://github.com/LocalMode-AI/LocalMode/issues**. A good bug report includes:

- A clear description of the problem and **expected vs. actual** behavior
- **Steps to reproduce** — ideally a minimal code snippet
- **Browser name and version** (and whether WebGPU or WASM was in use)
- Relevant **console output** or error messages
- The LocalMode package(s) and version(s) involved

For features, describe the use case and the outcome you want before proposing a specific API — it helps us find the design that fits the rest of the library.

---

## Reporting a security issue

**Please do not open a public issue for security vulnerabilities.** Use GitHub's private vulnerability reporting on the repository (**Security → Report a vulnerability**) so we can triage and fix it before disclosure. Because LocalMode runs entirely client-side and ships no telemetry, most reports concern model-loading, storage, or crypto boundaries — include a reproduction and the affected package/version.

---

## Your first contribution

Looking for an entry point? These tend to be the smoothest:

- Issues labeled [**`good first issue`**](https://github.com/LocalMode-AI/LocalMode/labels/good%20first%20issue) and [**`help wanted`**](https://github.com/LocalMode-AI/LocalMode/labels/help%20wanted)
- **Docs and JSDoc fixes** — accurate examples and corrected counts are genuinely valuable
- **Adding a test** for an under-covered function (grep for functions with thin coverage)
- **A new UI component or block** built from the existing recipe in `apps/ui/README.md`

Not sure if an idea fits? Open a [Discussion](https://github.com/LocalMode-AI/LocalMode/discussions) or a lightweight issue and ask — we'd rather talk early than have you build the wrong thing.

---

## License

LocalMode is [MIT licensed](./LICENSE). **By submitting a contribution, you agree that your work is licensed under the MIT License** and that you have the right to license it — don't paste in code you don't have the rights to.

---

<p align="center"><b>Built for Privacy. Designed for Developers. Powered by the Browser.</b></p>
