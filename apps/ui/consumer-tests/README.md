# Portability consumer tests

These tests prove the `@localmode/ui` portability guarantee: **every non-local-first component installs and runs in a React app with zero `@localmode/*` packages**, and the conversation elements render data shaped like the Vercel AI SDK's.

Run them:

```bash
pnpm --filter ui test:portability   # runs registry:build first if public/r is missing
```

## What runs (the real call path)

1. The prebuilt registry (`public/r/`) is served over HTTP — the exact JSON a consumer's `shadcn add` fetches.
2. A scratch consumer project is scaffolded with **no `@localmode/*` packages**.
3. The **real `shadcn` CLI** installs representative items (both copy-owned libs, a pure props component, a Tier-1 lib consumer, two Tier-2 lib consumers, and **all four `ui/devtools/*` primitives** — they mirror `@localmode/devtools` bridge snapshots as local `…Like` prop shapes and must stay zero-`@localmode/*`).
4. Witnesses:
   - **A** — no `@localmode/*` import statement in the installed code,
   - **B** — no `@localmode/*` package in the consumer's `package.json`,
   - **C** — real `tsc --noEmit` exits 0,
   - **D** — the real installed component renders fixture data to real DOM (both the original scored-result render and a devtools render: `ModelCacheTable` + `InferenceQueueMonitor` fed bridge-shaped fixture objects).
5. **Negative (red-first):** a deliberately-coupled fixture item (imports `@localmode/react`) is installed and witness A is asserted to **fail** for it — proving the detector isn't vacuous.
6. **Devtools type-gate (red-first):** an `@localmode/devtools` import is temporarily injected into the scratch consumer's installed copy of `model-cache-table.tsx`; the witness-A detector must flag it AND real `tsc` must **fail** on exactly that specifier (a zero-`@localmode` consumer cannot resolve it); the file is restored and `tsc` asserted green again. Only the scratch consumer's copy is touched — the registry source never is.
7. **AI-SDK:** AI-SDK-shaped message parts are run through the documented mapping and rendered.

## Render boundary (test-integrity)

Witnesses **D** and the AI-SDK render use `react-dom/server` to render the **real installed components** from fixture props. That is a genuine render — the component is never stubbed — but it is not a *visual* render in a real browser.

A full visual render in **real Chrome** is covered by the apps/ui docs previews: every component is rendered in a real browser via `<ComponentPreview>` on its doc page, and that is the recommended CI gate (Playwright over the running docs site). This autonomous test harness has no browser binary available, so its automated render witness is server-side. The two layers are complementary: this harness guarantees the *install + type + render-from-fixtures* boundary on every run; the docs previews guarantee the *visual* boundary in a real browser.

Likewise, the AI-SDK test asserts the **mapping + component render** boundary with a scripted, AI-SDK-shaped message (no hosted model, no API keys — the scripted message stands in for the model layer by design). Driving the live `useChat` streaming lifecycle end-to-end in real Chrome is the docs-preview / Playwright step.

# Blocks lane (the carve-out)

`ui/blocks/*` items are the **wiring layer**: full working surfaces (chat, knowledge-base, voice, vision, device-model-lab) that compose the primitives AND do real on-device inference. Unlike primitives, blocks legitimately declare `@localmode/*` npm packages in `dependencies` — that is the documented **carve-out** from the portability invariant. Primitives stay portable to any backend; blocks are where LocalMode wiring is the whole point, so a consumer who installs a block gets the `@localmode/*` packages auto-installed by the shadcn CLI.

Run it:

```bash
pnpm --filter ui test:blocks   # runs registry:build first if public/r/ui/blocks is missing
```

## What the blocks lane proves (`blocks-test.mjs`)

Same real call path as the primitives lane (served prebuilt registry → scratch consumer → real `shadcn` CLI), installing the representative block `ui/blocks/knowledge-base` (25 primitive `registryDependencies` + six `@localmode/*` npm deps: `core`, `react`, `transformers`, `wllama`, `langchain`, `pdfjs` — plus `lucide-react`):

1. **A (targets)** — all **eight** block files land at their declared `target`s under `src/components/blocks/knowledge-base/` (the `knowledge-base.tsx` shell plus the `engine/` and `tabs/` subdirectories) and all 25 composed primitives land as **flat** components under `src/components/` (plus the two copy-owned lib files under `src/lib/`).
2. **B (carve-out)** — after the real `shadcn add`, the consumer's `package.json` now **DOES** contain the six `@localmode/*` packages (proving the CLI carve-out behavior), the packages resolve into `node_modules`, and the installed block files reference every one of them — statically or via dynamic `import()` (`@localmode/pdfjs` is lazy-loaded inside the Ingest tab). This is the exact inverse of the primitives lane's witnesses A + B — the two lanes together pin the carve-out boundary from both sides.
3. **C (types)** — real `tsc --noEmit` exits 0 against the installed packages' real dist type declarations (catches API drift between the registry-embedded block source and the package APIs).
4. **D (render)** — `react-dom/server` mounts the **real installed `KnowledgeBaseBlock`**. Its model download is gated behind explicit actions (Start / ingest / engine or model switch), so a plain mount must render the initial idle state ("idle — click Start to load the model and index the corpus" — preserved verbatim from the phase0 rag block — plus the gated Start button, the "not loaded" embedding-model line, and the pre-engine tab-panel placeholder) with no model fetch.
5. **Red-first plumbing check** — one primitive import specifier inside the scratch consumer's installed `knowledge-base.tsx` is corrupted (`@/components/model-downloader` → `…-BROKEN`), `tsc` is asserted to **fail on exactly that specifier** (proving witness C actually gates), then the file is restored and `tsc` is asserted green again. This happens only inside the scratch consumer — the registry is never touched.

