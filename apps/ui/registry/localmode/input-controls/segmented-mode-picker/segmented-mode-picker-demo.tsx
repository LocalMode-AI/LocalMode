'use client';

import { useState } from 'react';
import { SegmentedModePicker, TabBar } from './segmented-mode-picker';

/**
 * Demo for the SegmentedModePicker + TabBar, used by the docs live preview.
 * Shows the pill toggle and the typed tab variant (with a disabled tab). Pure
 * UI — no model download.
 */
export default function SegmentedModePickerDemo() {
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [tab, setTab] = useState<'browse' | 'inspect'>('browse');

  return (
    <div className="flex flex-col gap-6">
      <SegmentedModePicker
        aria-label="Summary length"
        items={[
          { id: 'short', label: 'Short' },
          { id: 'medium', label: 'Medium' },
          { id: 'long', label: 'Long' },
        ]}
        selectedId={length}
        onSelect={setLength}
      />
      <TabBar
        aria-label="Explorer mode"
        tabs={[
          { id: 'browse', label: 'Browse' },
          { id: 'inspect', label: 'Inspect (select a model first)' },
        ]}
        activeId={tab}
        onSelect={setTab}
        disabledTabs={['inspect']}
      />
    </div>
  );
}
