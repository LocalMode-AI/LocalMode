/**
 * @file events-panel.tsx
 * @description Events tab panel showing a filterable live event log.
 */

import { useState } from 'react';
import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the EventsPanel */
interface EventsPanelProps {
  bridge: DevToolsBridge;
}

/** Scrollable event list from bridge.events with type filtering */
export function EventsPanel({ bridge }: EventsPanelProps) {
  const [filter, setFilter] = useState('');

  const events = bridge.events
    .slice()
    .reverse()
    .filter((e) => !filter || e.type.includes(filter))
    .slice(0, 100);

  return (
    <div>
      <input
        style={s.filterInput}
        type="text"
        placeholder="Filter by type..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {events.length === 0 ? (
        <p style={s.emptyState}>
          {filter ? 'No events matching filter.' : 'No events captured yet.'}
        </p>
      ) : (
        <div style={{ fontFamily: s.fonts.mono, fontSize: s.fonts.sizeSmall }}>
          {events.map((e) => (
            <div key={e.id} style={{
              padding: '3px 0',
              borderBottom: `1px solid ${s.colors.borderLight}`,
              display: 'flex',
              gap: '8px',
            }}>
              <span style={{ color: s.colors.textDim, minWidth: '80px', flexShrink: 0 }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ color: s.colors.accent, minWidth: '140px', flexShrink: 0 }}>
                {e.type}
              </span>
              <span style={{
                color: s.colors.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {JSON.stringify(e.data)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
