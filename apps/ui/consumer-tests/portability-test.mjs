/**
 * Portability consumer tests for @localmode/ui.
 *
 * Proves the portability guarantee through the REAL install path: it serves the
 * prebuilt registry (`public/r/`), runs the REAL `shadcn` CLI to install
 * representative items into a scratch project that has NO `@localmode/*`
 * packages, then verifies with independent witnesses:
 *
 *   A. no `@localmode/*` import statement in the installed code,
 *   B. no `@localmode/*` package in the consumer's package.json,
 *   C. real `tsc --noEmit` exits 0,
 *   D. the real installed component renders fixture data to real DOM
 *      (server render via react-dom/server — see "Render boundary" below).
 *
 * A red-first NEGATIVE test then installs a deliberately-coupled fixture item
 * (a component that imports `@localmode/react` at runtime) and asserts witness A
 * FAILS for it — proving the detector catches a reintroduced dependency rather
 * than passing vacuously. A second red-first check does the same for the TYPE
 * gate on the devtools family: an `@localmode/devtools` import is injected into
 * the scratch consumer's installed copy of a `ui/devtools/*` component, `tsc`
 * is asserted to FAIL on it, and the file is restored.
 *
 * Render boundary (test-integrity): witness D renders the real component with
 * `react-dom/server`. That is a genuine render of the real installed component
 * from fixture props — it is NOT a stub of the component. A full *visual* render
 * in real Chrome is covered by the apps/ui docs previews (every component is
 * rendered in a real browser via <ComponentPreview>); this autonomous test
 * environment has no browser binary, so the automated witness uses server
 * render. See consumer-tests/README.md.
 *
 * Run: `pnpm --filter ui test:portability` (requires `registry:build` first;
 * the script runs it if `public/r` is missing).
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
const PORT = 4599;
const REGISTRY_ORIGIN = `http://localhost:${PORT}`;
const REGISTRY_URL = `${REGISTRY_ORIGIN}/r/{name}.json`;

// Representative items: both copy-owned libs, a pure props component (+ its
// cross-family registry dep), a Tier-1 lib consumer, two Tier-2 lib consumers,
// a markdown-backed component, the newest pure props primitive
// (vector-export-panel, added with the knowledge-base block — a block
// COMPOSES it, but the primitive itself must stay portable), ALL FOUR
// `ui/devtools/*` primitives (added with the devtools family — they mirror
// `@localmode/devtools` bridge snapshots as LOCAL `…Like` shapes and must
// stay zero-`@localmode/*` even though a block wires them to the devtools
// hooks), and `ui/local-first/capability-gate` (extended with the
// `camera`/`microphone` media-availability entries by blocks-vision-lab —
// the detection reads only browser APIs from the copy-owned use-environment
// and must keep installing/compiling/rendering with zero `@localmode/*`).
// `ui/local-first/chrome-ai-download-gate` (added with the Chrome AI download
// gate — the writing-tools blocks COMPOSE it and wire it to
// `useProviderFallback`, but the primitive renders a plain availability enum
// and must stay zero-`@localmode/*`).
// All registryDependencies are local `@localmode/ui/*` and npm deps are
// non-@localmode.
const ITEMS = [
  'ui/lib/browser-utils',
  'ui/lib/use-environment',
  'ui/results/scored-result-bar-list',
  'ui/results/threshold-calibration-panel',
  'ui/data-documents/file-dropzone',
  'ui/device-badge',
  'ui/local-first/network-badge',
  'ui/local-first/capability-gate',
  'ui/conversation/response',
  'ui/local-first/vector-export-panel',
  'ui/local-first/chrome-ai-download-gate',
  'ui/devtools/inference-queue-monitor',
  'ui/devtools/event-log-viewer',
  'ui/devtools/pipeline-run-inspector',
  'ui/devtools/model-cache-table',
  // The three new security-privacy primitives added with the privacy-vault
  // block (blocks-privacy-vault). A block COMPOSES them (and their
  // @localmode/* wiring), but the primitives themselves stay portable: local
  // prop shapes, zero @localmode/* imports. passphrase-gate additionally
  // composes password-strength-bar via a @/components/<item> sibling import, so
  // installing it exercises the cross-item resolution too.
  'ui/security-privacy/passphrase-gate',
  'ui/security-privacy/vault-item-card',
  'ui/security-privacy/lock-status-badge',
  // The five shared primitives + one registry hook promoted by
  // blocks-shared-promotions (Wave 1). Each is a shipped file that MUST be BORN
  // CLEAN (no data-testid, no QA/E2E comments, ≤3-line header — the promotion,
  // not the block strip transform, cleans them) and stay zero-@localmode.
  // provider-badge composes provider-fallback-badge and system-prompt-editor
  // composes option-list via @/components/<item> siblings, so installing them
  // exercises cross-item resolution too. use-webcam is a `registry:hook`
  // (installs to src/hooks/use-webcam.ts) — zero deps, browser APIs only.
  'ui/results/error-alert',
  'ui/results/mode-error-boundary',
  'ui/input-controls/copy-button',
  'ui/input-controls/system-prompt-editor',
  'ui/local-first/provider-badge',
  'ui/media-vision/use-webcam',
];

// The shipped files the six Wave-1 promotions land, and the born-clean
// invariant each must satisfy in its INSTALLED form. `src/hooks/use-webcam.ts`
// is the registry:hook install target; the rest land flat under src/components.
const BORN_CLEAN_FILES = [
  'src/components/error-alert.tsx',
  'src/components/mode-error-boundary.tsx',
  'src/components/copy-button.tsx',
  'src/components/system-prompt-editor.tsx',
  'src/components/provider-badge.tsx',
  'src/hooks/use-webcam.ts',
];

// QA/E2E scaffolding markers that must NOT survive into a shipped primitive.
const QA_MARKERS = /data-testid|data-test\b|testId|retryTestId|Driver contract|Playwright|playwright|\bE2E\b|\be2e\b/;

/**
 * Count the file-header comment lines — comment lines that appear BEFORE the
 * first real code statement, skipping the `'use client'` directive and blank
 * lines. A born-clean primitive has none (its JSDoc sits on the exports, after
 * the imports); a block-local file with a stripped-but-present @file header
 * would report >0. The born-clean rule caps this at 3.
 */
