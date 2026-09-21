import { describe, expect, it } from 'vitest';
import { canonicalJson, computeLegacyRunDigest, computeRunDigest, sha256Hex, verifyRunDigest } from '../src/canonical.js';
import type { BenchRunResult } from '../src/types.js';
import { makeRun } from './helpers.js';

describe('canonicalJson()', () => {
  it('sorts object keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('drops undefined properties and serializes undefined array slots as null', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });

  it('is stable across key insertion order', () => {
    const x: Record<string, number> = {};
    x.z = 1;
    x.a = 2;
    const y: Record<string, number> = {};
    y.a = 2;
    y.z = 1;
    expect(canonicalJson(x)).toBe(canonicalJson(y));
  });
});

describe('sha256Hex()', () => {
  it('matches the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('run digests', () => {
  it('computes, embeds, and verifies a digest; detects tampering', async () => {
    const run: BenchRunResult = makeRun();
    run.digest = await computeRunDigest(run);
    expect(await verifyRunDigest(run)).toBe(true);

    // Tamper with a metric-bearing field → digest must fail.
    run.suite = 'thorough';
    expect(await verifyRunDigest(run)).toBe(false);
  });

  it('digest is independent of the digest field itself', async () => {
    const run = makeRun();
    const d1 = await computeRunDigest(run);
    run.digest = d1;
    const d2 = await computeRunDigest(run);
    expect(d2).toBe(d1);
  });
});

describe('digest and the submission nonce', () => {
  it('does not cover the nonce, so the published file (nonce stripped) still verifies', async () => {
    // The server strips the nonce before publishing; a digest that covered
    // it would fail on every public file, and a nonce inside a public file
    // stays valid for six hours for anyone who copies it.
    const run = makeRun({ nonce: '1790000000000.abcdef' });
    run.digest = await computeRunDigest(run);
    const { nonce: _stripped, ...published } = run;
    expect(await verifyRunDigest(published as BenchRunResult)).toBe(true);
    expect(await verifyRunDigest(run)).toBe(true);
  });

  it('still verifies a file digested under the legacy rule that covered the nonce', async () => {
    const legacy = makeRun({ nonce: '1790000000000.abcdef' });
    legacy.digest = await computeLegacyRunDigest(legacy);
    expect(await verifyRunDigest(legacy)).toBe(true);
    // A tampered legacy file fails both rules.
    legacy.suite = 'thorough';
    expect(await verifyRunDigest(legacy)).toBe(false);
  });
});
