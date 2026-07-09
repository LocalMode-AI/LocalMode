/**
 * @file page.tsx
 * @description Canonical `/blocks/privacy/encrypted-vault` page — the
 * EncryptedVaultBlock in BlockShell chrome. Passphrase-locked AES-GCM item
 * store with a tamper-evident audit log; Web Crypto only, no models download.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { EncryptedVaultBlock } from './encrypted-vault';

export const metadata: Metadata = {
  title: 'Encrypted Vault block - LocalMode UI',
  alternates: { canonical: '/blocks/privacy/encrypted-vault' },
  openGraph: {
    title: 'Encrypted Vault',
    description: 'Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads.',
    url: '/blocks/privacy/encrypted-vault',
    type: 'website',
    images: [ogImageUrl({ title: 'Encrypted Vault', description: 'Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Encrypted Vault',
    description: 'Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads.',
    images: [ogImageUrl({ title: 'Encrypted Vault', description: 'Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function EncryptedVaultBlockPage() {
  return (
    <BlockShell
      title="Encrypted Vault"
      description="Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads."
      name="privacy/encrypted-vault"
      source={readBlockSource('privacy/encrypted-vault')}
    >
      <EncryptedVaultBlock />
    </BlockShell>
  );
}