function headerCommentLineCount(content) {
  let count = 0;
  let inBlock = false;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (!inBlock && (line === "'use client';" || line === '"use client";')) continue;
    if (inBlock) {
      count++;
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      count++;
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//')) {
      count++;
      continue;
    }
    // First non-directive, non-comment line = real code → header is over.
    break;
  }
  return count;
}

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
  if (!existsSync(path.join(PUBLIC_R, 'ui', 'lib', 'browser-utils.json'))) {
    throw new Error('registry:build did not emit public/r');
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
    const probe = run('curl', ['-sS', '-m', '2', `http://localhost:${PORT}/r/ui/lib/browser-utils.json`]);
    if (probe.status === 0 && probe.stdout.includes('ui/lib/browser-utils')) return child;
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error('registry server did not become ready on port ' + PORT);
}

const CONSUMER_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'localmode-ui-portability-consumer',
      private: true,
      type: 'module',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
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
      // Witness C type-checks ONLY the installed components (src/). The render
      // fixtures (render-check.tsx / ai-sdk-check.tsx) are harness files run via
      // tsx (which supplies node globals); they are not consumer code.
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

const RENDER_CHECK = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { CapabilityGate } from '@/components/capability-gate';
import { ThresholdCalibrationPanel } from '@/components/threshold-calibration-panel';

