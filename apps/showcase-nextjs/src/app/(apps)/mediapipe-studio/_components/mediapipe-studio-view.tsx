/**
 * @file mediapipe-studio-view.tsx
 * @description Main view with a domain-grouped tabbed interface
 */
'use client';

import { useState } from 'react';
import { Hand } from 'lucide-react';
import { ErrorBoundary } from './error-boundary';
import { IconBox } from './ui';
import { HandTrackerTab } from './hand-tracker-tab';
import { PoseTrackerTab } from './pose-tracker-tab';
import { FaceTrackerTab } from './face-tracker-tab';
import { GestureTrackerTab } from './gesture-tracker-tab';
import { AudioTab } from './audio-tab';
import { LanguageTab } from './language-tab';
import { TextEmbedTab } from './text-embed-tab';
import { TABS } from '../_lib/constants';
import { cn } from '../_lib/utils';
import type { TabDomain, TabId } from '../_lib/types';

/** Tab content components keyed by tab id. */
const TAB_CONTENT: Record<TabId, () => React.JSX.Element> = {
  hands: HandTrackerTab,
  pose: PoseTrackerTab,
  face: FaceTrackerTab,
  gestures: GestureTrackerTab,
  audio: AudioTab,
  language: LanguageTab,
  text: TextEmbedTab,
};

/** Domain display order. */
const DOMAINS: TabDomain[] = ['Vision', 'Audio', 'Text'];

/** Main MediaPipe Studio view. */
export function MediaPipeStudioView() {
  const [activeTab, setActiveTab] = useState<TabId>('hands');
  const ActiveContent = TAB_CONTENT[activeTab];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <IconBox size="lg" variant="primary">
          <Hand className="h-8 w-8" />
        </IconBox>
        <div>
          <h1 className="text-2xl font-bold text-poster-text-main">MediaPipe Studio</h1>
          <p className="text-sm text-poster-text-sub">
            On-device hand, pose &amp; face tracking, gestures, audio, and language —
            powered by Google MediaPipe, running 100% in your browser.
          </p>
        </div>
      </header>

      {/* Domain-grouped tab bar */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-poster-border/30 pb-2">
        {DOMAINS.map((domain) => (
          <div key={domain} className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-poster-text-sub">
              {domain}
            </span>
            {TABS.filter((tab) => tab.domain === domain).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-poster-primary text-white'
                    : 'text-poster-text-sub hover:bg-poster-surface'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Active tab content — remounts per tab so trackers are disposed on switch */}
      <ErrorBoundary key={activeTab}>
        <ActiveContent />
      </ErrorBoundary>
    </div>
  );
}
