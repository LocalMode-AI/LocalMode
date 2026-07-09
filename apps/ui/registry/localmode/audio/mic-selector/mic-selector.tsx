'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/** A single enumerated audio input device. */
export interface MicDevice {
  /** `MediaDeviceInfo.deviceId`. */
  deviceId: string;
  /** Human-readable label (empty until permission is granted). */
  label: string;
}

/** Props for {@link MicSelector}. */
export interface MicSelectorProps {
  /** Selected device id (controlled). */
  value?: string;
  /** Fired with the chosen device id. */
  onValueChange?: (deviceId: string) => void;
  /** Accessible label. @default "Microphone" */
  label?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * A microphone input-device picker with permission handling and device
 * enumeration. It is fully offline — it uses only the browser device APIs
 * (`getUserMedia` for the one-time permission prompt, `enumerateDevices` for the
 * list, and a `devicechange` listener to stay current). Pairs with
 * `VoiceButton` / `VoiceOrb`; the selected `deviceId` flows into a
 * `getUserMedia({ audio: { deviceId } })` constraint.
 *
 * @example
 * ```tsx
 * <MicSelector value={deviceId} onValueChange={setDeviceId} />
 * ```
 */
export function MicSelector({
  value,
  onValueChange,
  label = 'Microphone',
  className,
}: MicSelectorProps) {
  const [devices, setDevices] = React.useState<MicDevice[]>([]);
  const [permission, setPermission] = React.useState<'idle' | 'granted' | 'denied'>('idle');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (IS_SERVER || !navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
    setDevices(inputs);
    // Labels are populated only after permission — infer granted state.
    if (inputs.some((d) => d.label)) setPermission('granted');
  }, []);

  const requestPermission = async () => {
    if (IS_SERVER || !navigator.mediaDevices?.getUserMedia) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release the mic — we only needed permission to read labels.
      stream.getTracks().forEach((t) => t.stop());
      setPermission('granted');
      await refresh();
    } catch {
      setPermission('denied');
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    refresh();
    if (IS_SERVER || !navigator.mediaDevices) return;
    const handler = () => refresh();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refresh]);

  const needsPermission = permission !== 'granted' && !devices.some((d) => d.label);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative min-w-0 flex-1">
        <select
          aria-label={label}
          value={value ?? ''}
          disabled={needsPermission || devices.length === 0}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm text-foreground shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {devices.length === 0 ? (
            <option value="">No microphones found</option>
          ) : (
            devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))
          )}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>

      {needsPermission && (
        <button
          type="button"
          onClick={requestPermission}
          disabled={busy}
          className={cn(
            'inline-flex h-9 shrink-0 items-center rounded-md border bg-background px-3 text-sm font-medium whitespace-nowrap shadow-xs transition-colors',
            'hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {busy ? 'Requesting…' : 'Allow microphone'}
        </button>
      )}

      {permission === 'denied' && (
        <span className="text-xs text-destructive">Permission denied</span>
      )}
    </div>
  );
}