const html = renderToStaticMarkup(
  h(ScoredResultBarList, {
    results: [
      { label: 'positive', score: 0.92 },
      { label: 'neutral', score: 0.06 },
      { label: 'negative', score: 0.02 },
    ],
  })
);
const passed = html.includes('positive') && html.includes('92') && html.includes('neutral');
if (!passed) { console.error('FAIL: fixture content missing from rendered DOM'); process.exit(1); }

// threshold-calibration-panel (blocks-text-insights): the real installed panel
// renders fixture calibration data with zero @localmode packages — the
// calibrated threshold, the preset comparison, and the active model's preset
// reference row must all appear in the rendered DOM.
const calHtml = renderToStaticMarkup(
  h(ThresholdCalibrationPanel, {
    calibration: {
      threshold: 0.6234,
      percentile: 90,
      sampleSize: 20,
      modelId: 'Xenova/bge-small-en-v1.5',
      distanceFunction: 'cosine' as const,
      distribution: { mean: 0.4187, median: 0.4021, stdDev: 0.1103, min: 0.1442, max: 0.7318, count: 190 },
    },
    presetThreshold: 0.5,
    presets: [
      { modelId: 'Xenova/bge-small-en-v1.5', threshold: 0.5 },
      { modelId: 'Xenova/all-MiniLM-L6-v2', threshold: 0.68 },
    ],
  })
);
if (!calHtml.includes('0.6234') || !calHtml.includes('0.5000') || !calHtml.includes('Xenova/bge-small-en-v1.5')) {
  console.error('FAIL: threshold-calibration-panel fixture content missing from rendered DOM');
  process.exit(1);
}

// capability-gate media entries (blocks-vision-lab): the real installed gate
// renders with the new 'camera'/'microphone' GateCapability values — the
// server render takes the pending path (detection is effect-driven), whose
// notice carries the entry's human-readable LABEL, so the assertion proves
// the media entries exist in the installed component.
const cameraHtml = renderToStaticMarkup(
  h(CapabilityGate, { requires: 'camera' as const }, h('p', null, 'webcam surface'))
);
const micHtml = renderToStaticMarkup(
  h(CapabilityGate, { requires: 'microphone' as const }, h('p', null, 'mic surface'))
);
if (!cameraHtml.includes('Camera') || !micHtml.includes('Microphone')) {
  console.error('FAIL: capability-gate media entry labels missing from rendered DOM');
  process.exit(1);
}
console.log('RENDER_OK length=' + (html.length + cameraHtml.length + micHtml.length + calHtml.length));
`;

// Devtools-family render witness: the real installed ModelCacheTable and
// InferenceQueueMonitor render bridge-shaped FIXTURE data (static objects
// mirroring @localmode/devtools snapshots — the components' local `…Like`
// contracts) with zero @localmode packages installed. Expected strings are
// grounded in the component sources: formatDuration(1840) → "1.8s",
// formatBytes(34_100_000) → "32.5 MB" (the formatter is MiB-based:
// 34,100,000 / 1,048,576 = 32.52), the active-queue badge renders
// "<n> active".
const DEVTOOLS_RENDER_CHECK = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ModelCacheTable } from '@/components/model-cache-table';
import { InferenceQueueMonitor } from '@/components/inference-queue-monitor';

const tableHtml = renderToStaticMarkup(
  h(ModelCacheTable, {
    entries: {
      'Xenova/bge-small-en-v1.5': {
        modelId: 'Xenova/bge-small-en-v1.5',
        status: 'loaded',
        loadDurationMs: 1840,
        lastUsed: new Date().toISOString(),
        sizeBytes: 34_100_000,
      },
      'onnx-community/granite-4.0-350m-ONNX-web': {
        modelId: 'onnx-community/granite-4.0-350m-ONNX-web',
        status: 'error',
        loadDurationMs: 460,
        lastUsed: new Date().toISOString(),
      },
    },
  })
);
const queueHtml = renderToStaticMarkup(
  h(InferenceQueueMonitor, {
    queues: {
      'chat-inference': { pending: 3, active: 1, completed: 41, failed: 2, avgLatencyMs: 212 },
    },
  })
);
const checks: Array<[string, boolean]> = [
  ['model id cell', tableHtml.includes('Xenova/bge-small-en-v1.5')],
  ['loaded status badge', tableHtml.includes('loaded')],
  ['formatted load duration', tableHtml.includes('1.8s')],
  ['formatted size column', tableHtml.includes('32.5 MB')],
  ['error status badge', tableHtml.includes('error')],
  ['queue name', queueHtml.includes('chat-inference')],
  ['active-queue live badge', queueHtml.includes('1 active')],
  ['completed metric', queueHtml.includes('41')],
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  console.error('FAIL: devtools fixture content missing from rendered DOM: ' + failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('DEVTOOLS_RENDER_OK length=' + (tableHtml.length + queueHtml.length));
`;

