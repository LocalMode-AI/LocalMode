'use client';

/**
 * @file encrypted-vault.tsx
 * @description Encrypted Vault block (`/blocks/privacy/encrypted-vault`) — passphrase-locked AES-GCM item store with a tamper-evident hash-chained audit log.
 */
import { useEffect, useRef, useState } from 'react';
import { FileUp, Lock, Plus, ShieldCheck, Download, ListChecks } from 'lucide-react';

import {
  createAuditLog,
  exportAuditLog,
  type AuditLog,
} from '@localmode/core';
import { useEncryptedVault, useAuditLog } from '@localmode/react';

import { PassphraseGate } from '@/components/passphrase-gate';
import { VaultItemCard } from '@/components/vault-item-card';
import { LockStatusBadge } from '@/components/lock-status-badge';
import { cn } from '@/lib/utils';
import type { StrengthColor } from '@/components/password-strength-bar';

/** Minimum passphrase length enforced in vault create mode. */
const MIN_PASSPHRASE_LENGTH = 8;

/**
 * Vault + audit-log storage namespace (default IndexedDB).
 * STORAGE-KEY STABILITY: must stay `'privacy-vault'` — existing user vaults and
 * the raw-IndexedDB E2E probe `vectordb_vault_privacy-vault` depend on it.
 */
const VAULT_NAME = 'privacy-vault';

/** Caller-computed passphrase strength (0–100) with a label + semantic color. */
interface PassphraseStrength {
  value: number;
  label?: string;
  color: StrengthColor;
}

/**
 * Length + character-class passphrase strength estimator (the block computes
 * strength; the primitives stay presentational).
 */
function estimateStrength(passphrase: string): PassphraseStrength {
  const classes =
    (/[a-z]/.test(passphrase) ? 1 : 0) +
    (/[A-Z]/.test(passphrase) ? 1 : 0) +
    (/[0-9]/.test(passphrase) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(passphrase) ? 1 : 0);
  const lengthScore = Math.min(passphrase.length, 16) / 16;
  const value = Math.round(lengthScore * 60 + (classes / 4) * 40);
  return {
    value,
    label:
      passphrase.length === 0 ? undefined : value < 40 ? 'Weak' : value < 70 ? 'Good' : 'Strong',
    color: value < 40 ? 'error' : value < 70 ? 'warning' : 'success',
  };
}

/** Format a millisecond timestamp for display. */
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** The decrypted payload of a vault item. */
interface VaultData {
  title: string;
  content: string;
  kind: 'note' | 'document';
}

