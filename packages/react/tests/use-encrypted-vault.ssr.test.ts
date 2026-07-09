// @vitest-environment node
/**
 * SSR tests for the useEncryptedVault React hook.
 *
 * Runs in a real node environment (no jsdom, no `window`), so the hook's
 * module-level `IS_SERVER` check is genuinely true and the inert server
 * branch is exercised for real via `react-dom/server` — the actual server
 * rendering path — rather than being smoke-checked around.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryStorage } from '@localmode/core';
import type { StorageAdapter } from '@localmode/core';
import { useEncryptedVault } from '../src/hooks/use-encrypted-vault.js';
import type { UseEncryptedVaultReturn } from '../src/hooks/use-encrypted-vault.js';

/** Record every adapter method call while delegating to the real adapter. */
function withCallRecorder(inner: StorageAdapter): { storage: StorageAdapter; calls: string[] } {
  const calls: string[] = [];
  const storage = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  return { storage, calls };
}

describe('useEncryptedVault (SSR)', () => {
  it('renders inert on the server: uninitialized, empty, not busy — storage never touched', async () => {
    // Precondition of the test's premise: this really is a server environment.
    expect(typeof window).toBe('undefined');

    const { storage, calls } = withCallRecorder(new MemoryStorage() as unknown as StorageAdapter);

    let captured: UseEncryptedVaultReturn<{ note: string }> | null = null;
    function Probe() {
      captured = useEncryptedVault<{ note: string }>({ name: 'ssr', storage });
      return createElement(
        'div',
        null,
        `${captured.status}|${captured.items.length}|${captured.isBusy}|${String(captured.error)}`
      );
    }

    // renderToString runs the hook body but no effects — the real server path.
    const html = renderToString(createElement(Probe));
    expect(html).toContain('uninitialized|0|false|null');

    // The no-op methods resolve inert values...
    expect(captured).not.toBeNull();
    const vault = captured!;
    await expect(vault.unlock('any-passphrase')).resolves.toBe(false);
    await expect(vault.createItem({ note: 'x' })).resolves.toBeNull();
    await expect(vault.readItem('id')).resolves.toBeNull();
    await expect(vault.updateItem('id', { note: 'x' })).resolves.toBeNull();
    await expect(vault.deleteItem('id')).resolves.toBe(false);
    await expect(vault.refresh()).resolves.toBeUndefined();
    vault.lock();
    vault.cancel();

    // ...and neither the render nor the method calls touched the adapter.
    expect(calls).toEqual([]);
  });
});
