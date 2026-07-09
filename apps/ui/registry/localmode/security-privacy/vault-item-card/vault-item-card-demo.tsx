'use client';

import { useState } from 'react';

import { VaultItemCard } from './vault-item-card';

/**
 * Demo for VaultItemCard, used by the docs live preview. Fixture-driven — a
 * lock toggle flips both cards between their locked (masked) and unlocked
 * (revealable) states. No crypto, no storage: the "decrypted" content is a
 * static fixture string revealed via callback.
 */
export default function VaultItemCardDemo() {
  const [locked, setLocked] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>('note');

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <button
        type="button"
        onClick={() => setLocked((v) => !v)}
        className="self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
      >
        {locked ? 'Unlock vault' : 'Lock vault'}
      </button>

      <VaultItemCard
        title="API keys"
        kind="note"
        createdAt="2 days ago"
        locked={locked}
        revealed={revealedId === 'note'}
        content={revealedId === 'note' ? 'sk-live-4f9a...redacted-in-demo' : undefined}
        onReveal={() => setRevealedId('note')}
        onHide={() => setRevealedId(null)}
        onDelete={() => {}}
      />

      <VaultItemCard
        title="recovery-codes.txt"
        kind="document"
        createdAt="just now"
        locked={locked}
        revealed={revealedId === 'doc'}
        content={revealedId === 'doc' ? '1) 8fd2-01\n2) 77ac-93\n3) 12de-55' : undefined}
        onReveal={() => setRevealedId('doc')}
        onHide={() => setRevealedId(null)}
        onDelete={() => {}}
      />
    </div>
  );
}
