/**
 * @file page.tsx
 * @description Entry point for Voice Studio — TTS exploration with Kokoro
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AudioLines, Grid3X3, Type, GitCompare, ArrowLeft } from 'lucide-react';
import { VoiceGrid } from './_components/voice-grid';
import { SynthesisPanel } from './_components/synthesis-panel';
import { ComparisonPanel } from './_components/comparison-panel';
import { ErrorBoundary } from './_components/error-boundary';
import { cn } from './_lib/utils';
import { MODEL_CONFIG } from './_lib/constants';
import type { StudioTab } from './_lib/types';

const TABS: { id: StudioTab; label: string; icon: typeof Grid3X3 }[] = [
  { id: 'browse', label: 'Browse Voices', icon: Grid3X3 },
  { id: 'synthesize', label: 'Synthesize', icon: Type },
  { id: 'compare', label: 'Compare', icon: GitCompare },
];

export default function VoiceStudioPage() {
  const [activeTab, setActiveTab] = useState<StudioTab>('browse');

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-accent-teal/30 relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-14 min-h-14 border-b border-poster-border/20 flex items-center justify-between px-5 bg-poster-surface/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-px h-5 bg-poster-border/20" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-poster-accent-teal/15 flex items-center justify-center ring-1 ring-poster-accent-teal/30">
                <AudioLines className="w-4 h-4 text-poster-accent-teal" />
              </div>
              <div>
                <h1 className="text-sm font-semibold leading-tight">Voice Studio</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Kokoro TTS — 29 English voices</p>
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/10 text-[11px] font-medium text-poster-accent-teal border border-poster-accent-teal/20">
            Kokoro {MODEL_CONFIG.modelSize}
          </span>
        </div>

        {/* Tab bar */}
        <div className="border-b border-poster-border/20 bg-poster-surface/40 backdrop-blur-sm">
          <div className="flex gap-1 px-5 py-2">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-poster-accent-teal/15 text-poster-accent-teal'
                      : 'text-poster-text-sub/60 hover:text-poster-text-main hover:bg-poster-surface-lighter/30'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <ErrorBoundary>
              {activeTab === 'browse' && <VoiceGrid />}
              {activeTab === 'synthesize' && <SynthesisPanel />}
              {activeTab === 'compare' && <ComparisonPanel />}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
