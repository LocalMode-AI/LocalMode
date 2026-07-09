'use client';

import { useState } from 'react';
import { MicSelector } from './mic-selector';

/**
 * Demo for {@link MicSelector}. Renders the real device picker — clicking
 * "Allow microphone" triggers a genuine browser permission prompt and lists the
 * actual audio inputs (labels appear after permission). The selected id is shown
 * below; the real app routes it into a `getUserMedia({ audio: { deviceId } })`
 * constraint for `VoiceButton` / `VoiceOrb`.
 */
export default function MicSelectorDemo() {
  const [deviceId, setDeviceId] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <MicSelector value={deviceId} onValueChange={setDeviceId} />
      <code className="text-xs text-muted-foreground">
        selected: {deviceId || '(none)'}
      </code>
    </div>
  );
}
