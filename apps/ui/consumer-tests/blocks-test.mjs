/**
 * Blocks-lane consumer tests for @localmode/ui.
 *
 * Every block is a single-purpose item under its category. The split blocks are
 * driven by the `SPLIT_BLOCK_LANES` spec-table + the generic `splitBlockLane`
 * near the bottom of this file; `devtools-drawer` has its own KEEP lane. `chat`
 * is covered by the committed Playwright E2E harness (`e2e/blocks/chat.spec.ts`),
 * not this install lane.
 *
 * Blocks (`ui/blocks/*`) are the WIRING layer — unlike primitives, they
 * legitimately depend on `@localmode/*` npm packages (the documented
 * carve-out from the portability invariant). This lane proves the carve-out
 * works through the REAL install path: it serves the prebuilt registry
 * (`public/r/`), runs the REAL `shadcn` CLI to install a representative block
 * into a scratch consumer, then verifies:
 *
 *   A. every block file lands at its declared target under
 *      `src/components/blocks/<category>/` and all composed primitives land as
 *      FLAT components under `src/components/`,
 *   B. the consumer's package.json now DOES contain the six `@localmode/*`
 *      packages (`core`, `react`, `transformers`, `wllama`, `langchain`,
 *      `pdfjs`) plus `lucide-react`, the `@localmode/*` packages resolve in
 *      `node_modules`, and the installed block files DO reference every
 *      carve-out package (statically or via dynamic `import()` — pdfjs is
 *      loaded lazily inside the Ingest tab) — the exact inverse of the
 *      primitives lane's witnesses A + B,
 *   C. real `tsc --noEmit` exits 0 against the packed WORKSPACE tarballs,
 *   D. the real installed block server-renders its initial (pre-Start) state
 *      — KnowledgeBaseBlock gates its model download behind explicit actions
 *      (Start / ingest / engine or model switch), so mounting it must produce
 *      the idle status line, the gated Start button, and the "not loaded"
 *      embedding-model line with no model fetch.
 *
 * A red-first plumbing check then corrupts ONE primitive import specifier
 * inside the scratch consumer's installed knowledge-base.tsx, asserts `tsc`
 * now FAILS on exactly that specifier (proving the type gate actually gates),
 * restores the file, and asserts `tsc` passes again.
 *
 * DRAWER lane: a separate scratch consumer installs `ui/blocks/devtools-drawer`
 * (the devtools observability drawer — carve-out dep: `@localmode/devtools`)
 * and asserts both drawer files land at `components/blocks/devtools-drawer/`,
 * the six composed primitives land flat, `@localmode/devtools` is declared,
 * installs, and resolves (its `@localmode/core` peer satisfied from the
 * packed workspace core tarball), `tsc --noEmit` passes, and the SHIPPED
 * framework-agnostic host renders its closed state — the toggle button only,
 * with no drawer body and no devtools activation (the body and the devtools
 * package sit behind a `React.lazy` dynamic import that never runs while
 * closed).
 *
 * VISION-LAB lane: a FOURTH scratch consumer installs `ui/blocks/vision-lab`
 * (the vision lab that grew from `ui/blocks/vision`; blocks-vision-lab task
 * 4.3) and asserts all eight block files land at
 * `components/blocks/vision-lab/`, the ten composed primitives land flat
 * (+ use-environment via capability-gate), the four `@localmode/*` deps —
 * including `@localmode/mediapipe` — are declared, install, and resolve,
 * `tsc --noEmit` passes against the packed workspace tarballs, and the
 * SHIPPED shell renders its initial four-tab state (Detect active; every
 * engine gated behind explicit in-block actions, tabs behind `next/dynamic`,
 * so no model fetch is reachable from the render).
 *
 * AUDIO-STUDIO lane: a FIFTH scratch consumer installs
 * `ui/blocks/audio-studio` (the five-tab audio workbench that grew from
 * `ui/blocks/voice`; blocks-audio-studio task 3.3 — knowledge-base stays the
 * representative install because it is the larger surface in the landed
 * catalog, so audio-studio gets this dedicated lane, mirroring vision-lab)
 * and asserts all seven block files land at `components/blocks/audio-studio/`
 * (shell + models.ts + tabs/), the seventeen composed primitives land flat
 * (+ utils/browser-utils libs), the three `@localmode/*` deps are declared,
 * install, and resolve, `tsc --noEmit` passes against the packed workspace
 * tarballs, and the SHIPPED shell renders its initial five-tab state (Notes
 * active; every model gated behind explicit in-tab actions, tab surfaces
 * behind `next/dynamic`, so no model fetch is reachable from the render).
 *
 * Package boundary (test-integrity): witnesses B–D resolve the `@localmode/*`
 * packages from `npm pack`ed WORKSPACE tarballs (the exact artifact of the
 * next publish: real dist + real type declarations, installed by real npm),
 * NOT from npm-latest. This lane is a pre-merge gate for the monorepo commit
 * — the registry block source and the workspace packages evolve together and
 * are published together, so npm-latest is an external moving target that a
 * commit cannot control. shadcn's own dependency declaration (the carve-out
 * behavior) is still asserted against the real CLI BEFORE the re-point, so a
 * block that forgets to declare its `@localmode/*` deps still fails here.
 * Whether npm-latest has caught up to the workspace is release engineering:
 * shipping the blocks change requires publishing the current workspace
 * package versions (see consumer-tests/README.md).
 *
 * Render boundary (test-integrity): witness D renders the real installed
 * block with `react-dom/server` — it is NOT a stub. The full Start → index →
 * search flow with a real model download in real Chrome is the committed
 * Playwright E2E harness's job (`e2e/blocks/`); this autonomous environment
 * has no browser binary, so the automated witness is the install + type +
 * initial-render boundary. See consumer-tests/README.md.
 *
 * Run: `pnpm --filter ui test:blocks` (requires `registry:build` first; the
 * script runs it if `public/r/ui/blocks` is missing).
 */

import { spawnSync, spawn } from 'node:child_process';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const PUBLIC_R = path.join(APP_ROOT, 'public', 'r');
// Distinct port from the portability lane (4599) so both lanes can run
// back-to-back (or concurrently) without colliding.
const PORT = 4601;
const REGISTRY_ORIGIN = `http://localhost:${PORT}`;
const REGISTRY_URL = `${REGISTRY_ORIGIN}/r/{name}.json`;

/* ── The split blocks are driven by the SPLIT_BLOCK_LANES spec-table at the
 * bottom of this file. The only real-block KEEP lane is devtools-drawer. ── */

/* ── devtools-drawer mini-lane constants ─────────────────────────────────── */

