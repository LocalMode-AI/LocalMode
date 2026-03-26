/**
 * @file queue-panel.tsx
 * @description Queue tab panel showing live inference queue metrics.
 */

import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the QueuePanel */
interface QueuePanelProps {
  bridge: DevToolsBridge;
}

/** Table of queue metrics from bridge.queues */
export function QueuePanel({ bridge }: QueuePanelProps) {
  const queues = Object.entries(bridge.queues);

  if (queues.length === 0) {
    return (
      <p style={s.emptyState}>
        No queues registered. Use <code style={s.codeStyle}>registerQueue()</code> to track queue metrics.
      </p>
    );
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Queue</th>
          <th style={s.th}>Pending</th>
          <th style={s.th}>Active</th>
          <th style={s.th}>Completed</th>
          <th style={s.th}>Failed</th>
          <th style={s.th}>Avg Latency</th>
        </tr>
      </thead>
      <tbody>
        {queues.map(([name, stats]) => (
          <tr key={name}>
            <td style={{ ...s.td, color: s.colors.text }}>{name}</td>
            <td style={{ ...s.td, ...s.highlightValue(stats.pending) }}>{stats.pending}</td>
            <td style={{ ...s.td, color: stats.active > 0 ? s.colors.green : 'inherit' }}>{stats.active}</td>
            <td style={s.td}>{stats.completed}</td>
            <td style={{ ...s.td, color: stats.failed > 0 ? s.colors.red : 'inherit' }}>{stats.failed}</td>
            <td style={s.td}>{stats.avgLatencyMs}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
