/**
 * Canonical JSON serialization + SHA-256 digest for run results. The digest
 * covers the canonical form of the result WITHOUT its `digest` field, so any
 * party can recompute and verify it (isomorphic: browser and Node).
 */

import type { BenchRunResult } from './types.js';

/**
 * Deterministic JSON: object keys sorted lexicographically at every level,
 * arrays in order, no whitespace. Non-finite numbers serialize as null
 * (JSON.stringify semantics) so digests stay portable.
 *
 * @example
 * canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }); // '{"a":[2,{"c":4,"d":3}],"b":1}'
 */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'undefined') return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stringify(v)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value type ${typeof value}`);
}

/** SHA-256 hex of a UTF-8 string via Web Crypto (browser + Node >= 19). */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) is not available in this environment');
  const bytes = new TextEncoder().encode(text);
  const hash = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute the run digest: SHA-256 of the canonical JSON of the result with
 * `digest` removed.
 *
 * @example
 * result.digest = await computeRunDigest(result);
 */
export async function computeRunDigest(result: BenchRunResult): Promise<string> {
  const { digest: _omitted, ...rest } = result;
  return sha256Hex(canonicalJson(rest));
}

/** Verify a result's embedded digest. Returns false when absent or wrong. */
export async function verifyRunDigest(result: BenchRunResult): Promise<boolean> {
  if (!result.digest) return false;
  return (await computeRunDigest(result)) === result.digest;
}
