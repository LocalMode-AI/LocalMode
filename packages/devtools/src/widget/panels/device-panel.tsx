/**
 * @file device-panel.tsx
 * @description Device tab panel showing capabilities and feature detection.
 */

import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the DevicePanel */
interface DevicePanelProps {
  bridge: DevToolsBridge;
}

/** Device capabilities display from bridge.capabilities */
export function DevicePanel({ bridge }: DevicePanelProps) {
  const caps = bridge.capabilities;

  if (!caps) {
    return <p style={s.emptyState}>Detecting device capabilities...</p>;
  }

  const features = caps.features || {};

  return (
    <div>
      <h3 style={{ color: s.colors.text, marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
        Browser & Device
      </h3>
      <pre style={{
        color: s.colors.textMuted,
        marginBottom: '16px',
        fontFamily: s.fonts.mono,
        fontSize: s.fonts.sizeSmall,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {JSON.stringify({ browser: caps.browser, device: caps.device, hardware: caps.hardware }, null, 2)}
      </pre>

      <h3 style={{ color: s.colors.text, marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
        Features
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '4px',
      }}>
        {Object.entries(features).map(([name, supported]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: supported ? s.colors.green : s.colors.red }}>
              {supported ? '\u2713' : '\u2717'}
            </span>
            <span style={{ color: s.colors.text }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
