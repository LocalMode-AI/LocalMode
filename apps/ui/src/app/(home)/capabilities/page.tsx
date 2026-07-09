/**
 * @file page.tsx
 * @description Dedicated browser-support / capability report page. Reuses the
 * homepage CapabilitiesPanel (browser + hardware + 12 on-device feature flags,
 * each with what/why/how-to-enable tooltips) with fuller context. Detection is
 * client-only; nothing is measured on a server, nothing leaves the device.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CapabilitiesPanel } from '@/components/capabilities-panel';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';
import { ogImageUrl } from '@/lib/og';

const TITLE = 'Browser & device capabilities';
const DESCRIPTION =
  'Check what your browser can do for on-device AI — WebGPU, WASM, SIMD, threads, storage, and more. Detected locally; nothing is sent anywhere.';

export const metadata: Metadata = {
  title: `${TITLE} - LocalMode UI`,
  description: DESCRIPTION,
  alternates: { canonical: '/capabilities' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/capabilities',
    type: 'website',
    images: [ogImageUrl({ title: TITLE, description: 'What your browser can run, on-device.' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [ogImageUrl({ title: TITLE, description: 'What your browser can run, on-device.' })],
  },
};

export default function CapabilitiesPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <JsonLd
        data={breadcrumbGraph(
          [
            { name: 'Home', item: '/' },
            { name: 'Capabilities', item: '/capabilities' },
          ],
          '/capabilities',
        )}
      />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Everything LocalMode runs happens on your device. This report shows what your browser
            supports for on-device AI, detected locally in your browser — nothing is sent anywhere.
            Hover any feature for what it is, why it matters, and how to enable it.
          </p>
        </div>

        <CapabilitiesPanel />

        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <p className="text-sm text-muted-foreground">
            Ready to try it? The{' '}
            <Link href="/blocks" className="font-medium text-primary underline underline-offset-2">
              Blocks gallery
            </Link>{' '}
            runs real models entirely in your browser — WebGPU-capable browsers get GPU acceleration,
            others fall back to WASM.
          </p>
        </div>

        <Link
          href="/blocks"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Explore the blocks
          <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
