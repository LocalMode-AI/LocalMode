/**
 * Anti-forgery nonce for the verified submission tier. The bench page fetches
 * a nonce when a run starts and a fresh one right before every upload attempt;
 * the submitted result embeds it; the API verifies the HMAC and its age. The
 * run digest does not cover the nonce, so swapping it leaves the digest valid.
 * Server-only (node:crypto).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Nonces older than this are rejected. The page fetches a fresh nonce right
 * before it uploads, so the window only has to cover the gap between that
 * fetch and the request; it stays long so that a page built before the
 * refresh, whose nonce dates from the start of the run, can still upload a
 * Thorough run that took most of a day on a slow device.
 */
export const NONCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.BENCH_NONCE_SECRET ?? null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

/**
 * Issue a nonce. Without BENCH_NONCE_SECRET (local dev) a `dev.` nonce is
 * issued — submissions verify only when the store is also in dev mode.
 */
export function issueNonce(now = Date.now()): string {
  const key = secret();
  if (!key) return `dev.${now}`;
  const payload = String(now);
  return `${payload}.${sign(payload, key)}`;
}

/** Verify a nonce's HMAC and age. */
export function verifyNonce(nonce: string | undefined, now = Date.now()): boolean {
  if (!nonce) return false;
  const key = secret();
  if (!key) return nonce.startsWith('dev.');
  const dot = nonce.indexOf('.');
  if (dot <= 0) return false;
  const payload = nonce.slice(0, dot);
  const mac = nonce.slice(dot + 1);
  const ts = Number(payload);
  if (!Number.isFinite(ts) || now - ts > NONCE_MAX_AGE_MS || ts - now > 60_000) return false;
  const expected = sign(payload, key);
  if (mac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
