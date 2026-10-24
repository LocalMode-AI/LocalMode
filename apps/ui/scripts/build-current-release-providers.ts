/**
 * Build the second bundle of the four LocalMode provider packages that the
 * `current-releases` bench control kind loads: the providers' own source
 * (packages/<provider>/src), unchanged, compiled against the runtimes' npm
 * releases installed under the aliases in apps/ui/package.json instead of the
 * releases the providers pin.
 *
 *   @localmode/transformers -> @huggingface/transformers-current
 *   @localmode/webllm       -> @mlc-ai/web-llm-current
 *   @localmode/litert       -> @litert-lm/core-current
 *   @localmode/wllama       -> the jsDelivr CDN build of @wllama/wllama (and
 *                              @wllama/wllama-compat) at the version of
 *                              @wllama/wllama-current, since the provider
 *                              loads wllama from the CDN, never from npm
 *
 * Each runtime import is rewritten to its alias and left external, so Next.js
 * bundles the aliased package itself (with its own nested ONNX Runtime Web,
 * and its own module state); `@localmode/core` stays external and shared.
 * `@huggingface/gguf` stays external too (apps/ui depends on the same
 * release). Kokoro TTS's `phonemizer` (never used by the bench) is replaced by a stub
 * that throws. The output, `src/lib/bench/current-releases/*.generated.js`
 * plus `versions.generated.ts`, is committed and rebuilt by `predev` and
 * `prebuild`; `scripts/bench-current-releases.test.ts` fails when the
 * committed files differ from a fresh build.
 *
 * Usage (from apps/ui): pnpm bench:current-releases
 */