/** The devtools drawer block (blocks-devtools-observability change). */
const DRAWER_ITEM = 'ui/blocks/devtools-drawer';
/** Where the drawer's two files must land (per the item's declared `target`s). */
const DRAWER_DIR = path.join('src', 'components', 'blocks', 'devtools-drawer');
/** Both drawer files: the six-tab body + the framework-agnostic lazy host. */
const DRAWER_FILES = ['devtools-drawer.tsx', 'drawer-host.tsx'].map((rel) =>
  path.join(DRAWER_DIR, rel)
);
/** The drawer's composed primitives (4 ui/devtools/* + 2 reused local-first) — flat installs. */
const DRAWER_PRIMITIVE_FILES = [
  'inference-queue-monitor',
  'event-log-viewer',
  'pipeline-run-inspector',
  'model-cache-table',
  'device-capability-grid',
  'vector-storage-observability',
].map((name) => path.join('src', 'components', `${name}.tsx`));
/** The copy-owned lib items the drawer's primitives pull in transitively. */
const DRAWER_LIB_FILES = ['src/lib/utils.ts', 'src/lib/browser-utils.ts', 'src/lib/use-environment.ts'];
/** The drawer item's declared npm deps (the carve-out: @localmode/devtools). */
const DRAWER_CARVE_OUT_PACKAGES = ['@localmode/devtools'];
const DRAWER_NPM_DEPS = [...DRAWER_CARVE_OUT_PACKAGES, 'lucide-react'];
/**
 * `@localmode/devtools` declares a NON-optional peer on `@localmode/core`
 * (>=2.0.0). The drawer consumer satisfies it from the packed WORKSPACE core
 * tarball — the same package-boundary rationale as the main lane (npm-latest
 * is a moving target a commit cannot control).
 */
const DRAWER_PEER_PACKAGES = ['@localmode/core'];

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.error(`  ✗ ${m}`);
  failures += 1;
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

async function ensureRegistryBuilt() {
  // Presence check spans the surviving KEEP real block and one representative
  // split block per category, so a stale build triggers a rebuild.
  const required = [
    // Surviving KEEP real block (did not split)
    'devtools-drawer',
    // Wave-2 split blocks (representatives per category)
    'writing-tools/write',
    'text-insights/sentiment-analyzer',
    'image-studio/background-remover',
    'privacy/encrypted-vault',
    'vision/object-detector',
    'audio/audio-classifier',
    'text/language-detector',
    // Wave-3 split blocks (representatives per new category)
    'knowledge/rag-chat',
    'photo/duplicate-finder',
    'audio/voice-notes',
    'agents/data-extractor',
    'device/gguf-explorer',
  ];
  // Always rebuild against THIS lane's origin. `registry:build` absolutizes each
  // item's `registryDependencies` into `<origin>/r/<item>.json`, so a payload
  // built for production would make the shadcn CLI fetch transitive dependencies
  // from localmode.ai instead of the build under test.
  console.log(`building registry for ${REGISTRY_ORIGIN}…`);
  const r = run('pnpm', ['run', 'registry:build'], {
    cwd: APP_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_REGISTRY_ORIGIN: REGISTRY_ORIGIN },
  });
  if (r.status !== 0) throw new Error('registry:build failed');
  const missing = required.filter((n) => !existsSync(path.join(PUBLIC_R, 'ui', 'blocks', `${n}.json`)));
  if (missing.length > 0) {
    throw new Error(`registry:build did not emit block items: ${missing.join(', ')}`);
  }
}

async function startServer() {
  // MUST be a separate process: the harness blocks on spawnSync (shadcn/npm),
  // so an in-process server could never answer shadcn's registry fetch.
  const child = spawn('node', [path.join(HERE, 'serve-registry.mjs'), path.join(APP_ROOT, 'public'), String(PORT)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  // Wait until the port answers (poll with curl — synchronous, independent process).
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const probe = run('curl', ['-sS', '-m', '2', `http://localhost:${PORT}/r/ui/blocks/devtools-drawer.json`]);
    if (probe.status === 0 && probe.stdout.includes('ui/blocks/devtools-drawer')) return child;
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error('registry server did not become ready on port ' + PORT);
}

const CONSUMER_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'localmode-ui-blocks-consumer',
      private: true,
      type: 'module',
      // The block is a Next-app surface (its shell lazy-mounts tabs via
      // `next/dynamic`), so the consumer scaffold provides the framework —
      // exactly like it provides react. Framework deps are the consumer's;
      // the registry item declares only its own npm imports.
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', next: '^16.0.0' },
      devDependencies: {
        typescript: '^5.9.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        clsx: '^2.1.1',
        'tailwind-merge': '^3.0.0',
        'class-variance-authority': '^0.7.1',
        'lucide-react': '^0.460.0',
      },
    },
    null,
    2
  ),
  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
      },
      // Witness C type-checks ONLY the installed code (src/). The render
      // fixture (render-check.tsx) is a harness file run via tsx (which
      // supplies node globals); it is not consumer code.
      include: ['src'],
    },
    null,
    2
  ),
  'src/globals.css': '@import "tailwindcss";\n',
  'components.json': JSON.stringify(
    {
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'new-york',
      rsc: false,
      tsx: true,
      tailwind: { config: '', css: 'src/globals.css', baseColor: 'neutral', cssVariables: true },
      iconLibrary: 'lucide',
      aliases: {
        components: '@/components',
        utils: '@/lib/utils',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
      registries: { '@localmode': REGISTRY_URL },
    },
    null,
    2
  ),
};

async function scaffold(dir, renderCheck = '') {
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, 'src', 'lib'), { recursive: true });
  await mkdir(path.join(dir, 'src', 'components'), { recursive: true });
  for (const [rel, content] of Object.entries(CONSUMER_FILES)) {
    const fp = path.join(dir, rel);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, content);
  }
  await writeFile(path.join(dir, 'render-check.tsx'), renderCheck);
}

function shadcnAdd(dir, item) {
  return run('npx', ['-y', 'shadcn@4.9.0', 'add', `@localmode/${item}`, '--yes', '--silent'], {
    cwd: dir,
  });
}

function tscNoEmit(dir) {
  return run('npx', ['tsc', '--noEmit'], { cwd: dir });
}

/**
 * `npm pack` the workspace packages every lane needs into a shared `.tarballs`
 * dir (packed ONCE per run; all scratch consumers point at the same tarballs)
 * and return a map of package name → tarball path. These tarballs are the exact
 * next-publish artifacts (dist + types, packed by real npm); packages are built
 * first if their dist is missing (clean checkout reproducibility). The explicit
 * set is the UNION of every carve-out across all Wave-1/2/3 lanes + the peers
 * (`@localmode/core` is a runtime peer of react/transformers/mediapipe/wllama/
 * webllm, so it is always available for a real render even when a block declares
 * only, say, `@localmode/wllama`).
 */