// Security-privacy render witness (blocks-privacy-vault): the three new
// primitives render fixture data with zero @localmode packages installed.
// passphrase-gate composes password-strength-bar through the @/components/<item>
// sibling import, so a successful render also proves that cross-item resolution
// works in the flat consumer install. Expected strings are grounded in the
// component sources: PassphraseGate's default create title is "Create vault"
// and it renders a "Passphrase" field label; VaultItemCard renders its title
// while locked and masks the body ("Locked"); LockStatusBadge renders the
// "Unlocked" label for status="unlocked".
const SECURITY_RENDER_CHECK = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { PassphraseGate } from '@/components/passphrase-gate';
import { VaultItemCard } from '@/components/vault-item-card';
import { LockStatusBadge } from '@/components/lock-status-badge';

const gateHtml = renderToStaticMarkup(
  h(PassphraseGate, {
    mode: 'create' as const,
    onSubmit: () => {},
    strength: { value: 72, label: 'Strong', color: 'success' as const },
  })
);
const cardHtml = renderToStaticMarkup(
  h(VaultItemCard, { title: 'API keys', kind: 'note' as const, locked: true })
);
const badgeHtml = renderToStaticMarkup(h(LockStatusBadge, { status: 'unlocked' as const }));

const checks: Array<[string, boolean]> = [
  ['passphrase-gate create title', gateHtml.includes('Create vault')],
  ['passphrase-gate field label', gateHtml.includes('Passphrase')],
  ['passphrase-gate composed strength bar', gateHtml.includes('Password strength')],
  ['vault-item-card title', cardHtml.includes('API keys')],
  ['vault-item-card locked mask', cardHtml.includes('Locked')],
  ['lock-status-badge unlocked label', badgeHtml.includes('Unlocked')],
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  console.error('FAIL: security-privacy fixture content missing from rendered DOM: ' + failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('SECURITY_RENDER_OK length=' + (gateHtml.length + cardHtml.length + badgeHtml.length));
`;

// Promoted-primitives render witness (blocks-shared-promotions Wave 1): the five
// new primitives render fixture data with zero @localmode packages installed.
// provider-badge composes provider-fallback-badge and system-prompt-editor
// composes option-list through @/components/<item> sibling imports, so a
// successful render of BOTH also proves cross-item resolution in the flat
// consumer install. Expected strings are grounded in the component sources:
// ErrorAlert renders role="alert" + the message; CopyButton's idle label is
// "Copy"; ProviderBadge surfaces the composed provider name "Chrome AI" AND the
// served model id "gemini-nano"; SystemPromptEditor's composed OptionList
// renders the "Concise answers" preset label; ModeErrorBoundary renders its
// children on the happy path.
const PRIMITIVES_RENDER_CHECK = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { CopyButton } from '@/components/copy-button';
import { ProviderBadge } from '@/components/provider-badge';
import { SystemPromptEditor } from '@/components/system-prompt-editor';
import { ModeErrorBoundary } from '@/components/mode-error-boundary';

const alertHtml = renderToStaticMarkup(
  h(ErrorAlert, { message: 'Model failed to load: request timed out.', onDismiss: () => {} })
);
const copyHtml = renderToStaticMarkup(h(CopyButton, { value: 'hello world' }));
const badgeHtml = renderToStaticMarkup(
  h(ProviderBadge, { providerName: 'Chrome AI', tier: 'built-in' as const, modelId: 'gemini-nano' })
);
const editorHtml = renderToStaticMarkup(
  h(SystemPromptEditor, { value: 'You are a helpful assistant.', onChange: () => {} })
);
const boundaryHtml = renderToStaticMarkup(
  h(ModeErrorBoundary, null, h('p', null, 'child rendered'))
);

const checks: Array<[string, boolean]> = [
  ['error-alert role + message', alertHtml.includes('role="alert"') && alertHtml.includes('Model failed to load')],
  ['copy-button idle label', copyHtml.includes('Copy')],
  ['provider-badge composed provider name (cross-item)', badgeHtml.includes('Chrome AI')],
  ['provider-badge served model id', badgeHtml.includes('gemini-nano')],
  ['system-prompt-editor composed preset (cross-item option-list)', editorHtml.includes('Concise answers')],
  ['mode-error-boundary renders children', boundaryHtml.includes('child rendered')],
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  console.error('FAIL: promoted primitive fixture content missing from rendered DOM: ' + failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('PRIMITIVES_RENDER_OK length=' + (alertHtml.length + copyHtml.length + badgeHtml.length + editorHtml.length + boundaryHtml.length));
`;

async function scaffold(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, 'src', 'lib'), { recursive: true });
  await mkdir(path.join(dir, 'src', 'components'), { recursive: true });
  for (const [rel, content] of Object.entries(CONSUMER_FILES)) {
    const fp = path.join(dir, rel);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, content);
  }
  await writeFile(path.join(dir, 'render-check.tsx'), RENDER_CHECK);
  await writeFile(path.join(dir, 'devtools-render-check.tsx'), DEVTOOLS_RENDER_CHECK);
  await writeFile(path.join(dir, 'security-render-check.tsx'), SECURITY_RENDER_CHECK);
  await writeFile(path.join(dir, 'primitives-render-check.tsx'), PRIMITIVES_RENDER_CHECK);
}

