/**
 * @file page.tsx
 * @description Public `/blocks` gallery index — a two-level category grid of
 * presentational block cards, derived entirely from `blocks-catalog.ts`. Each
 * block is also a registry item: install it with
 * `npx shadcn add @localmode/ui/blocks/<name>`. Nothing downloads until the
 * visitor presses Load inside a block (cards are static — zero model bytes).
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockCard } from '@/components/block-card';
import { PrivacyFeatureCards } from '@/components/privacy-feature-cards';
import { CapabilitiesPanel } from '@/components/capabilities-panel';
import { CopyableCommand } from '@/components/copyable-command';
import { SiteFooter } from '@/components/site-footer';
import { installCommand } from '@/lib/registry';
import { BLOCK_CATEGORIES } from './blocks-catalog';

export const metadata: Metadata = {
  title: 'Blocks - LocalMode UI',
  description:
    'Installable, composed blocks assembled from LocalMode UI Elements, running real models entirely in your browser.',
  alternates: { canonical: '/blocks' },
  openGraph: {
    title: 'Blocks',
    description: 'Installable, composed blocks that run real models entirely in your browser.',
    url: '/blocks',
    type: 'website',
    images: [ogImageUrl({ title: 'Blocks', description: 'Installable, composed blocks that run real models entirely in your browser.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blocks',
    description: 'Installable, composed blocks that run real models entirely in your browser.',
    images: [ogImageUrl({ title: 'Blocks', description: 'Installable, composed blocks that run real models entirely in your browser.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function BlocksIndexPage() {
  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-6xl p-8 pb-24 lg:pb-8">
      <div className="flex flex-col items-center text-center">
        <span className="mb-4 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          36 blocks · 12 categories
        </span>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          Installable AI blocks that run real models
        </h1>
        <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
          Full, working experiences that compose the LocalMode UI elements into real apps: chat,
          knowledge search, vision, audio, photos, and more. Each runs a real model entirely in your
          browser, with no server and no API key, and nothing downloads until you press Load.
        </p>
        <div className="mt-6 flex w-full max-w-xl flex-col items-center gap-2">
          <CopyableCommand command={installCommand('ui/blocks/chat')} className="w-fit" />
          <p className="text-xs text-muted-foreground">
            Install any block the same way - swap{' '}
            <code className="rounded bg-muted px-1 py-0.5">chat</code> for any block name.
          </p>
        </div>
      </div>

      <PrivacyFeatureCards className="mt-10" />

      <div className="mt-12 flex flex-col gap-12">
        {BLOCK_CATEGORIES.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <section key={category.id} aria-labelledby={`category-${category.id}`}>
              <div className="flex items-center gap-3 border-b border-border pb-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <CategoryIcon className="size-4" aria-hidden="true" />
                </div>
                <h2 id={`category-${category.id}`} className="text-xl font-bold text-balance text-foreground">
                  {category.title}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">
                  {category.blocks.length}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {category.blocks.map((card) => (
                  <BlockCard key={card.slug} card={card} accent={category.accent} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-16 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-foreground">Everything runs on your device</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            What your browser reports it can do for on-device AI. Detected locally, nothing is sent
            anywhere.
          </p>
        </div>
        <CapabilitiesPanel />
      </section>
      </main>

      <SiteFooter />
    </>
  );
}
