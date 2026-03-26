/**
 * @file pipeline-panel.tsx
 * @description Pipeline tab panel showing execution status and progress.
 */

import type { DevToolsBridge } from '../../types.js';
import * as s from '../styles.js';

/** Props for the PipelinePanel */
interface PipelinePanelProps {
  bridge: DevToolsBridge;
}

/** Pipeline execution cards from bridge.pipelines */
export function PipelinePanel({ bridge }: PipelinePanelProps) {
  const pipes = Object.entries(bridge.pipelines);

  if (pipes.length === 0) {
    return (
      <p style={s.emptyState}>
        No pipelines tracked. Use <code style={s.codeStyle}>createDevToolsProgressCallback()</code> to monitor pipelines.
      </p>
    );
  }

  return (
    <div>
      {pipes.map(([name, p]) => {
        const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
        return (
          <div key={name} style={{
            marginBottom: '12px',
            padding: '8px',
            background: s.colors.bgElevated,
            borderRadius: '4px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <strong style={{ color: s.colors.text }}>{name}</strong>
              <span style={s.statusBadge(p.status)}>{p.status}</span>
            </div>
            <div style={{
              background: s.colors.border,
              height: '6px',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                background: s.colors.accent,
                height: '100%',
                width: `${pct}%`,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '4px',
              color: s.colors.textMuted,
              fontSize: s.fonts.sizeSmall,
            }}>
              <span>{p.currentStep || 'done'}</span>
              <span>
                {p.completed}/{p.total}
                {p.durationMs ? ` (${p.durationMs}ms)` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
