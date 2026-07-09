'use client';

import { useState } from 'react';
import {
  PasswordStrengthBar,
  type StrengthColor,
} from './password-strength-bar';

/**
 * Demo for the PasswordStrengthBar component, used by the docs live preview.
 *
 * Computes a trivial strength score from the typed value purely to drive the
 * bar — in a real app this is your password policy / entropy estimator paired
 * with `@localmode/core` `deriveKey`. The component itself only renders state.
 */
export default function PasswordStrengthBarDemo() {
  // Seed with a sample password so the preview lands on a populated state
  // (colored fill + label) instead of an empty bar. This is mock UI state —
  // no model fetch — the user can clear/retype to see other strengths.
  const [password, setPassword] = useState('Tr0ub4dour&3');

  // Demo-only heuristic: longer + mixed character classes → higher score.
  // Replace with your real estimator (length, entropy, zxcvbn) in production.
  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(password) ? 1 : 0);
  const lengthScore = Math.min(password.length, 16) / 16; // 0..1
  const value = Math.round(lengthScore * 60 + (classes / 4) * 40);

  const color: StrengthColor =
    value < 40 ? 'error' : value < 70 ? 'warning' : 'success';
  const label =
    password.length === 0
      ? undefined
      : value < 40
        ? 'Weak'
        : value < 70
          ? 'Good'
          : 'Strong';

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Type a password…"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <PasswordStrengthBar value={value} label={label} color={color} />
    </div>
  );
}
