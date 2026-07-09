/**
 * @file page.tsx
 * @description Canonical `/blocks/privacy/pii-redactor` page — the
 * PiiRedactorBlock in BlockShell chrome. On-device NER PII detection +
 * redaction + differential privacy; models load only behind an explicit Scan.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { PiiRedactorBlock } from './pii-redactor';

export const metadata: Metadata = {
  title: 'PII Redactor block - LocalMode UI',
  alternates: { canonical: '/blocks/privacy/pii-redactor' },
  openGraph: {
    title: 'PII Redactor',
    description: 'Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan.',
    url: '/blocks/privacy/pii-redactor',
    type: 'website',
    images: [ogImageUrl({ title: 'PII Redactor', description: 'Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PII Redactor',
    description: 'Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan.',
    images: [ogImageUrl({ title: 'PII Redactor', description: 'Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function PiiRedactorBlockPage() {
  return (
    <BlockShell
      title="PII Redactor"
      description="Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan."
      name="privacy/pii-redactor"
      source={readBlockSource('privacy/pii-redactor')}
    >
      <PiiRedactorBlock />
    </BlockShell>
  );
}