export function EncryptedVaultBlock() {
  const vault = useEncryptedVault<VaultData>({ name: VAULT_NAME });
  const { status, items, error, isBusy, unlock, lock, createItem, deleteItem } = vault;

  // Audit log — created once on mount (client only), then driven by useAuditLog.
  const [auditLog, setAuditLog] = useState<AuditLog | null>(null);
  const audit = useAuditLog(auditLog);
  useEffect(() => {
    let live = true;
    let created: AuditLog | null = null;
    createAuditLog({ name: VAULT_NAME })
      .then((log) => {
        if (live) {
          created = log;
          setAuditLog(log);
        } else {
          void log.close();
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      void created?.close();
    };
  }, []);

  // Serialize audit appends: the hash chain reads the current tail to compute
  // prevHash, so two concurrent appends would fork the chain. Chaining them
  // guarantees sequential, ordered entries.
  const logChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const logEvent = (kind: string, payload: unknown): Promise<unknown> => {
    logChainRef.current = logChainRef.current
      .then(() => (auditLog ? audit.append(kind, payload) : undefined))
      .catch(() => {});
    return logChainRef.current;
  };

  const [strength, setStrength] = useState<PassphraseStrength>({ value: 0, color: 'error' });
  const [gateError, setGateError] = useState<string | undefined>(undefined);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // Pending irreversible delete — a two-step confirm before ciphertext is
  // permanently destroyed (there is no undo once the AES-GCM record is gone).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mode: 'create' | 'unlock' = status === 'uninitialized' ? 'create' : 'unlock';
  const lockStatus = status === 'unlocked' ? 'unlocked' : status === 'locked' ? 'locked' : 'no-vault';

  const handleSubmitPassphrase = async (passphrase: string) => {
    setGateError(undefined);
    const wasUninitialized = status === 'uninitialized';
    const ok = await unlock(passphrase);
    if (ok) {
      if (wasUninitialized) logEvent('vault.created', { name: VAULT_NAME });
      logEvent('vault.unlocked', { name: VAULT_NAME });
    } else {
      // The hook surfaces VaultPassphraseError on `error`; reflect it + log.
      setGateError('Incorrect passphrase. Please try again.');
      logEvent('vault.unlock_failed', { name: VAULT_NAME });
    }
  };

  const handleLock = () => {
    lock();
    setRevealedId(null);
    logEvent('vault.locked', { name: VAULT_NAME });
  };

  const handleReveal = (id: string, itemTitle: string) => {
    setRevealedId(id);
    logEvent('item.viewed', { itemId: id, title: itemTitle });
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    const item = await createItem({ title: title.trim(), content: content.trim(), kind: 'note' });
    if (item) {
      logEvent('item.added', { itemId: item.id, title: item.data.title });
      setTitle('');
      setContent('');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const item = await createItem({ title: file.name, content: text, kind: 'document' });
    if (item) logEvent('item.added', { itemId: item.id, title: item.data.title });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (id: string, itemTitle: string) => {
    const ok = await deleteItem(id);
    if (ok) {
      if (revealedId === id) setRevealedId(null);
      logEvent('item.deleted', { itemId: id, title: itemTitle });
    }
    setPendingDelete(null);
  };

  const verifyChainResult = async () => {
    await audit.verify();
  };

  const exportAudit = async () => {
    if (!auditLog) return;
    const chunks: string[] = [];
    for await (const line of exportAuditLog(auditLog)) chunks.push(line);
    const blob = new Blob(chunks, { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'privacy-vault-audit.jsonl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const wrongPassphrase =
    error?.name === 'VaultPassphraseError' ? 'Incorrect passphrase. Please try again.' : gateError;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        A passphrase-locked, end-to-end encrypted item store with a hash-chained audit log (Web Crypto only).
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Encrypted vault</span>
        <LockStatusBadge status={lockStatus} />
      </div>

      {status !== 'unlocked' ? (
        <PassphraseGate
          className="mx-auto"
          mode={mode}
          isBusy={isBusy}
          minLength={MIN_PASSPHRASE_LENGTH}
          strength={strength}
          error={wrongPassphrase}
          onPassphraseChange={(v) => setStrength(estimateStrength(v))}
          onSubmit={handleSubmitPassphrase}
          title={mode === 'create' ? 'Create your vault' : 'Unlock your vault'}
          description={
            mode === 'create'
              ? 'Choose a passphrase. It derives the encryption key (in memory only) - it is never stored.'
              : 'Enter your passphrase to decrypt your items.'
          }
        />
      ) : (
        <>
          {/* Add note + import document */}
          <form onSubmit={handleAddNote} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <label htmlFor="vault-note-title" className="sr-only">
              Note title
            </label>
            <input
              id="vault-note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <label htmlFor="vault-note-content" className="sr-only">
              Secret content
            </label>
            <textarea
              id="vault-note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Secret content: encrypted with AES-GCM before it is stored"
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!title.trim() || !content.trim() || isBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Plus className="size-4" aria-hidden="true" /> Add note
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileUp className="size-4" aria-hidden="true" /> Import .txt
              </button>
              <label htmlFor="vault-import-file" className="sr-only">
                Import a text document
              </label>
              <input
                ref={fileRef}
                id="vault-import-file"
                type="file"
                accept=".txt,text/plain"
                onChange={handleImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleLock}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Lock className="size-4" aria-hidden="true" /> Lock
              </button>
            </div>
          </form>

          {/* Item list */}
          <div className="flex flex-col gap-3">
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No items yet. Add an encrypted note or import a text document.
              </p>
            ) : (
              items.map((item) => (
                <div key={item.id} role="group" aria-label={item.data.title} data-item-id={item.id}>
                  <VaultItemCard
                    title={item.data.title}
                    kind={item.data.kind}
                    createdAt={formatTimestamp(item.createdAt)}
                    locked={false}
                    revealed={revealedId === item.id}
                    content={revealedId === item.id ? item.data.content : undefined}
                    onReveal={() => handleReveal(item.id, item.data.title)}
                    onHide={() => setRevealedId(null)}
                    onDelete={() => setPendingDelete({ id: item.id, title: item.data.title })}
                  />
                  {pendingDelete?.id === item.id && (
                    <div
                      role="alertdialog"
                      aria-label={`Delete ${item.data.title}`}
                      className="mt-2 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
                    >
                      <p className="text-sm text-foreground">
                        Permanently delete <span className="font-medium">{item.data.title}</span>? The
                        encrypted contents are destroyed and cannot be recovered.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id, item.data.title)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Delete permanently
                        </button>
                        <button
                          type="button"
                          autoFocus
                          onClick={() => setPendingDelete(null)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Audit log */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium">
            <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" /> Audit log
            <span className="text-muted-foreground">({audit.entries.length})</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={verifyChainResult}
              disabled={audit.entries.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Verify chain
            </button>
            <button
              type="button"
              onClick={exportAudit}
              disabled={audit.entries.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="size-3.5" aria-hidden="true" /> Export JSONL
            </button>
          </div>
        </div>

        {audit.lastVerification && (
          <p
            role="status"
            data-ok={audit.lastVerification.ok}
            className={cn(
              'text-xs font-medium',
              audit.lastVerification.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {audit.lastVerification.ok
              ? `Chain valid: ${audit.lastVerification.entriesChecked} entries verified.`
              : `Chain broken at entry ${audit.lastVerification.brokenAt} (${audit.lastVerification.reason}).`}
          </p>
        )}

        <ol aria-label="Audit log entries" className="flex flex-col gap-1 text-xs">
          {audit.entries.length === 0 ? (
            <li className="text-muted-foreground">No audit entries yet.</li>
          ) : (
            audit.entries.map((entry) => (
              <li
                key={entry.id}
                data-audit-kind={entry.kind}
                className="flex items-center gap-2 font-mono"
              >
                <span className="text-muted-foreground">{formatTimestamp(entry.timestamp)}</span>
                <span className="font-medium">{entry.kind}</span>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