function shadcnAdd(dir, item) {
  return run('npx', ['-y', 'shadcn@4.9.0', 'add', `@localmode/${item}`, '--yes', '--silent'], {
    cwd: dir,
  });
}

function grepLocalmodeImports(dir) {
  // Real import statements only (not JSDoc mentions): `import ... from '@localmode/...'`
  const r = run('grep', ['-rnE', "^\\s*import\\b.*from\\s+'@localmode/", path.join(dir, 'src')]);
  return r.stdout.trim();
}

async function positiveTest(server) {
  console.log('\n[1/4] Zero-dependency consumer test (real shadcn add → no @localmode)');
  const dir = path.join(os.tmpdir(), 'lm-ui-portability-consumer');
  await scaffold(dir);
  for (const item of ITEMS) {
    const r = shadcnAdd(dir, item);
    if (r.status !== 0) bad(`shadcn add ${item} failed: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  }
  ok(`installed ${ITEMS.length} representative items via real shadcn CLI`);

  // Witness A: no @localmode import statements in installed code
  const imports = grepLocalmodeImports(dir);
  if (imports) bad(`@localmode import statements found in installed code:\n${imports}`);
  else ok('witness A: zero @localmode import statements in installed code');

  // Witness B: no @localmode package in consumer package.json
  const pkg = await readFile(path.join(dir, 'package.json'), 'utf8');
  if (pkg.includes('@localmode')) bad('witness B: @localmode package present in consumer package.json');
  else ok('witness B: zero @localmode packages in consumer package.json');

  // Install non-@localmode deps, then witness C: real tsc
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
  const tsc = run('npx', ['tsc', '--noEmit'], { cwd: dir });
  if (tsc.status !== 0) bad(`witness C: tsc failed:\n${(tsc.stdout || tsc.stderr).slice(0, 800)}`);
  else ok('witness C: real `tsc --noEmit` exits 0');

  // Witness D: real render of the real installed component from fixtures
  const render = run(TSX, ['render-check.tsx'], { cwd: dir });
  if (render.status !== 0 || !render.stdout.includes('RENDER_OK')) {
    bad(`witness D: render failed:\n${(render.stdout || render.stderr).slice(0, 500)}`);
  } else {
    ok(`witness D: real component render produced fixture DOM (${render.stdout.trim()})`);
  }

  // Witness D (devtools family): the installed devtools primitives render
  // bridge-shaped fixture data — proving the local `…Like` prop contracts
  // work without @localmode/devtools installed.
  const devtoolsRender = run(TSX, ['devtools-render-check.tsx'], { cwd: dir });
  if (devtoolsRender.status !== 0 || !devtoolsRender.stdout.includes('DEVTOOLS_RENDER_OK')) {
    bad(
      `witness D (devtools): render failed:\n${(devtoolsRender.stdout || devtoolsRender.stderr).slice(0, 500)}`
    );
  } else {
    ok(
      `witness D (devtools): ModelCacheTable + InferenceQueueMonitor rendered bridge-shaped fixtures (${devtoolsRender.stdout.trim()})`
    );
  }

  // Witness D (security-privacy family): the three new privacy-vault primitives
  // render fixture data — proving they stay zero-@localmode even though the
  // block wires them to useEncryptedVault. passphrase-gate's render also proves
  // the cross-item @/components/password-strength-bar sibling import resolves.
  const securityRender = run(TSX, ['security-render-check.tsx'], { cwd: dir });
  if (securityRender.status !== 0 || !securityRender.stdout.includes('SECURITY_RENDER_OK')) {
    bad(
      `witness D (security-privacy): render failed:\n${(securityRender.stdout || securityRender.stderr).slice(0, 500)}`
    );
  } else {
    ok(
      `witness D (security-privacy): PassphraseGate + VaultItemCard + LockStatusBadge rendered fixtures (${securityRender.stdout.trim()})`
    );
  }

  // Born-clean witnesses (blocks-shared-promotions Wave 1): the six promoted
  // shipped files (five primitives + the registry hook) must land BORN CLEAN —
  // zero data-testid, zero QA/E2E scaffolding comments, and a ≤3-line file
  // header — inspected on the REAL installed copies, not the registry source.
  for (const rel of BORN_CLEAN_FILES) {
    const fp = path.join(dir, rel);
    if (!existsSync(fp)) {
      bad(`born-clean: expected installed file missing: ${rel}`);
      continue;
    }
    const content = await readFile(fp, 'utf8');
    if (/data-testid/.test(content)) {
      bad(`born-clean: ${rel} contains a data-testid`);
    } else if (QA_MARKERS.test(content)) {
      bad(`born-clean: ${rel} contains a QA/E2E scaffolding marker`);
    } else {
      const header = headerCommentLineCount(content);
      if (header > 3) bad(`born-clean: ${rel} has a ${header}-line header (max 3)`);
      else ok(`born-clean: ${rel} — no data-testid, no QA markers, ${header}-line header`);
    }
  }

  // Witness D (promoted primitives): the five new primitives render fixture data
  // with zero @localmode packages — and provider-badge/system-prompt-editor
  // render proves their @/components/<item> cross-item siblings resolve in the
  // flat install.
  const primitivesRender = run(TSX, ['primitives-render-check.tsx'], { cwd: dir });
  if (primitivesRender.status !== 0 || !primitivesRender.stdout.includes('PRIMITIVES_RENDER_OK')) {
    bad(
      `witness D (promoted primitives): render failed:\n${(primitivesRender.stdout || primitivesRender.stderr).slice(0, 500)}`
    );
  } else {
    ok(
      `witness D (promoted primitives): ErrorAlert + CopyButton + ProviderBadge + SystemPromptEditor + ModeErrorBoundary rendered fixtures, cross-item siblings resolved (${primitivesRender.stdout.trim()})`
    );
  }
  return dir;
}

async function negativeTest(consumerDir) {
  console.log('\n[2/4] Red-first negative test (detector catches a reintroduced @localmode import)');
  // Synthesize a deliberately-coupled registry item that imports @localmode/react.
  const coupledDir = path.join(PUBLIC_R, 'ui');
  const coupledJsonPath = path.join(coupledDir, '__coupled-fixture.json');
  const coupled = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: 'ui/__coupled-fixture',
    type: 'registry:component',
    title: 'Coupled fixture',
    description: 'TEST ONLY — imports @localmode/react at runtime to prove the detector fails.',
    dependencies: [],
    registryDependencies: [],
    files: [
      {
        path: 'registry/localmode/__coupled-fixture/__coupled-fixture.tsx',
        type: 'registry:component',
        target: 'components/__coupled-fixture.tsx',
        content:
          "import { useCapabilities } from '@localmode/react';\n" +
          'export function CoupledFixture() {\n' +
          '  const { capabilities } = useCapabilities();\n' +
          '  return null;\n' +
          '}\n',
      },
    ],
    categories: ['internal'],
  };
  await writeFile(coupledJsonPath, JSON.stringify(coupled, null, 2));
  try {
    const add = shadcnAdd(consumerDir, 'ui/__coupled-fixture');
    if (add.status !== 0) {
      bad(`could not install coupled fixture to exercise the detector: ${(add.stderr || '').slice(0, 200)}`);
      return;
    }
    const imports = grepLocalmodeImports(consumerDir);
    if (imports.includes('__coupled-fixture') || imports.includes('@localmode/react')) {
      ok('detector correctly FLAGS the reintroduced @localmode import (red-first proven)');
    } else {
      bad('detector did NOT catch the coupled fixture — witness A is vacuous');
    }
  } finally {
    await rm(coupledJsonPath, { force: true });
    await rm(path.join(consumerDir, 'src', 'components', '__coupled-fixture.tsx'), { force: true });
  }
}

/**
 * Red-first TYPE-GATE test for the devtools family: temporarily inject an
 * `@localmode/devtools` import into the scratch consumer's installed COPY of
 * model-cache-table.tsx (the registry source is never touched), assert the
 * real compiler FAILS on it (the consumer has zero @localmode packages, so a
 * reintroduced runtime import cannot resolve), assert the grep detector
 * (witness A) flags it too, then restore and assert `tsc` recovers. Runs
 * BEFORE the AI-SDK section so the consumer is in the exact state that
 * already passed witness C — a red here can only come from the injection.
 */
async function devtoolsRedFirstTest(consumerDir) {
  console.log(
    '\n[3/4] Red-first devtools type-gate test (inject @localmode import into an installed devtools component → tsc must FAIL → restore → pass)'
  );
  const target = path.join(consumerDir, 'src', 'components', 'model-cache-table.tsx');
  const original = await readFile(target, 'utf8');
  const INJECTED = "import { enableDevTools } from '@localmode/devtools';\n";
  try {
    await writeFile(target, INJECTED + original);

    // The witness-A detector must flag the injected import.
    const imports = grepLocalmodeImports(consumerDir);
    if (imports.includes('@localmode/devtools')) {
      ok('witness-A detector FLAGS the injected @localmode/devtools import');
    } else {
      bad('witness-A detector did NOT flag the injected @localmode/devtools import');
    }

    // The real compiler must fail on exactly that module specifier.
    const red = run('npx', ['tsc', '--noEmit'], { cwd: consumerDir });
    const output = `${red.stdout || ''}${red.stderr || ''}`;
    if (red.status === 0) {
      bad('tsc PASSED with an @localmode import in a zero-@localmode consumer — the type gate is vacuous');
    } else if (!output.includes('@localmode/devtools')) {
      bad(`tsc failed, but not on the injected specifier:\n${output.slice(0, 500)}`);
    } else {
      ok('tsc FAILS on the injected @localmode/devtools import (red-first proven)');
    }
  } finally {
    await writeFile(target, original); // always restore, even if an assertion above threw
  }
  const green = run('npx', ['tsc', '--noEmit'], { cwd: consumerDir });
  if (green.status !== 0) {
    bad(`tsc did not recover after restoring the component:\n${(green.stdout || green.stderr).slice(0, 500)}`);
  } else {
    ok('tsc passes again after restoring the component');
  }
}

async function aiSdkTest(consumerDir) {
  console.log('\n[4/4] AI-SDK data-shape test (mapping + render of @ai-sdk/react-shaped parts)');
  // Boundary: the mapping (documented in use-with-ai-sdk.mdx) + the components,
  // NOT a hosted model. A scripted, AI-SDK-shaped message stands in for the
  // model layer by design — no API keys, no network model call. A full live
  // `useChat` streaming lifecycle in real Chrome is covered by the docs preview
  // / CI Playwright step (see consumer-tests/README.md); this environment has no
  // browser binary, so the automated test asserts the mapping+render boundary.
  const entry = `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h, Fragment } from 'react';
import { Conversation, ConversationContent } from '@/components/conversation';
import { Message, MessageContent } from '@/components/message';

// An @ai-sdk/react-shaped message (UIMessage): role + typed parts.
const aiSdkMessages = [
  { id: 'a1', role: 'assistant', parts: [
    { type: 'reasoning', text: 'Let me think about the capital.' },
    { type: 'text', text: 'The capital of France is **Paris**.' },
    { type: 'tool-lookup', state: 'output-available', input: { q: 'capital France' }, output: { answer: 'Paris' } },
  ] },
];

// The documented mapping: parts -> component props. MessageContent renders the
// markdown text itself via its content prop.
const text = (m) => m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('');

const html = renderToStaticMarkup(
  h(Conversation, null,
    h(ConversationContent, null,
      aiSdkMessages.map((m) =>
        h(Message, { key: m.id, role: m.role },
          h(MessageContent, { content: text(m), role: m.role })))))
);

const passed = html.includes('Paris');
if (!passed) { console.error('FAIL: mapped AI-SDK text did not render'); process.exit(1); }
console.log('AI_SDK_RENDER_OK length=' + html.length);
`;
  // Conversation + Message pull bare shadcn deps (avatar/button/dialog); install them.
  for (const item of ['ui/conversation/conversation', 'ui/conversation/message']) {
    const r = shadcnAdd(consumerDir, item);
    if (r.status !== 0) {
      bad(`shadcn add ${item} (for AI-SDK render) failed: ${(r.stderr || '').slice(0, 200)}`);
      return;
    }
  }
  await writeFile(path.join(consumerDir, 'ai-sdk-check.tsx'), entry);
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: consumerDir });
  const render = run(TSX, ['ai-sdk-check.tsx'], { cwd: consumerDir });
  if (render.status !== 0 || !render.stdout.includes('AI_SDK_RENDER_OK')) {
    bad(`AI-SDK mapping render failed:\n${(render.stdout || render.stderr).slice(0, 500)}`);
  } else {
    ok(`AI-SDK-shaped parts render through the documented mapping (${render.stdout.trim()})`);
  }
}

async function main() {
  await ensureRegistryBuilt();
  const server = await startServer();
  try {
    const consumerDir = await positiveTest(server);
    await negativeTest(consumerDir);
    await devtoolsRedFirstTest(consumerDir);
    await aiSdkTest(consumerDir);
  } finally {
    server.kill();
  }
  console.log(`\n${failures === 0 ? '✅ portability tests passed' : `❌ ${failures} portability check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
