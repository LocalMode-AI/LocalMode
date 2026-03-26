/**
 * @file vectordb-panel.tsx
 * @description VectorDB tab panel showing aggregated collection stats.
 */

import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the VectorDBPanel */
interface VectorDBPanelProps {
  bridge: DevToolsBridge;
}

/** Table of VectorDB collections from bridge.vectorDBs */
export function VectorDBPanel({ bridge }: VectorDBPanelProps) {
  const dbs = Object.entries(bridge.vectorDBs);

  if (dbs.length === 0) {
    return <p style={s.emptyState}>No VectorDB activity yet.</p>;
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Collection</th>
          <th style={s.th}>Adds</th>
          <th style={s.th}>Searches</th>
          <th style={s.th}>Deletes</th>
          <th style={s.th}>Avg Search</th>
          <th style={s.th}>Last Activity</th>
        </tr>
      </thead>
      <tbody>
        {dbs.map(([name, stats]) => (
          <tr key={name}>
            <td style={{ ...s.td, color: s.colors.text }}>{name}</td>
            <td style={s.td}>{stats.totalAdds}</td>
            <td style={s.td}>{stats.totalSearches}</td>
            <td style={s.td}>{stats.totalDeletes}</td>
            <td style={s.td}>{Math.round(stats.avgSearchDurationMs)}ms</td>
            <td style={{ ...s.td, color: s.colors.textMuted }}>
              {new Date(stats.lastActivity).toLocaleTimeString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