const ALL_WORKSPACE_PACKAGES = [
  '@localmode/core', // universal peer + knowledge/photo/audio/agents/device blocks
  '@localmode/react', // hooks — nearly every block
  '@localmode/transformers', // knowledge/photo/audio + writing/text/image split blocks
  '@localmode/wllama', // knowledge/semantic-search + device/gguf-explorer
  '@localmode/langchain', // knowledge/semantic-search + rag-chat engine toggle
  '@localmode/pdfjs', // knowledge/* PDF ingest
  '@localmode/webllm', // agents/* (research-agent + data-extractor)
  '@localmode/mediapipe', // vision/audio/text split blocks + vision-lab composite
  '@localmode/chrome-ai', // writing-tools split blocks + composite
  '@localmode/devtools', // devtools-drawer KEEP lane
];
let packedTarballs = null;
async function packWorkspacePackages() {
  if (packedTarballs) return packedTarballs;
  const dest = path.join(os.tmpdir(), 'lm-ui-blocks-tarballs');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const tarballs = {};
  for (const pkg of ALL_WORKSPACE_PACKAGES) {
    const pkgDir = path.join(REPO_ROOT, 'packages', pkg.split('/')[1]);
    if (!existsSync(path.join(pkgDir, 'dist', 'index.d.ts'))) {
      console.log(`  building ${pkg} (dist missing)…`);
      const b = run('pnpm', ['--filter', pkg, 'build'], { cwd: REPO_ROOT });
      if (b.status !== 0) throw new Error(`build failed for ${pkg}:\n${(b.stderr || b.stdout).slice(0, 500)}`);
    }
    const p = run('npm', ['pack', '--pack-destination', dest, '--loglevel=error'], { cwd: pkgDir });
    if (p.status !== 0) throw new Error(`npm pack failed for ${pkg}:\n${(p.stderr || p.stdout).slice(0, 500)}`);
    const tarball = p.stdout.trim().split('\n').pop();
    tarballs[pkg] = path.join(dest, tarball);
  }
  packedTarballs = tarballs;
  return tarballs;
}

/**
 * Re-point the consumer's `@localmode/*` deps at the packed workspace
 * tarballs (next-publish artifacts), run the real `npm install`, and assert
 * every listed package resolved into node_modules. `packages` defaults to the
 * knowledge-base carve-out six; the drawer lane passes its own list (and may
 * include packages not yet in the consumer's package.json — peers — which
 * are ADDED as file: deps).
 */
async function installWorkspaceTarballs(dir, pkg, packages = []) {
  console.log('  re-pointing @localmode/* to packed workspace tarballs (next-publish artifacts)…');
  const tarballs = await packWorkspacePackages();
  for (const p of packages) {
    let declared = false;
    if (pkg.dependencies?.[p]) {
      pkg.dependencies[p] = `file:${tarballs[p]}`;
      declared = true;
    }
    if (pkg.devDependencies?.[p]) {
      pkg.devDependencies[p] = `file:${tarballs[p]}`;
      declared = true;
    }
    if (!declared) {
      pkg.dependencies = pkg.dependencies ?? {};
      pkg.dependencies[p] = `file:${tarballs[p]}`;
    }
  }
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
  const unresolved = packages.filter(
    (p) => !existsSync(path.join(dir, 'node_modules', ...p.split('/'), 'package.json'))
  );
  if (unresolved.length > 0) {
    bad(`witness B: ${unresolved.join(', ')} did not install into node_modules`);
    return false;
  }
  const versions = await Promise.all(
    packages.map(async (p) => {
      const j = JSON.parse(await readFile(path.join(dir, 'node_modules', ...p.split('/'), 'package.json'), 'utf8'));
      return `${p}@${j.version}`;
    })
  );
  ok(`witness B: packed workspace tarballs installed into node_modules (${versions.join(', ')})`);
  return true;
}

/** Assert the shadcn-declared npm deps in the consumer package.json; return the parsed pkg. */
async function assertDeclaredDeps(dir, label, { npmDeps = [] } = {}) {
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  const missingDeps = npmDeps.filter((p) => !declared[p]);
  if (missingDeps.length > 0) {
    bad(`${label}: shadcn add did not declare ${missingDeps.join(', ')} in the consumer package.json`);
  } else {
    ok(`${label}: package.json declares all ${npmDeps.length} npm deps (${npmDeps.map((p) => `${p}@${declared[p]}`).join(', ')})`);
  }
  return pkg;
}

/* ── Shipped-file hygiene witness (blocks-snippet-hygiene acceptance criterion) ──
 *
 * The registry:build strip transform (scripts/strip-block-snippets.ts) removes
 * every `data-testid` and all dev/QA comments (keeping only a ≤3-line @file
 * header + `/** KEEP *​/`-tagged constraints) from the SHIPPED block payloads.
 * This lane witnesses the criterion mechanically: after the real shadcn CLI
 * install, grep the LANDED block-owned files and assert (a) zero `data-testid`,
 * (b) zero QA/E2E comment markers, (c) file-header banners of ≤3 content lines.
 * `tsc --noEmit` (witness C) and the server render (witness D) then prove the
 * stripped output still compiles and renders — off testids, on text/role.
 */

/**
 * QA/E2E comment markers the strip transform removes. Each is verified present
 * in the block SOURCES and absent from the stripped payloads (2026-07-04), so a
 * survivor here means a dev/QA comment leaked into the shipped surface.
 * NOTE: `phase0` is deliberately NOT a marker — it legitimately appears inside a
 * kept `@description` header line (audio-studio notes-tab), so it is not
 * evidence of a leaked comment.
 */
const QA_COMMENT_MARKERS = [
  'Driver contract',
  'driver contract',
  'Driver testids',
  'E2E',
  'spec.ts',
  'Playwright',
];

/**
 * Content-line count of a file's `@file` header banner (the lines between the
 * `/**` and `*​/` delimiters), or `null` when the file has no `@file` banner
 * (nothing to bound). Targets the header specifically (not the first arbitrary
 * block comment) so a retained `/** KEEP *​/` constraint never false-fails.
 */
function headerContentLineCount(src) {
  const re = /\/\*\*[\s\S]*?\*\//g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[0].includes('@file')) return m[0].split('\n').length - 2;
  }
  return null;
}

/** Scan the LANDED block-owned files; return an array of hygiene violations. */
async function scanBlockHygiene(dir, blockFiles) {
  const violations = [];
  for (const rel of blockFiles) {
    const fp = path.join(dir, rel);
    if (!existsSync(fp)) {
      violations.push(`${rel}: MISSING (cannot scan)`);
      continue;
    }
    const src = await readFile(fp, 'utf8');
    // (a) zero data-testid (attributes, object keys, or comment mentions).
    const testids = (src.match(/data-testid/g) || []).length;
    if (testids > 0) violations.push(`${rel}: ${testids} data-testid occurrence(s)`);
    // (b) zero QA/E2E comment markers.
    for (const marker of QA_COMMENT_MARKERS) {
      const n = src.split(marker).length - 1;
      if (n > 0) violations.push(`${rel}: ${n}× QA/E2E marker "${marker}"`);
    }
    // (c) file-header banner ≤3 content lines.
    const headerLines = headerContentLineCount(src);
    if (headerLines !== null && headerLines > 3) {
      violations.push(`${rel}: @file header has ${headerLines} content lines (>3)`);
    }
  }
  return violations;
}

