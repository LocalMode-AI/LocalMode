/**
 * @file page.tsx
 * @description Public `/blocks/privacy` category page (renamed from privacy-vault)
 * — hosts the two split privacy blocks (PII Redactor, Encrypted Vault), each in
 * its own BlockShell. `/blocks/privacy-vault` 308-redirects here. Nothing
 * downloads on page open; each block gates its own model/crypto work.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { PiiRedactorBlock } from './pii-redactor/pii-redactor';
import { EncryptedVaultBlock } from './encrypted-vault/encrypted-vault';

export const metadata: Metadata = {
  title: 'Privacy - LocalMode UI',
  alternates: { canonical: '/blocks/privacy' },
  openGraph: {
    title: 'Privacy',
    description: 'Privacy-first tools that keep your data in the browser. Detect and hide personal information in text, and store notes in a passphrase-locked, encrypted vault with a verifiable history.',
    url: '/blocks/privacy',
    type: 'website',
    images: [ogImageUrl({ title: 'Privacy', description: 'Privacy-first tools that keep your data in the browser. Detect and hide personal information in text, and store notes in a passphrase-locked, encrypted vault with a verifiable history.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy',
    description: 'Privacy-first tools that keep your data in the browser. Detect and hide personal information in text, and store notes in a passphrase-locked, encrypted vault with a verifiable history.',
    images: [ogImageUrl({ title: 'Privacy', description: 'Privacy-first tools that keep your data in the browser. Detect and hide personal information in text, and store notes in a passphrase-locked, encrypted vault with a verifiable history.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function PrivacyCategoryPage() {
  return (
    <CategoryShell
      title="Privacy"
      description="Privacy-first tools that keep your data in the browser. Detect and hide personal information in text, and store notes in a passphrase-locked, encrypted vault with a verifiable history."
      blocks={[
        {
          slug: 'pii-redactor',
          name: 'privacy/pii-redactor',
          title: 'PII Redactor',
          description:
            'Find and hide personal details like names, emails, and phone numbers in text.',
          source: readBlockSource('privacy/pii-redactor'),
          children: <PiiRedactorBlock />,
        },
        {
          slug: 'encrypted-vault',
          name: 'privacy/encrypted-vault',
          title: 'Encrypted Vault',
          description:
            'Keep notes in a passphrase-locked vault that encrypts everything before saving.',
          source: readBlockSource('privacy/encrypted-vault'),
          children: <EncryptedVaultBlock />,
        },
      ]}
    />
  );
}