import { build, type Plugin } from 'esbuild';
import { readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const repoDir = resolve(appDir, '..', '..');

/** Where the generated bundles live. */
export const CURRENT_RELEASES_DIR = join(appDir, 'src', 'lib', 'bench', 'current-releases');

/** The installed version of an apps/ui dependency (an alias resolves to the aliased package). */
function installedVersion(name: string): string {
  const dir = realpathSync(join(appDir, 'node_modules', ...name.split('/')));
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}

/** The ONNX Runtime Web build the aliased Transformers.js release depends on (its nested install). */
function nestedVersion(parentAlias: string, name: string): string {
  const parent = realpathSync(join(appDir, 'node_modules', ...parentAlias.split('/')));
  // pnpm links a package's dependencies beside it: .pnpm/<pkg>/node_modules/<dep>
  const store = resolve(parent, ...parentAlias.split('/').map(() => '..'));
  const dir = realpathSync(join(store, ...name.split('/')));
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}

/** One provider bundle. */
interface ProviderBuild {
  name: 'transformers' | 'webllm' | 'litert' | 'wllama';
  /** Bare runtime specifier the provider imports, and the alias it is rewritten to. */
  runtime?: { from: string; to: string };
}

const BUILDS: ProviderBuild[] = [
  { name: 'transformers', runtime: { from: '@huggingface/transformers', to: '@huggingface/transformers-current' } },
  { name: 'webllm', runtime: { from: '@mlc-ai/web-llm', to: '@mlc-ai/web-llm-current' } },
  { name: 'litert', runtime: { from: '@litert-lm/core', to: '@litert-lm/core-current' } },
  { name: 'wllama' },
];

/** The jsDelivr URLs of wllama in the provider's loader: `@wllama/wllama@x.y.z` and `@wllama/wllama-compat@x.y.z`. */
const WLLAMA_CDN_PIN = /(cdn\.jsdelivr\.net\/npm\/@wllama\/(?:wllama|wllama-compat))@(\d+\.\d+\.\d+)/g;

/** The pinned wllama version in the provider's loader (every CDN URL must name the same one). */
export function wllamaPinnedVersion(loaderSource: string): string {
  const versions = new Set([...loaderSource.matchAll(WLLAMA_CDN_PIN)].map((m) => m[2]));
  if (versions.size !== 1) throw new Error(`expected one pinned wllama CDN version in wllama-loader.ts, found ${[...versions].join(', ') || 'none'}`);
  return [...versions][0];
}

/**
 * Rewrite the wllama loader's CDN pins to `version`: the main build, and the
 * compatibility build at the same version (wllama's own `WasmCompatFromCDN`
 * does the same). Exactly three URLs are expected; any other count fails the
 * build, so a changed loader cannot silently keep the pinned release.
 */
export function rewriteWllamaCdn(loaderSource: string, version: string): string {
  const count = [...loaderSource.matchAll(WLLAMA_CDN_PIN)].length;
  if (count !== 3) throw new Error(`expected 3 wllama CDN URLs in wllama-loader.ts, found ${count}`);
  return loaderSource.replace(WLLAMA_CDN_PIN, (_m, base: string) => `${base}@${version}`);
}

function runtimeAliasPlugin(runtime: ProviderBuild['runtime']): Plugin {
  return {
    name: 'current-release-runtime',
    setup(b) {
      b.onResolve({ filter: /^@localmode\/core(\/.*)?$/ }, (args) => ({ path: args.path, external: true }));
      if (runtime) {
        const escaped = runtime.from.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
        b.onResolve({ filter: new RegExp(`^${escaped}(/.*)?$`) }, (args) => ({
          path: runtime.to + args.path.slice(runtime.from.length),
          external: true,
        }));
      }
      b.onResolve({ filter: /^phonemizer$/ }, () => ({ path: 'phonemizer', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents:
          "export function phonemize() { throw new Error('Kokoro TTS is not part of the current-releases bench bundle'); }\nexport default { phonemize };\n",
        loader: 'js',
      }));
    },
  };
}

function wllamaCdnPlugin(version: string): Plugin {
  return {
    name: 'current-release-wllama-cdn',
    setup(b) {
      // The GGUF parser stays external: the app depends on the same release,
      // and Next.js picks its browser build as it does for the pinned bundle.
      b.onResolve({ filter: /^@huggingface\/gguf$/ }, (args) => ({ path: args.path, external: true }));
      b.onLoad({ filter: /[\\/]wllama[\\/]src[\\/]wllama-loader\.ts$/ }, (args) => ({
        contents: rewriteWllamaCdn(readFileSync(args.path, 'utf8'), version),
        loader: 'ts',
      }));
    },
  };
}

/** The runtime versions the generated bundles load, as recorded in `harness.control.runtimeVersions`. */
export function currentReleaseVersions(): Record<string, string> {
  const wllama = installedVersion('@wllama/wllama-current');
  return {
    '@huggingface/transformers': installedVersion('@huggingface/transformers-current'),
    '@mlc-ai/web-llm': installedVersion('@mlc-ai/web-llm-current'),
    '@wllama/wllama': wllama,
    '@wllama/wllama-compat': wllama,
    '@litert-lm/core': installedVersion('@litert-lm/core-current'),
    'onnxruntime-web': nestedVersion('@huggingface/transformers-current', 'onnxruntime-web'),
  };
}

const HEADER = (provider: string, pkgVersion: string, runtime: string) =>
  `// Generated by scripts/build-current-release-providers.ts from packages/${provider}/src (@localmode/${provider} ${pkgVersion}),\n` +
  `// built against ${runtime}. Do not edit; run \`pnpm bench:current-releases\` in apps/ui.\n`;

/**
 * Build every bundle and the versions module in memory.
 *
 * @returns File name (relative to `CURRENT_RELEASES_DIR`) to contents.
 */
export async function buildCurrentReleaseProviders(): Promise<Record<string, string>> {
  const versions = currentReleaseVersions();
  const files: Record<string, string> = {};
  for (const provider of BUILDS) {
    const pkgDir = join(repoDir, 'packages', provider.name);
    const pkgVersion = (JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { version: string }).version;
    const plugins = [runtimeAliasPlugin(provider.runtime)];
    let runtimeText: string;
    if (provider.name === 'wllama') {
      const pinned = wllamaPinnedVersion(readFileSync(join(pkgDir, 'src', 'wllama-loader.ts'), 'utf8'));
      plugins.push(wllamaCdnPlugin(versions['@wllama/wllama']));
      runtimeText = `@wllama/wllama ${versions['@wllama/wllama']} from jsDelivr (the provider pins ${pinned})`;
    } else {
      const pkg = provider.runtime!.from;
      runtimeText = `${pkg} ${versions[pkg]} (installed as ${provider.runtime!.to})`;
    }
    const result = await build({
      entryPoints: [join(pkgDir, 'src', 'index.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      legalComments: 'none',
      logLevel: 'silent',
      plugins,
    });
    const text = result.outputFiles[0].text;
    files[`${provider.name}.generated.js`] = HEADER(provider.name, pkgVersion, runtimeText) + text;
  }
  files['versions.generated.ts'] =
    '// Generated by scripts/build-current-release-providers.ts. Do not edit; run `pnpm bench:current-releases` in apps/ui.\n\n' +
    '/** The runtime releases the current-releases bundles load (`harness.control.runtimeVersions`). */\n' +
    `export const CURRENT_RELEASE_RUNTIME_VERSIONS: Readonly<Record<string, string>> = ${JSON.stringify(versions, null, 2).replace(/"([^"]+)":/g, "'$1':").replace(/: "([^"]+)"/g, ": '$1'")};\n`;
  return files;
}

async function main(): Promise<void> {
  const files = await buildCurrentReleaseProviders();
  mkdirSync(CURRENT_RELEASES_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(CURRENT_RELEASES_DIR, name), text);
    console.log(`wrote src/lib/bench/current-releases/${name} (${text.length} chars)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