/** Positive hygiene witness: assert the landed block files meet the criterion. */
async function assertBlockHygiene(dir, label, blockFiles) {
  const violations = await scanBlockHygiene(dir, blockFiles);
  if (violations.length > 0) {
    bad(`${label}: shipped-file hygiene violations in landed files:\n${violations.join('\n')}`);
    return false;
  }
  ok(
    `${label}: all ${blockFiles.length} landed block files pass shipped-file hygiene (0 data-testid, 0 QA/E2E markers, ≤3-line headers)`
  );
  return true;
}

// Witness D (drawer lane): mount the REAL installed drawer HOST in its
// closed / never-opened state. The host's contract is zero overhead while
// closed: it renders ONLY the floating toggle button — the drawer body (and
// `@localmode/devtools` with it) sits behind `React.lazy` + a dynamic
// `import()` that never executes because `everOpened` is false, so no
// devtools activation can happen during this render. The assertions are
// therefore markup-only: the toggle is present with its never-opened
// aria-label, and NONE of the drawer-body driver hooks exist in the DOM.
const DRAWER_RENDER_CHECK = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { DevToolsDrawerHost } from '@/components/blocks/devtools-drawer/drawer-host';

const html = renderToStaticMarkup(h(DevToolsDrawerHost));
const checks: Array<[string, boolean]> = [
  // Toggle button: its real title attr (testid stripped); aria-label checked next.
  ['closed-state toggle button', html.includes('title="LocalMode DevTools"')],
  ['never-opened aria-label', html.includes('Open LocalMode DevTools')],
  // Body absence must key on REAL body-only observables: the body's own testids
  // are stripped from the shipped source, so a !testid check would be VACUOUS
  // (it would pass even if the body mounted). The drawer body renders
  // role="dialog" and the power-off / surfaces-nav aria-labels — none appear
  // while the React.lazy body stays unmounted in the closed state.
  ['drawer body NOT mounted', !html.includes('role="dialog"')],
  ['no drawer surfaces rendered', !html.includes('aria-label="Power off devtools"') && !html.includes('aria-label="DevTools surfaces"')],
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  console.error('FAIL: closed-state drawer host markup wrong: ' + failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('RENDER_OK length=' + html.length);
`;

/**
 * Red-first plumbing check for the type gate (re-anchored onto a representative
 * split-block consumer left behind by `splitBlockLane`): corrupt the FIRST
 * `@/components/<primitive>` import specifier in the block's entry file, assert
 * `tsc` now FAILS on exactly that specifier (proving witness C actually gates),
 * restore, and assert `tsc` passes again. Block-agnostic: it discovers the
 * import to corrupt from the installed source rather than hard-coding one.
 */
async function redFirstTest(consumerDir, entryRel) {
  console.log('\n[red-first] Type-gate plumbing (corrupt one @/components import → tsc must FAIL → restore → pass)');
  const blockPath = path.join(consumerDir, entryRel);
  const original = await readFile(blockPath, 'utf8');
  const m = original.match(/from '(@\/components\/[a-z0-9-]+)'/);
  if (!m) {
    bad(`red-first: no '@/components/<primitive>' import found in ${entryRel}`);
    return;
  }
  const GOOD = `from '${m[1]}'`;
  const BROKEN = `from '${m[1]}-REDFIRST-BROKEN'`;
  try {
    await writeFile(blockPath, original.replace(GOOD, BROKEN));
    const red = tscNoEmit(consumerDir);
    const output = `${red.stdout || ''}${red.stderr || ''}`;
    if (red.status === 0) {
      bad('red-first: tsc PASSED with a corrupted import specifier — the type gate is vacuous');
    } else if (!output.includes('-REDFIRST-BROKEN')) {
      bad(`red-first: tsc failed, but not on the corrupted specifier:\n${output.slice(0, 500)}`);
    } else {
      ok(`red-first: tsc FAILS on the corrupted import '${m[1]}-REDFIRST-BROKEN' (the type gate actually gates)`);
    }
  } finally {
    await writeFile(blockPath, original); // always restore, even if an assertion above threw
  }
  const green = tscNoEmit(consumerDir);
  if (green.status !== 0) {
    bad(`red-first: tsc did not recover after restoring the import:\n${(green.stdout || green.stderr).slice(0, 500)}`);
  } else {
    ok('red-first: tsc passes again after restoring the import');
  }
}

/**
 * Red-first plumbing check for the hygiene witness (re-anchored onto the same
 * representative split-block consumer): plant a `data-testid` into a landed
 * (stripped) block file, assert the hygiene scan now FLAGS it (proving the
 * witness is not vacuous), restore, and assert the scan is clean again.
 * Block-agnostic: it plants at the first `className="` anchor.
 */
async function hygieneRedFirstTest(consumerDir, entryRel, blockFiles) {
  console.log(
    '\n[red-first hygiene] Plant a data-testid into a landed block file → hygiene scan must FLAG it → restore → clean'
  );
  const baseline = await scanBlockHygiene(consumerDir, blockFiles);
  if (baseline.length > 0) {
    bad(`hygiene red-first: baseline landed files are NOT clean before planting:\n${baseline.join('\n')}`);
    return;
  }
  ok('hygiene red-first: baseline landed block files are clean (0 violations)');

  const target = path.join(consumerDir, entryRel);
  const original = await readFile(target, 'utf8');
  const ANCHOR = 'className="';
  if (!original.includes(ANCHOR)) {
    bad(`hygiene red-first: no className anchor found in ${entryRel}`);
    return;
  }
  try {
    await writeFile(
      target,
      original.replace(ANCHOR, 'data-testid="PLANTED_BY_HYGIENE_REDFIRST" className="')
    );
    const red = await scanBlockHygiene(consumerDir, blockFiles);
    const flagged = red.find((v) => v.includes('data-testid'));
    if (red.length === 0) {
      bad('hygiene red-first: scan PASSED with a planted data-testid — the hygiene witness is vacuous');
    } else if (!flagged) {
      bad(`hygiene red-first: scan failed, but not on the planted data-testid:\n${red.join('\n')}`);
    } else {
      ok(`hygiene red-first: scan FLAGS the planted data-testid (${flagged})`);
    }
  } finally {
    await writeFile(target, original); // always restore, even if an assertion above threw
  }
  const after = await scanBlockHygiene(consumerDir, blockFiles);
  if (after.length > 0) {
    bad(`hygiene red-first: landed files not clean after restore:\n${after.join('\n')}`);
  } else {
    ok('hygiene red-first: hygiene scan passes again after removing the planted data-testid');
  }
}

/**
 * Devtools-drawer mini-lane (blocks-devtools-observability change): the SAME
 * real install path proves the drawer carve-out — `shadcn add
 * ui/blocks/devtools-drawer` into a THIRD scratch consumer must land both
 * drawer files at their `components/blocks/devtools-drawer/` targets plus the
 * six composed primitives flat under `src/components/` (+ three lib files),
 * declare and resolve `@localmode/devtools` (with its `@localmode/core` peer
 * satisfied from the packed workspace tarball), pass real `tsc --noEmit`, and
 * render the SHIPPED host's closed state (toggle only — no devtools
 * activation; see DRAWER_RENDER_CHECK).
 */
async function drawerTest() {
  console.log(`\n[4/6] DevTools drawer test (real shadcn add ${DRAWER_ITEM} → @localmode/devtools PRESENT, closed-state render)`);
  const dir = path.join(os.tmpdir(), 'lm-ui-drawer-consumer');
  await scaffold(dir, DRAWER_RENDER_CHECK);

  const add = shadcnAdd(dir, DRAWER_ITEM);
  if (add.status !== 0) {
    bad(`shadcn add ${DRAWER_ITEM} failed: ${(add.stderr || add.stdout || '').slice(0, 500)}`);
    return; // nothing downstream is meaningful — fail at the first divergence
  }
  ok(`installed ${DRAWER_ITEM} via real shadcn CLI`);

  // Witness A: both drawer files at their declared targets; composed
  // primitives + libs flat/at their registry:lib targets.
  const missingDrawer = DRAWER_FILES.filter((rel) => !existsSync(path.join(dir, rel)));
  if (missingDrawer.length > 0) {
    bad(`witness A: drawer files missing at declared targets:\n${missingDrawer.join('\n')}`);
  } else {
    ok(`witness A: both drawer files landed under ${DRAWER_DIR} (body + framework-agnostic host)`);
  }
  const missingPrimitives = [...DRAWER_PRIMITIVE_FILES, ...DRAWER_LIB_FILES].filter(
    (rel) => !existsSync(path.join(dir, rel))
  );
  if (missingPrimitives.length > 0) {
    bad(`witness A: composed primitives/libs missing:\n${missingPrimitives.join('\n')}`);
  } else {
    ok(`witness A: all ${DRAWER_PRIMITIVE_FILES.length} composed primitives landed flat under src/components/ (+ ${DRAWER_LIB_FILES.length} lib files)`);
  }
  await assertBlockHygiene(dir, 'hygiene', DRAWER_FILES);
  if (missingDrawer.length > 0) return;

  // Witness B (the carve-out): @localmode/devtools is declared by the CLI and
  // the installed drawer body really imports it (statically) + the host
  // dynamic-imports it.
  const pkg = await assertDeclaredDeps(dir, 'witness B', {
    npmDeps: DRAWER_NPM_DEPS,
    carveOut: DRAWER_CARVE_OUT_PACKAGES,
  });
  const drawerSources = (
    await Promise.all(DRAWER_FILES.map((rel) => readFile(path.join(dir, rel), 'utf8')))
  ).join('\n');
  const missingImports = DRAWER_CARVE_OUT_PACKAGES.filter(
    (p) => !new RegExp(`(from\\s+'${p}')|(import\\(\\s*'${p}'\\s*\\))`, 'm').test(drawerSources)
  );
  if (missingImports.length > 0) {
    bad(`witness B: installed drawer files do not reference: ${missingImports.join(', ')}`);
  } else {
    ok('witness B: installed drawer files reference @localmode/devtools (static body import + lazy host import)');
  }

  // Re-point @localmode/devtools at the packed workspace tarball and satisfy
  // its non-optional @localmode/core peer from the packed core tarball.
  if (!(await installWorkspaceTarballs(dir, pkg, [...DRAWER_CARVE_OUT_PACKAGES, ...DRAWER_PEER_PACKAGES]))) {
    return;
  }

  // Witness C: real tsc against the installed drawer + primitives + the
  // packed devtools dist type declarations (incl. the ./react subpath).
  const tsc = tscNoEmit(dir);
  if (tsc.status !== 0) bad(`witness C: tsc failed:\n${(tsc.stdout || tsc.stderr).slice(0, 800)}`);
  else ok('witness C: real `tsc --noEmit` exits 0 against the packed @localmode/devtools tarball');

  // Witness D: closed-state render of the real installed host.
  const render = run(TSX, ['render-check.tsx'], { cwd: dir });
  if (render.status !== 0 || !render.stdout.includes('RENDER_OK')) {
    bad(`witness D: render failed:\n${(render.stdout || render.stderr).slice(0, 800)}`);
  } else {
    ok(`witness D: DevToolsDrawerHost rendered its closed (zero-overhead) state (${render.stdout.trim()})`);
  }
}


/* ══════════════════════════════════════════════════════════════════════════
 * Split-block install lanes.
 *
 * `splitBlockLane` installs ONE representative block per category through the
 * real `shadcn` CLI and witnesses: files land at their
 * `components/blocks/<category>/…` targets, the composed primitives land, the
 * block's @localmode deps are declared + resolve from packed workspace
 * tarballs, real `tsc --noEmit` passes against the STRIPPED output, the
 * stripped files pass the shipped-file hygiene criterion (0 data-testid,
 * 0 QA/E2E markers, ≤3-line headers), AND the stripped block server-renders its
 * idle state on REAL text/role observables (testids are stripped from installs).
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve the consumer-side landed path of a `@localmode/ui/<...>` registry
 * dependency. Components install FLAT under `src/components/`, `registry:lib`
 * items under `src/lib/`, `registry:hook` items under `src/hooks/`, and bare
 * shadcn items under `src/components/ui/` — so a name-keyed multi-location probe
 * is robust without hard-coding each dep's registry type.
 */
function registryDepLanded(dir, dep) {
  const base = dep.replace(/^@localmode\/ui\//, '').split('/').pop();
  const candidates = [
    ['src', 'components', `${base}.tsx`],
    ['src', 'components', `${base}.ts`],
    ['src', 'lib', `${base}.ts`],
    ['src', 'lib', `${base}.tsx`],
    ['src', 'hooks', `${base}.ts`],
    ['src', 'hooks', `${base}.tsx`],
    ['src', 'components', 'ui', `${base}.tsx`],
  ];
  return candidates.some((c) => existsSync(path.join(dir, ...c)));
}

/** The @localmode subset of a declared-deps list (the packages we re-point + import-check). */
const localmodeOf = (npmDeps) => npmDeps.filter((p) => p.startsWith('@localmode/'));

/**
 * Build a render-check.tsx that mounts the installed split block with
 * `react-dom/server` and asserts each witness (a list of substrings ALL of
 * which must be present in the static markup). The witnesses key on REAL
 * text/role observables — never `data-testid`, which the platform strip
 * transform removes from the installed files.
 */
function makeRenderCheck(importPath, componentName, witnesses) {
  const checks = witnesses
    .map((w) => {
      const cond = w.all.map((s) => `html.includes(${JSON.stringify(s)})`).join(' && ');
      return `  [${JSON.stringify(w.name)}, ${cond}],`;
    })
    .join('\n');
  return `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ${componentName} } from '${importPath}';

const html = renderToStaticMarkup(h(${componentName}));
const checks: Array<[string, boolean]> = [
${checks}
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  console.error('FAIL: initial-state content missing from rendered DOM: ' + failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('RENDER_OK length=' + html.length);
`;
}

/**
 * One representative split block per NEW category. `blockTargets` are the item's
 * declared file `target`s (the `src/` prefix is added); `registryDeps` are the
 * composed primitives/libs/hooks that must land; `npmDeps` is the item's exact
 * declared npm `dependencies` (the @localmode subset is import-checked +
 * re-pointed to packed workspace tarballs). Grounded in the built
 * `public/r/ui/blocks/**` on 2026-07-04.
 */
const SPLIT_BLOCK_LANES = [
  {
    item: 'ui/blocks/writing-tools/translate',
    tmp: 'lm-ui-split-writing-translate',
    blockTargets: ['components/blocks/writing-tools/translate.tsx'],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/input-controls/language-pair-selector',
      '@localmode/ui/local-first/provider-badge',
      '@localmode/ui/input-controls/copy-button',
      '@localmode/ui/results/error-alert',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/transformers', '@localmode/chrome-ai'],
    importPath: '@/components/blocks/writing-tools/translate',
    componentName: 'TranslateBlock',
    witnesses: [
      { name: 'status line', all: ['Translate - 24 offline Opus-MT pairs. Models load only behind an explicit action.'] },
      { name: 'provider unresolved on server tick', all: ['Preparing…'] },
      { name: 'output placeholder', all: ['Translation will appear here…'] },
    ],
  },
  {
    item: 'ui/blocks/text-insights/model-evaluator',
    tmp: 'lm-ui-split-text-model-evaluator',
    blockTargets: [
      'components/blocks/text-insights/model-evaluator.tsx',
    ],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/results/evaluation-metrics-dashboard',
      '@localmode/ui/local-first/model-loading-panel',
      '@localmode/ui/local-first/cache-badge',
      '@localmode/ui/results/error-alert',
      '@localmode/ui/results/mode-error-boundary',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/transformers', 'lucide-react'],
    importPath: '@/components/blocks/text-insights/model-evaluator',
    componentName: 'ModelEvaluatorBlock',
    witnesses: [
      { name: 'status line', all: ['Model Evaluator: classifier evaluation over labeled datasets.'] },
      { name: 'model + dataset selectors', all: ['>Model<', '>Dataset<'] },
    ],
  },
  {
    item: 'ui/blocks/image-studio/background-remover',
    tmp: 'lm-ui-split-image-bg-remover',
    blockTargets: ['components/blocks/image-studio/background-remover.tsx'],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/lib/browser-utils',
      '@localmode/ui/media-vision/media-dropzone',
      '@localmode/ui/media-vision/before-after-image-viewer',
      '@localmode/ui/media-vision/image-processing-overlay',
      '@localmode/ui/results/confidence-score-badge',
    ],
    npmDeps: ['@localmode/react', '@localmode/transformers', 'lucide-react'],
    importPath: '@/components/blocks/image-studio/background-remover',
    componentName: 'BackgroundRemoverBlock',
    witnesses: [
      { name: 'status line', all: ['Drop an image to remove its background'] },
      { name: 'idle dropzone prompt', all: ['Drop an image to remove its background'] },
    ],
  },
  {
    item: 'ui/blocks/privacy/encrypted-vault',
    tmp: 'lm-ui-split-privacy-vault',
    blockTargets: ['components/blocks/privacy/encrypted-vault.tsx'],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/security-privacy/passphrase-gate',
      '@localmode/ui/security-privacy/vault-item-card',
      '@localmode/ui/security-privacy/lock-status-badge',
      '@localmode/ui/security-privacy/password-strength-bar',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', 'lucide-react'],
    importPath: '@/components/blocks/privacy/encrypted-vault',
    componentName: 'EncryptedVaultBlock',
    witnesses: [
      {
        name: 'status line',
        all: ['A passphrase-locked, end-to-end encrypted item store with a hash-chained audit log (Web Crypto only).'],
      },
      { name: 'vault heading', all: ['Encrypted vault'] },
      { name: 'SSR-inert vault → create gate', all: ['Create your vault'] },
    ],
  },
  {
    item: 'ui/blocks/vision/live-tracker',
    tmp: 'lm-ui-split-vision-live-tracker',
    blockTargets: [
      'components/blocks/vision/live-tracker/live-tracker.tsx',
    ],
    registryDeps: [
      '@localmode/ui/media-vision/use-webcam',
      '@localmode/ui/media-vision/video-canvas',
      '@localmode/ui/local-first/capability-gate',
      '@localmode/ui/input-controls/segmented-mode-picker',
      '@localmode/ui/results/confidence-score-badge',
      '@localmode/ui/results/scored-result-bar-list',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/mediapipe', 'lucide-react'],
    importPath: '@/components/blocks/vision/live-tracker/live-tracker',
    componentName: 'LiveTrackerBlock',
    witnesses: [
      { name: 'mode picker', all: ['role="radiogroup"', 'aria-label="Streaming tracker"'] },
      { name: 'four mode labels', all: ['>Hands<', '>Pose<', '>Face<', '>Gestures<'] },
      { name: 'wasm gate pending (no engine on server tick)', all: ['Checking WebAssembly support'] },
    ],
  },
  {
    item: 'ui/blocks/audio/audio-classifier',
    tmp: 'lm-ui-split-audio-classifier',
    blockTargets: [
      'components/blocks/audio/audio-classifier/audio-classifier.tsx',
    ],
    registryDeps: [
      '@localmode/ui/local-first/capability-gate',
      '@localmode/ui/results/scored-result-bar-list',
      '@localmode/ui/audio/waveform-activity-bars',
    ],
    npmDeps: ['@localmode/core', '@localmode/mediapipe', 'lucide-react'],
    importPath: '@/components/blocks/audio/audio-classifier/audio-classifier',
    componentName: 'AudioClassifierBlock',
    witnesses: [
      { name: 'idle status line', all: ['Idle - record or upload audio to classify'] },
      { name: 'wasm gate pending', all: ['Checking WebAssembly support'] },
    ],
  },
  {
    item: 'ui/blocks/text/language-detector',
    tmp: 'lm-ui-split-text-language-detector',
    blockTargets: ['components/blocks/text/language-detector/language-detector.tsx'],
    registryDeps: [
      '@localmode/ui/local-first/capability-gate',
      '@localmode/ui/results/cosine-similarity-meter',
      '@localmode/ui/results/scored-result-bar-list',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/mediapipe'],
    importPath: '@/components/blocks/text/language-detector/language-detector',
    componentName: 'LanguageDetectorBlock',
    witnesses: [
      { name: 'sr-only block status', all: ['Language detector'] },
      { name: 'wasm gate pending', all: ['Checking WebAssembly support'] },
    ],
  },

  // ── Wave-3 split blocks (one representative per NEW category) ────────────
  // knowledge-base → knowledge/*, photo-search → photo/*, audio-studio →
  // audio/*, agent-structured-data → agents/*, device-model-lab → device/*.
  // Nested per-block dir targets `components/blocks/<category>/<slug>/<file>`.
  {
    // The `primary` split block: red-first + hygiene-red-first re-anchor here.
    item: 'ui/blocks/knowledge/rag-chat',
    tmp: 'lm-ui-split-knowledge-rag-chat',
    primary: true,
    blockTargets: ['components/blocks/knowledge/rag-chat/rag-chat.tsx'],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/local-first/model-downloader',
      '@localmode/ui/data-documents/chunk-boundary-visualizer',
      '@localmode/ui/data-documents/file-dropzone',
      '@localmode/ui/data-documents/indexed-document-card',
      '@localmode/ui/input-controls/segmented-mode-picker',
      '@localmode/ui/input-controls/parameter-slider',
      '@localmode/ui/conversation/pipeline-tracker',
      '@localmode/ui/conversation/sources',
      '@localmode/ui/conversation/source-citation-list',
      '@localmode/ui/conversation/inline-citation',
    ],
    npmDeps: [
      '@localmode/core',
      '@localmode/react',
      '@localmode/transformers',
      '@localmode/langchain',
      '@localmode/pdfjs',
      'lucide-react',
    ],
    // Imports core/react/transformers statically + pdfjs dynamically; @localmode/
    // langchain is DECLARED (the LangChain engine toggle) but reached only via the
    // promoted `useKnowledgeBase` hook in @localmode/react, so it is not a direct
    // import of the block source (still declared, installed, and type-checked).
    importedLocalmode: ['@localmode/core', '@localmode/react', '@localmode/transformers', '@localmode/pdfjs'],
    importPath: '@/components/blocks/knowledge/rag-chat/rag-chat',
    componentName: 'RagChatBlock',
    witnesses: [
      { name: 'idle status line', all: ['idle - load the sample corpus (or add text / a PDF) to index and ask grounded questions'] },
      { name: 'engine toggle', all: ['aria-label="Pipeline engine"'] },
      { name: 'engine not created during SSR', all: ['Preparing engine…'] },
    ],
  },
  {
    item: 'ui/blocks/photo/duplicate-finder',
    tmp: 'lm-ui-split-photo-duplicate-finder',
    blockTargets: ['components/blocks/photo/duplicate-finder/duplicate-finder.tsx'],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/local-first/model-selector',
      '@localmode/ui/local-first/model-downloader',
      '@localmode/ui/media-vision/media-dropzone',
      '@localmode/ui/media-vision/image-result-gallery',
      '@localmode/ui/input-controls/parameter-slider',
      '@localmode/ui/results/cosine-similarity-meter',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/transformers', 'lucide-react'],
    // Declares @localmode/core (a peer of react/transformers) but imports only
    // react + transformers directly; core is still declared, installed, typed.
    importedLocalmode: ['@localmode/react', '@localmode/transformers'],
    importPath: '@/components/blocks/photo/duplicate-finder/duplicate-finder',
    componentName: 'DuplicateFinderBlock',
    witnesses: [
      { name: 'idle status line', all: ['idle - load a model to start'] },
      { name: 'model gate helper', all: ['It embeds every photo so duplicates can be found by cosine similarity.'] },
    ],
  },
  {
    item: 'ui/blocks/audio/voice-notes',
    tmp: 'lm-ui-split-audio-voice-notes',
    blockTargets: [
      'components/blocks/audio/voice-notes/voice-notes.tsx',
    ],
    registryDeps: [
      '@localmode/ui/audio/voice-button',
      '@localmode/ui/audio/mic-selector',
      '@localmode/ui/audio/waveform-activity-bars',
      '@localmode/ui/audio/transcribed-note-card',
      '@localmode/ui/audio/synced-transcript-viewer',
      '@localmode/ui/data-documents/file-dropzone',
      '@localmode/ui/results/scored-result-bar-list',
      '@localmode/ui/local-first/model-selector',
      '@localmode/ui/local-first/model-loading-panel',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/transformers'],
    importPath: '@/components/blocks/audio/voice-notes/voice-notes',
    componentName: 'VoiceNotesBlock',
    witnesses: [
      { name: 'STT selector helper', all: ['Speech-to-text model - downloads only when you transcribe'] },
      { name: 'Whisper default model listed', all: ['Whisper Tiny EN'] },
      { name: 'notes surface gated on server tick', all: ['Preparing…'] },
    ],
  },
  {
    item: 'ui/blocks/agents/data-extractor',
    tmp: 'lm-ui-split-agents-data-extractor',
    blockTargets: [
      'components/blocks/agents/data-extractor/data-extractor.tsx',
    ],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/lib/use-environment',
      '@localmode/ui/local-first/model-selector',
      '@localmode/ui/local-first/model-downloader',
      '@localmode/ui/local-first/capability-gate',
      '@localmode/ui/conversation/structured-output-viewer',
      '@localmode/ui/conversation/in-message-error',
      '@localmode/ui/artifacts/artifact',
      '@localmode/ui/artifacts/data-table-artifact',
      '@localmode/ui/artifacts/chart-artifact',
    ],
    npmDeps: ['@localmode/core', '@localmode/react', '@localmode/webllm', 'zod'],
    importPath: '@/components/blocks/agents/data-extractor/data-extractor',
    componentName: 'DataExtractorBlock',
    witnesses: [
      { name: 'idle status line', all: ['idle - select a model and click Load'] },
      { name: 'model panel probes WebGPU on the client', all: ['Checking WebGPU support'] },
      { name: 'extractor gated on client model creation', all: ['Preparing…'] },
    ],
  },
  {
    item: 'ui/blocks/device/gguf-explorer',
    tmp: 'lm-ui-split-device-gguf-explorer',
    blockTargets: [
      'components/blocks/device/gguf-explorer/gguf-explorer.tsx',
    ],
    registryDeps: [
      '@localmode/ui/lib/utils',
      '@localmode/ui/local-first/model-search-browser',
      '@localmode/ui/local-first/model-catalog-card',
      '@localmode/ui/local-first/model-metadata-card',
      '@localmode/ui/local-first/browser-compat-card',
      '@localmode/ui/local-first/capability-gate',
      '@localmode/ui/local-first/model-downloader',
    ],
    // Declares ONLY @localmode/wllama + lucide (no @localmode/react/core — its
    // react hooks are plain react, formatBytes inlined). @localmode/core is
    // wllama's peer, added for the real render via the splitBlockLane peer path.
    npmDeps: ['@localmode/wllama', 'lucide-react'],
    importPath: '@/components/blocks/device/gguf-explorer/gguf-explorer',
    componentName: 'GgufExplorerBlock',
    witnesses: [
      { name: 'custom GGUF inspect heading', all: ['Inspect any GGUF'] },
      { name: 'custom inspect section', all: ['aria-label="Inspect a custom GGUF"'] },
      { name: 'curated catalog section', all: ['aria-label="Curated wllama model catalog"'] },
    ],
  },
];

/**
 * Generic split-block install lane (family (a)): real `shadcn add` of ONE split
 * block, then witnesses A (files + primitives landed) → hygiene (stripped) →
 * B (carve-out declared + imported + resolves from packed tarballs) →
 * C (`tsc --noEmit`) → D (stripped idle render on real text/role observables).
 */
async function splitBlockLane(spec, laneLabel) {
  console.log(`\n${laneLabel} ${spec.item} (Wave-2 split block install → idle render on real observables)`);
  const dir = path.join(os.tmpdir(), spec.tmp);
  await scaffold(dir, makeRenderCheck(spec.importPath, spec.componentName, spec.witnesses));

  const add = shadcnAdd(dir, spec.item);
  if (add.status !== 0) {
    bad(`shadcn add ${spec.item} failed: ${(add.stderr || add.stdout || '').slice(0, 500)}`);
    return; // fail at the first divergence
  }
  ok(`installed ${spec.item} via real shadcn CLI`);

  // Witness A: block-owned files at their declared targets; composed primitives landed.
  const blockFiles = spec.blockTargets.map((t) => path.join('src', t));
  const missingBlock = blockFiles.filter((rel) => !existsSync(path.join(dir, rel)));
  if (missingBlock.length > 0) {
    bad(`witness A: block files missing at declared targets:\n${missingBlock.join('\n')}`);
  } else {
    ok(`witness A: all ${blockFiles.length} block file(s) landed at their components/blocks/<category>/… targets`);
  }
  const missingDeps = spec.registryDeps.filter((d) => !registryDepLanded(dir, d));
  if (missingDeps.length > 0) {
    bad(`witness A: composed registryDependencies missing from consumer:\n${missingDeps.join('\n')}`);
  } else {
    ok(`witness A: all ${spec.registryDeps.length} composed primitives/libs/hooks landed`);
  }

  // Hygiene witness on the STRIPPED landed block files.
  await assertBlockHygiene(dir, 'hygiene', blockFiles);
  if (missingBlock.length > 0) return;

  // Witness B (carve-out): declared @localmode deps + real imports across all block files.
  const pkg = await assertDeclaredDeps(dir, 'witness B', { npmDeps: spec.npmDeps });
  const localmode = localmodeOf(spec.npmDeps);
  // Some blocks DECLARE a @localmode dep they do not import directly: a peer of a
  // composed package (duplicate-finder declares core but imports only react +
  // transformers) or a transitive dep reached via a promoted hook (rag-chat
  // declares langchain, reached via @localmode/react's useKnowledgeBase). Those
  // are STILL declared + installed + type-checked; the import-reference sub-check
  // uses `importedLocalmode` when the spec pins the truly-imported subset.
  const importCheck = spec.importedLocalmode ?? localmode;
  const blockSources = (
    await Promise.all(blockFiles.map((rel) => (existsSync(path.join(dir, rel)) ? readFile(path.join(dir, rel), 'utf8') : '')))
  ).join('\n');
  const missingImports = importCheck.filter(
    (p) => !new RegExp(`(from\\s+'${p}')|(import\\(\\s*'${p}'\\s*\\))`, 'm').test(blockSources)
  );
  if (missingImports.length > 0) {
    bad(`witness B: installed block files do not reference: ${missingImports.join(', ')}`);
  } else {
    ok(`witness B: installed block files reference all ${importCheck.length} imported @localmode packages (static or dynamic import)`);
  }

  // `@localmode/react`/`transformers`/`mediapipe` all declare a runtime import of
  // `@localmode/core` (a non-optional peer). A block that composes them but does
  // NOT itself import core (e.g. background-remover → [react, transformers]) still
  // needs core present in node_modules for witness D's real render to resolve, so
  // it is re-pointed to the packed workspace tarball as a peer (ADDED as a file:
  // dep — the same mechanism the drawer lane uses for its @localmode/core peer).
  // Witness B already validated the block's DECLARED deps above, so this peer add
  // does not mask a missing declaration.
  const installPkgs = [...new Set([...localmode, '@localmode/core'])];
  if (!(await installWorkspaceTarballs(dir, pkg, installPkgs))) return;

  // Witness C: real tsc against the STRIPPED installed block + primitives + packed tarballs.
  const tsc = tscNoEmit(dir);
  if (tsc.status !== 0) bad(`witness C: tsc failed:\n${(tsc.stdout || tsc.stderr).slice(0, 800)}`);
  else ok('witness C: real `tsc --noEmit` exits 0 against the STRIPPED output + packed @localmode tarballs');

  // Witness D: real render of the STRIPPED installed block's idle state.
  const render = run(TSX, ['render-check.tsx'], { cwd: dir });
  if (render.status !== 0 || !render.stdout.includes('RENDER_OK')) {
    bad(`witness D: render failed:\n${(render.stdout || render.stderr).slice(0, 800)}`);
  } else {
    ok(`witness D: ${spec.componentName} rendered its stripped idle state on real observables (${render.stdout.trim()})`);
  }
  // Return the scratch consumer + entry file so the primary lane can re-anchor
  // the red-first (type gate) + hygiene-red-first plumbing checks onto it.
  return { dir, entryRel: blockFiles[0], blockFiles };
}

async function main() {
  await ensureRegistryBuilt();
  const server = await startServer();
  try {
    // ── KEEP lane (the ONLY real block that did NOT split) ────────────────
    await drawerTest(); // devtools-drawer

    // ── (a) Wave-2 + Wave-3 split-block representative install lanes ───────
    // Capture the primary (knowledge/rag-chat) consumer so the red-first type
    // gate + hygiene-red-first plumbing checks re-anchor onto a real install.
    let primary = null;
    for (let i = 0; i < SPLIT_BLOCK_LANES.length; i++) {
      const spec = SPLIT_BLOCK_LANES[i];
      const result = await splitBlockLane(spec, `[split ${i + 1}/${SPLIT_BLOCK_LANES.length}]`);
      if (spec.primary && result) primary = result;
    }
    if (primary && existsSync(path.join(primary.dir, primary.entryRel))) {
      await redFirstTest(primary.dir, primary.entryRel);
      await hygieneRedFirstTest(primary.dir, primary.entryRel, primary.blockFiles);
    } else {
      bad('red-first: skipped — primary split-block consumer (knowledge/rag-chat) unavailable');
    }
  } finally {
    server.kill();
  }
  console.log(`\n${failures === 0 ? '✅ blocks-lane tests passed' : `❌ ${failures} blocks-lane check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
