'use client';

import { useState } from 'react';

import { PassphraseGate, type PassphraseStrength } from './passphrase-gate';

/** Demo-only strength estimator — length + character-class heuristic (0–100). */
function estimate(value: string): PassphraseStrength {
  const classes =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/[0-9]/.test(value) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(value) ? 1 : 0);
  const lengthScore = Math.min(value.length, 16) / 16;
  const score = Math.round(lengthScore * 60 + (classes / 4) * 40);
  return {
    value: score,
    label: value.length === 0 ? undefined : score < 40 ? 'Weak' : score < 70 ? 'Good' : 'Strong',
    color: score < 40 ? 'error' : score < 70 ? 'warning' : 'success',
  };
}

/**
 * Demo for PassphraseGate, used by the docs live preview. Fixture-driven — a
 * toggle flips between create and unlock modes; the app-side strength estimator
 * feeds the composed strength bar. No crypto, no storage, no model: submitting
 * just records the last mode. In production, wire `onSubmit` to
 * `useEncryptedVault().unlock`.
 */
export default function PassphraseGateDemo() {
  const [mode, setMode] = useState<'create' | 'unlock'>('create');
  const [strength, setStrength] = useState<PassphraseStrength>({ value: 0 });
  const [submitted, setSubmitted] = useState<string | null>(null);
  // Show a fake rejection in unlock mode to demonstrate the error surface.
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setMode('create');
            setError(undefined);
            setSubmitted(null);
          }}
          data-active={mode === 'create'}
          className="rounded-md border border-border px-2.5 py-1 font-medium data-[active=true]:bg-accent"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('unlock');
            setError(undefined);
            setSubmitted(null);
          }}
          data-active={mode === 'unlock'}
          className="rounded-md border border-border px-2.5 py-1 font-medium data-[active=true]:bg-accent"
        >
          Unlock
        </button>
      </div>

      <PassphraseGate
        mode={mode}
        strength={strength}
        error={error}
        onPassphraseChange={(v) => setStrength(estimate(v))}
        onSubmit={(p) => {
          if (mode === 'unlock' && p !== 'correct horse') {
            setError('Incorrect passphrase');
            return;
          }
          setError(undefined);
          setSubmitted(p ? `${p.length}-char passphrase accepted` : null);
        }}
      />

      {submitted && <p className="text-xs text-emerald-600 dark:text-emerald-400">{submitted}</p>}
    </div>
  );
}
