/**
 * @file styles.ts
 * @description Shared inline style constants for the DevTools widget.
 * All styles use inline CSS for complete isolation from host app styles.
 */

import type { CSSProperties } from 'react';

/** Color palette for the dark-themed DevTools widget */
export const colors = {
  bg: '#1e1e1e',
  bgElevated: '#252525',
  bgHover: '#2a2a2a',
  border: '#333',
  borderLight: '#2a2a2a',
  text: '#e8e8e8',
  textMuted: '#888',
  textDim: '#666',
  accent: '#7ecfff',
  green: '#4caf50',
  red: '#f44336',
  amber: '#ff9800',
  transparent: 'transparent',
} as const;

/** Font settings */
export const fonts = {
  family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "Menlo, Monaco, 'Courier New', monospace",
  size: '12px',
  sizeSmall: '11px',
} as const;

/** Reusable style objects */

export const panelContainer: CSSProperties = {
  position: 'fixed',
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  fontFamily: fonts.family,
  fontSize: fonts.size,
  color: colors.text,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const floatingButton: CSSProperties = {
  position: 'fixed',
  width: '40px',
  height: '40px',
  borderRadius: '8px',
  border: `1px solid ${colors.border}`,
  background: colors.bgElevated,
  color: colors.accent,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: fonts.family,
  fontSize: '14px',
  fontWeight: 'bold',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  transition: 'background 0.15s',
};

export const tabBar: CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${colors.border}`,
  background: colors.bgElevated,
  flexShrink: 0,
};

export const tab = (active: boolean): CSSProperties => ({
  padding: '6px 14px',
  background: active ? colors.bg : colors.transparent,
  color: active ? colors.accent : colors.textMuted,
  border: 'none',
  borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
  cursor: 'pointer',
  fontSize: fonts.size,
  fontFamily: fonts.family,
  outline: 'none',
});

export const tabContent: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px',
};

export const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

export const th: CSSProperties = {
  padding: '4px 8px',
  color: colors.textMuted,
  textAlign: 'left',
  borderBottom: `1px solid ${colors.border}`,
  fontWeight: 'normal',
};

export const td: CSSProperties = {
  padding: '4px 8px',
  borderBottom: `1px solid ${colors.borderLight}`,
};

export const emptyState: CSSProperties = {
  color: colors.textDim,
  padding: '16px 0',
};

export const statusBadge = (status: 'loaded' | 'error' | 'running' | 'completed' | 'idle'): CSSProperties => ({
  color: status === 'loaded' || status === 'completed'
    ? colors.green
    : status === 'error'
      ? colors.red
      : status === 'running'
        ? colors.amber
        : colors.textMuted,
});

export const highlightValue = (value: number): CSSProperties => ({
  color: value > 0 ? colors.amber : 'inherit',
});

export const codeStyle: CSSProperties = {
  color: colors.accent,
  fontFamily: fonts.mono,
  fontSize: fonts.sizeSmall,
};

export const filterInput: CSSProperties = {
  padding: '4px 8px',
  background: colors.bgElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  color: colors.text,
  fontSize: fonts.size,
  fontFamily: fonts.family,
  outline: 'none',
  width: '200px',
  marginBottom: '8px',
};
