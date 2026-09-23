# Portability consumer tests

These tests prove the `@localmode/ui` portability guarantee: **every non-local-first component installs and runs in a React app with zero `@localmode/*` packages**, and the conversation elements render data shaped like the Vercel AI SDK's.

Run them:

```bash
pnpm --filter ui test:portability   # always runs registry:build first (rewrites public/r)
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

`ui/blocks/*` items are the **wiring layer**: full working surfaces that compose the primitives AND do real on-device inference. Unlike primitives, blocks legitimately declare `@localmode/*` npm packages in `dependencies` — that is the documented **carve-out** from the portability invariant. Primitives stay portable to any backend; blocks are where LocalMode wiring is the whole point, so a consumer who installs a block gets the `@localmode/*` packages auto-installed by the shadcn CLI.

Run it:

```bash
pnpm --filter ui test:blocks   # always runs registry:build first (rewrites public/r)
```

## What the blocks lane proves (`blocks-test.mjs`)

Same real call path as the primitives lane (served registry → scratch consumer → real `shadcn@4.9.0` CLI). A run goes in this order:

1. **Registry build.** `registry:build` always runs, with `NEXT_PUBLIC_REGISTRY_ORIGIN=http://localhost:4601`, so every absolutized `registryDependencies` URL points at the build under test rather than production. The run fails if any of 13 payloads (`devtools-drawer` plus a representative for each of the 11 deep-routed categories, two for audio) is missing from `public/r/ui/blocks/`.
2. **Serve.** `serve-registry.mjs` serves `public/` on port 4601 in a child process.
3. **DevTools drawer lane** (`ui/blocks/devtools-drawer`; see below).
4. **Split-block lanes** (`SPLIT_BLOCK_LANES`): one scratch consumer per representative block, in this order: `writing-tools/translate`, `text-insights/model-evaluator`, `image-studio/background-remover`, `privacy/encrypted-vault`, `vision/live-tracker`, `audio/audio-classifier`, `text/language-detector`, `knowledge/rag-chat` (the **primary** lane), `photo/duplicate-finder`, `audio/voice-notes`, `agents/data-extractor`, `device/gguf-explorer`. `chat` is not installed here; `e2e/blocks/chat.spec.ts` covers it.
5. **Red-first negatives** on the primary (`knowledge/rag-chat`) consumer.

Each split-block lane asserts, in order:

1. **A (targets)** — every block file lands at its declared `target` under `src/components/blocks/<category>/…`, and every composed `@localmode/ui/*` registry dependency lands (flat under `src/components/`, or under `src/lib/`, `src/hooks/` or `src/components/ui/` by item type).
2. **Hygiene** — the LANDED (stripped) block files contain zero `data-testid`, none of the QA/E2E comment markers (`Driver contract`, `driver contract`, `Driver testids`, `E2E`, `spec.ts`, `Playwright`), and an `@file` header of at most 3 content lines.
3. **B (carve-out)** — the consumer's `package.json` declares the item's exact npm `dependencies`; the installed block files reference each imported `@localmode/*` package, statically or via dynamic `import()` (a lane's `importedLocalmode` pins that subset when a declared package is only a peer, as `@localmode/core` is for `photo/duplicate-finder`, or is reached through a hook, as `@localmode/langchain` is through `useKnowledgeBase` for `knowledge/rag-chat`). Those packages plus the `@localmode/core` peer are then re-pointed to packed workspace tarballs, installed by real npm, and must resolve in `node_modules`. This is the exact inverse of the primitives lane's witnesses A + B — the two lanes together pin the carve-out boundary from both sides.
4. **C (types)** — real `tsc --noEmit` exits 0 against the stripped install and the packed tarballs' real type declarations (catches API drift between the registry-embedded block source and the package APIs).
5. **D (render)** — `react-dom/server` (run through `tsx`) mounts the **real installed block** and checks the lane's text/role witnesses: every `all` substring must be present and every `none` substring absent. Every model load is gated behind an explicit action, so the first paint must render the idle controls with no model fetch (for example `RagChatBlock`'s "idle - load the sample corpus (or add text / a PDF) to index and ask grounded questions" status line, its `Pipeline engine` toggle and "Preparing engine…").

Red-first negatives, on the primary consumer only (each restores the file, even on failure):

- **Type gate** — the first `@/components/<primitive>` import in the installed `rag-chat.tsx` is corrupted to `…-REDFIRST-BROKEN`; `tsc` must **fail on exactly that specifier** (proving witness C actually gates), then pass again after the restore.
- **Hygiene** — the baseline scan must be clean; a `data-testid` is planted at the first `className="`; the scan must **flag** it, then be clean again after the restore.

If the primary consumer is unavailable, the run records a failure instead of skipping the negatives. All of this happens only inside the scratch consumers — the registry is never touched.

Scratch consumers live at `$TMPDIR/<lane tmp>` (for example `$TMPDIR/lm-ui-split-knowledge-rag-chat`) and the packed tarballs at `$TMPDIR/lm-ui-blocks-tarballs`. Each consumer is left in place after a run for postmortem inspection and wiped and re-scaffolded at the start of the next run. The consumer scaffold provides `react`, `react-dom` and `next` the same way a real app would — framework deps are the consumer's; each item declares only its own npm imports.

### DevTools drawer lane: `ui/blocks/devtools-drawer`

A dedicated scratch consumer (`$TMPDIR/lm-ui-drawer-consumer`) installs `@localmode/ui/blocks/devtools-drawer` — the global observability drawer whose carve-out dependency is `@localmode/devtools` — through the same real CLI path and asserts:

1. **A (targets)** — both drawer files land at their declared targets under `src/components/blocks/devtools-drawer/` (`devtools-drawer.tsx`, the six-tab body, plus `drawer-host.tsx`, the SHIPPED framework-agnostic `React.lazy` host), and the six composed primitives (`inference-queue-monitor`, `event-log-viewer`, `pipeline-run-inspector`, `model-cache-table`, `device-capability-grid`, `vector-storage-observability`) land flat under `src/components/` with the three copy-owned lib files (`utils`, `browser-utils`, `use-environment`) under `src/lib/`. Both landed drawer files then pass the same hygiene scan as the split-block lanes.
2. **B (carve-out)** — the consumer's `package.json` DOES declare `@localmode/devtools` (+ `lucide-react`), the package resolves in `node_modules`, and the installed drawer files really reference it (the body's static import + the host's lazy `import()`).
3. **C (types)** — real `tsc --noEmit` exits 0 against the packed workspace `@localmode/devtools` tarball (incl. its `./react` hooks subpath). `@localmode/devtools` declares a non-optional peer on `@localmode/core`, which the lane satisfies from the packed workspace **core** tarball — the same packed-workspace package boundary as the main lane.
4. **D (render)** — `react-dom/server` mounts the **real installed `DevToolsDrawerHost`** in its closed / never-opened state: only the toggle button renders (its `title="LocalMode DevTools"` and its "Open LocalMode DevTools" label), and nothing from the drawer body appears: no `role="dialog"`, no "Power off devtools" control, no "DevTools surfaces" navigation. The body — and `@localmode/devtools` with it — sits behind a `React.lazy` dynamic `import()` that never executes while closed, so no devtools activation is possible during this render; the assertions are deliberately markup-only. The open-drawer lifecycle (enable → observe real model activity → close-keeps-collecting → power-off) is the committed Playwright drawer spec's job (`e2e/blocks/devtools-drawer.spec.ts`).

## Package boundary: packed workspace tarballs, not npm-latest

Witnesses B–D resolve every `@localmode/*` package a lane installs from **`npm pack`ed workspace tarballs** (packed once per run into `$TMPDIR/lm-ui-blocks-tarballs`, each package built first if its `dist/` is missing; the set covers `core`, `react`, `transformers`, `wllama`, `langchain`, `pdfjs`, `webllm`, `mediapipe`, `chrome-ai` and `devtools`) — the exact artifact of the next publish, installed by real npm. They are deliberately **not** resolved from npm-latest:

- This lane is a **pre-merge gate for the monorepo commit**. Block source and the workspace packages evolve together and are published together; npm-latest is an external moving target a commit cannot control. Gating on it would leave every coordinated block+hook change permanently red until a post-merge publish.
- The shadcn CLI's own dependency declaration (the carve-out) is still asserted **before** the re-point, against the real registry-resolved ranges — a block that forgets to declare its `@localmode/*` deps fails witness B regardless.

The flip side is a **shipping prerequisite** this lane does not (and cannot) gate: the blocks change must not ship until the current workspace packages are published. Concretely, this lane's first run caught real drift — npm's `@localmode/react@2.1.1` predates the workspace's `useSemanticSearch` `usage`/per-call-options API even though the version numbers match, so `ui/blocks/rag` fails `tsc` for a real consumer until `@localmode/react` (and any similarly drifted package) is version-bumped and republished.

## Blocks render boundary

Witness D is the *initial-state* render — deliberately, because the block's contract is that nothing downloads on mount. Real model downloads and inference in **real Chrome** are the committed Playwright E2E harness's job (`e2e/blocks/`, e.g. `e2e/blocks/knowledge.spec.ts` for rag-chat); this autonomous environment has no browser binary, so the automated witness here is the install + type + initial-render boundary.

**The primitives lane is unchanged by the blocks work** — non-block items must still install with zero `@localmode/*` packages, and both lanes must be green:

```bash
pnpm --filter ui test:portability && pnpm --filter ui test:blocks
```
