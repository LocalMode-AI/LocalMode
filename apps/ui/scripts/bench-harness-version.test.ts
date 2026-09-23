/**
 * The harness version stamped on every bench run comes from the build: the
 * real `next.config.mjs` resolves the installed `@localmode/bench` version into
 * `NEXT_PUBLIC_BENCH_RUNTIME_VERSIONS`, and `benchHarnessVersion()` reads it.
 * These tests run that config and compare against the bench package's own
 * package.json, so a hard-coded or stale stamp cannot pass.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { benchHarnessVersion, benchRuntimeVersions } from '../src/lib/bench/runtime-versions';

const benchPackageVersion = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../packages/bench/package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
).version;

const ENV_KEY = 'NEXT_PUBLIC_BENCH_RUNTIME_VERSIONS';
const original = process.env[ENV_KEY];
let builtEnvValue: string;

beforeAll(async () => {
  const config = (await import('../next.config.mjs')).default as { env?: Record<string, string> };
  const value = config.env?.[ENV_KEY];
  if (typeof value !== 'string') throw new Error(`next.config.mjs did not set env.${ENV_KEY}`);
  builtEnvValue = value;
});

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe('benchHarnessVersion()', () => {
  it('equals packages/bench/package.json version under the build-time env', () => {
    process.env[ENV_KEY] = builtEnvValue;
    expect(benchPackageVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(benchHarnessVersion()).toBe(benchPackageVersion);
  });

  it('agrees with the runtimeVersions entry stamped on the same run', () => {
    process.env[ENV_KEY] = builtEnvValue;
    expect(benchRuntimeVersions()['@localmode/bench']).toBe(benchHarnessVersion());
  });

  it("reports 'unknown' when the build did not stamp the bench version", () => {
    delete process.env[ENV_KEY];
    expect(benchHarnessVersion()).toBe('unknown');
    process.env[ENV_KEY] = JSON.stringify({ '@huggingface/transformers': '4.2.0' });
    expect(benchHarnessVersion()).toBe('unknown');
  });
});
