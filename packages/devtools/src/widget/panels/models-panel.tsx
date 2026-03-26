/**
 * @file models-panel.tsx
 * @description Models tab panel showing loaded model cache info.
 */

import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the ModelsPanel */
interface ModelsPanelProps {
  bridge: DevToolsBridge;
}

/** Table of loaded models from bridge.models */
export function ModelsPanel({ bridge }: ModelsPanelProps) {
  const models = Object.values(bridge.models);

  if (models.length === 0) {
    return <p style={s.emptyState}>No models loaded yet.</p>;
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Model ID</th>
          <th style={s.th}>Status</th>
          <th style={s.th}>Load Time</th>
          <th style={s.th}>Last Used</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => (
          <tr key={m.modelId}>
            <td style={{ ...s.td, color: s.colors.text }}>{m.modelId}</td>
            <td style={s.td}>
              <span style={s.statusBadge(m.status)}>{m.status}</span>
            </td>
            <td style={s.td}>{m.loadDurationMs}ms</td>
            <td style={{ ...s.td, color: s.colors.textMuted }}>
              {new Date(m.lastUsed).toLocaleTimeString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