> The blocks lane installs **representative per-category blocks** (e.g. `ui/blocks/knowledge/rag-chat`, `ui/blocks/photo/duplicate-finder`, `ui/blocks/audio/voice-notes`, `ui/blocks/agents/data-extractor`, `ui/blocks/device/gguf-explorer`) at their `components/blocks/<category>/<block>/` targets. Render witnesses assert real text/role observables — block sources are testid-free. The examples below describe the mechanism; the single-`knowledge-base` narrative predates the category split.

The main scratch consumer lives at `$TMPDIR/lm-ui-blocks-consumer` (all scratch consumers are left in place after a run for postmortem inspection; wiped and re-scaffolded at the start of the next run — same behavior as the portability lane's scratch dir). Because the block is a Next-app surface (its shell lazy-mounts tabs via `next/dynamic`), the consumer scaffold provides `next` the same way it provides `react` — framework deps are the consumer's; the item declares only its own npm imports.

### DevTools drawer lane: `ui/blocks/devtools-drawer`

A **third** scratch consumer (`$TMPDIR/lm-ui-drawer-consumer`) installs `@localmode/ui/blocks/devtools-drawer` — the global observability drawer whose carve-out dependency is `@localmode/devtools` — through the same real CLI path and asserts:

1. **A (targets)** — both drawer files land at their declared targets under `src/components/blocks/devtools-drawer/` (`devtools-drawer.tsx`, the six-tab body, plus `drawer-host.tsx`, the SHIPPED framework-agnostic `React.lazy` host), and the six composed primitives (`inference-queue-monitor`, `event-log-viewer`, `pipeline-run-inspector`, `model-cache-table`, `device-capability-grid`, `vector-storage-observability`) land flat under `src/components/` with the three copy-owned lib files (`utils`, `browser-utils`, `use-environment`) under `src/lib/`.
2. **B (carve-out)** — the consumer's `package.json` DOES declare `@localmode/devtools` (+ `lucide-react`), the package resolves in `node_modules`, and the installed drawer files really reference it (the body's static import + the host's lazy `import()`).
3. **C (types)** — real `tsc --noEmit` exits 0 against the packed workspace `@localmode/devtools` tarball (incl. its `./react` hooks subpath). `@localmode/devtools` declares a non-optional peer on `@localmode/core`, which the lane satisfies from the packed workspace **core** tarball — the same packed-workspace package boundary as the main lane.
4. **D (render)** — `react-dom/server` mounts the **real installed `DevToolsDrawerHost`** in its closed / never-opened state: only the toggle button renders (with its "Open LocalMode DevTools" label), and none of the drawer-body surfaces (`devtools-drawer`, `devtools-power-off`, tab hooks) appear. The body — and `@localmode/devtools` with it — sits behind a `React.lazy` dynamic `import()` that never executes while closed, so no devtools activation is possible during this render; the assertions are deliberately markup-only. The open-drawer lifecycle (enable → observe real model activity → close-keeps-collecting → power-off) is the committed Playwright drawer spec's job (`e2e/blocks/devtools-drawer.spec.ts`).

## Package boundary: packed workspace tarballs, not npm-latest

Witnesses B–D resolve `@localmode/core` / `@localmode/react` / `@localmode/transformers` from **`npm pack`ed workspace tarballs** (packed on the fly into the scratch consumer's `.tarballs/`, built first if `dist/` is missing) — the exact artifact of the next publish, installed by real npm. They are deliberately **not** resolved from npm-latest:

- This lane is a **pre-merge gate for the monorepo commit**. Block source and the workspace packages evolve together and are published together; npm-latest is an external moving target a commit cannot control. Gating on it would leave every coordinated block+hook change permanently red until a post-merge publish.
- The shadcn CLI's own dependency declaration (the carve-out) is still asserted **before** the re-point, against the real registry-resolved ranges — a block that forgets to declare its `@localmode/*` deps fails witness B regardless.

The flip side is a **shipping prerequisite** this lane does not (and cannot) gate: the blocks change must not ship until the current workspace packages are published. Concretely, this lane's first run caught real drift — npm's `@localmode/react@2.1.1` predates the workspace's `useSemanticSearch` `usage`/per-call-options API even though the version numbers match, so `ui/blocks/rag` fails `tsc` for a real consumer until `@localmode/react` (and any similarly drifted package) is version-bumped and republished.

## Blocks render boundary

Witness D is the *initial-state* render — deliberately, because the block's contract is that nothing downloads on mount. The full Start → real model download → index → search → known-winner assertion in **real Chrome** is the committed Playwright E2E harness's job (`e2e/blocks/knowledge.spec.ts`); this autonomous environment has no browser binary, so the automated witness here is the install + type + initial-render boundary.

**The primitives lane is unchanged by the blocks work** — non-block items must still install with zero `@localmode/*` packages, and both lanes must be green:

```bash
pnpm --filter ui test:portability && pnpm --filter ui test:blocks
```
