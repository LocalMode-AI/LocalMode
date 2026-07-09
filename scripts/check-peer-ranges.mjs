/**
 * @file check-peer-ranges.mjs
 * @description Verifies every package compiles against the OLDEST `@localmode/core`
 * its own `peerDependencies` range permits — the only check that proves a declared
 * range is honest.
 *
 * Why this exists: a peer range is a promise ("I work with any core >= X"). Nothing
 * else enforces it. A package can import a symbol added in core 2.3.0 while still
 * advertising `>=2.0.0`; npm resolves that happily and the consumer breaks. Two
 * distinct failure modes, both caught here:
 *
 *   1. Missing export — `@localmode/react` value-imports `createKnowledgeBaseEngine`,
 *      which core 2.2.0 never exported. Runtime TypeError.
 *   2. Narrowed signature — `@localmode/dexie` implements `StorageAdapter` and returns
 *      `Float32Array | Uint8Array`, but core 2.2.0 declared `Float32Array`. tsc TS2322.
 *
 * A symbol-name diff catches (1) only. Compiling catches both, so we compile: each
 * package's real `src/` against the real published tarball of its minimum core.
 *
 * Usage:  node scripts/check-peer-ranges.mjs [--package <name>]
 * Exit 0 = every declared range is honest. Exit 1 = at least one lies.
 *
 * Requires network (npm pack) unless the minimum version is already cached under
 * node_modules/.cache/peer-check/.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(ROOT, 'packages');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'peer-check');
const CORE = '@localmode/core';

/**
 * Lowest version a range admits. Deliberately supports only the range syntaxes this
 * repo uses; anything else throws rather than guessing, because a wrong minimum
 * silently weakens the check.
 */
export function minVersion(range) {
  const r = range.trim();
  let m;
  if ((m = /^>=\s*(\d+\.\d+\.\d+)$/.exec(r))) return m[1];
  if ((m = /^[\^~]\s*(\d+\.\d+\.\d+)$/.exec(r))) return m[1];
  if ((m = /^(\d+\.\d+\.\d+)$/.exec(r))) return m[1];
  throw new Error(`unsupported peer range ${JSON.stringify(range)} — extend minVersion()`);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...opts });
}

/** Fetch + extract a published core tarball once; return its unpacked dir. */
function fetchCore(version) {
  const dir = path.join(CACHE, version);
  if (existsSync(path.join(dir, 'package', 'dist', 'index.d.ts'))) return dir;
  mkdirSync(dir, { recursive: true });
  const packed = run('npm', ['pack', `${CORE}@${version}`, '--silent'], { cwd: dir });
  if (packed.status !== 0) {
    throw new Error(`npm pack ${CORE}@${version} failed:\n${packed.stderr || packed.stdout}`);
  }
  const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error(`npm pack ${CORE}@${version} produced no tarball`);
  const untar = run('tar', ['xzf', tgz], { cwd: dir });
  if (untar.status !== 0) throw new Error(`tar xzf ${tgz} failed:\n${untar.stderr}`);
  return dir;
}

/** Typecheck one package's src with `@localmode/core` pinned to `coreDir`. */
function typecheckAgainst(pkgDir, coreDir) {
  const dist = path.join(coreDir, 'package', 'dist');
  const cfgPath = path.join(pkgDir, 'tsconfig.peer-check.json');
  writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          noEmit: true,
          skipLibCheck: true, // core's own .d.ts is not under test; this package's src is
          baseUrl: '.',
          paths: {
            [CORE]: [path.join(dist, 'index.d.ts')],
            [`${CORE}/*`]: [path.join(dist, '*')],
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
  try {
    const tsc = run(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', cfgPath, '--noEmit']);
    return { ok: tsc.status === 0, output: (tsc.stdout || '') + (tsc.stderr || '') };
  } finally {
    rmSync(cfgPath, { force: true });
  }
}

function main() {
  const only = process.argv.includes('--package')
    ? process.argv[process.argv.indexOf('--package') + 1]
    : null;

  const workspaceCore = JSON.parse(
    readFileSync(path.join(PACKAGES, 'core', 'package.json'), 'utf8'),
  ).version;

  const targets = [];
  for (const name of readdirSync(PACKAGES).sort()) {
    const manifest = path.join(PACKAGES, name, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const range = pkg.peerDependencies?.[CORE];
    if (!range) continue;
    if (only && pkg.name !== only && name !== only) continue;
    targets.push({ dir: path.join(PACKAGES, name), name: pkg.name, range });
  }

  console.log(`Checking ${targets.length} package(s) against the oldest core each admits.`);
  console.log(`(workspace core is ${workspaceCore})\n`);

  let failures = 0;
  for (const t of targets) {
    let min;
    try {
      min = minVersion(t.range);
    } catch (e) {
      console.log(`  ✗ ${t.name.padEnd(24)} ${e.message}`);
      failures++;
      continue;
    }

    if (min === workspaceCore) {
      console.log(`  ⊘ ${t.name.padEnd(24)} peer ${t.range} → min ${min} is the workspace core; covered by \`pnpm typecheck\``);
      continue;
    }

    let coreDir;
    try {
      coreDir = fetchCore(min);
    } catch (e) {
      console.log(`  ✗ ${t.name.padEnd(24)} ${e.message.split('\n')[0]}`);
      failures++;
      continue;
    }

    const { ok, output } = typecheckAgainst(t.dir, coreDir);
    if (ok) {
      console.log(`  ✓ ${t.name.padEnd(24)} peer ${t.range} → compiles against core@${min}`);
    } else {
      failures++;
      const first = output.split('\n').filter(Boolean).slice(0, 3);
      console.log(`  ✗ ${t.name.padEnd(24)} peer ${t.range} → does NOT compile against core@${min}`);
      for (const line of first) console.log(`      ${line}`);
      console.log(`      → raise the peer minimum, or stop using the newer core API.`);
    }
  }

  console.log(
    failures === 0
      ? '\n✅ every declared peer range is honest'
      : `\n❌ ${failures} package(s) declare a peer range they do not honor`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
