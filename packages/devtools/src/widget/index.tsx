/**
 * @file index.tsx
 * @description DevToolsWidget — in-app overlay for monitoring LocalMode applications.
 * Renders a floating button that expands into a tabbed panel with 6 views.
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { enableDevTools, isDevToolsEnabled } from '../index.js';
import { useBridge } from './use-bridge.js';
import { ModelsPanel } from './panels/models-panel.js';
import { VectorDBPanel } from './panels/vectordb-panel.js';
import { QueuePanel } from './panels/queue-panel.js';
import { PipelinePanel } from './panels/pipeline-panel.js';
import { EventsPanel } from './panels/events-panel.js';
import { DevicePanel } from './panels/device-panel.js';
import * as s from './styles.js';

/** Tab identifier */
type TabId = 'models' | 'vectordb' | 'queue' | 'pipeline' | 'events' | 'device';

const TABS: { id: TabId; label: string }[] = [
  { id: 'models', label: 'Models' },
  { id: 'vectordb', label: 'VectorDB' },
  { id: 'queue', label: 'Queue' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'events', label: 'Events' },
  { id: 'device', label: 'Device' },
];

/** Props for the DevToolsWidget component */
export interface DevToolsWidgetProps {
  /** Where to position the floating button */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Whether the panel starts open */
  defaultOpen?: boolean;
  /** Auto-call enableDevTools() if bridge not found (default: true) */
  autoEnable?: boolean;
  /** Panel height in pixels (default: 400) */
  panelHeight?: number;
  /** z-index for the widget (default: 99999) */
  zIndex?: number;
}

/**
 * In-app DevTools overlay for monitoring LocalMode applications.
 *
 * Renders a floating button that expands into a tabbed panel with six views:
 * Models, VectorDB, Queue, Pipeline, Events, and Device.
 *
 * @param props - Widget configuration options
 *
 * @example
 * ```tsx
 * import { DevToolsWidget } from '@localmode/devtools/widget';
 *
 * <DevToolsWidget position="bottom-right" defaultOpen={false} />
 * ```
 */
export function DevToolsWidget({
  position = 'bottom-right',
  defaultOpen = false,
  autoEnable = true,
  panelHeight = 400,
  zIndex = 99999,
}: DevToolsWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<TabId>('models');

  // Auto-enable instrumentation if bridge not found
  useEffect(() => {
    if (autoEnable && !isDevToolsEnabled() && typeof window !== 'undefined' && !window.__LOCALMODE_DEVTOOLS__) {
      enableDevTools();
    }
  }, [autoEnable]);

  const bridge = useBridge();

  // Position styles for the floating button and panel
  const positionStyles = getPositionStyles(position);

  const buttonStyle: CSSProperties = {
    ...s.floatingButton,
    ...positionStyles.button,
    zIndex,
  };

  const panelStyle: CSSProperties = {
    ...s.panelContainer,
    ...positionStyles.panel,
    width: '600px',
    height: `${panelHeight}px`,
    zIndex,
  };

  if (!isOpen) {
    return (
      <button
        style={buttonStyle}
        onClick={() => setIsOpen(true)}
        aria-label="Open LocalMode DevTools"
        title="LocalMode DevTools"
      >
        DEV
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            style={s.tab(activeTab === id)}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
        <span style={{
          marginLeft: 'auto',
          padding: '6px 14px',
          color: bridge?.enabled ? s.colors.green : s.colors.red,
          fontSize: s.fonts.sizeSmall,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {bridge?.enabled ? 'Connected' : 'Disabled'}
          <button
            style={{
              background: 'none',
              border: 'none',
              color: s.colors.textMuted,
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 4px',
              fontFamily: s.fonts.family,
            }}
            onClick={() => setIsOpen(false)}
            aria-label="Close DevTools panel"
          >
            ×
          </button>
        </span>
      </div>

      {/* Tab content */}
      <div style={s.tabContent}>
        {!bridge && !autoEnable ? (
          <div style={{ ...s.emptyState, textAlign: 'center', paddingTop: '40px' }}>
            <p>DevTools not enabled.</p>
            <p style={{ marginTop: '8px' }}>
              Call <code style={s.codeStyle}>enableDevTools()</code> in your app.
            </p>
          </div>
        ) : !bridge ? (
          <div style={{ ...s.emptyState, textAlign: 'center', paddingTop: '40px' }}>
            Initializing...
          </div>
        ) : (
          renderTabContent(activeTab, bridge)
        )}
      </div>
    </div>
  );
}

function renderTabContent(tab: TabId, bridge: NonNullable<ReturnType<typeof useBridge>>) {
  switch (tab) {
    case 'models': return <ModelsPanel bridge={bridge} />;
    case 'vectordb': return <VectorDBPanel bridge={bridge} />;
    case 'queue': return <QueuePanel bridge={bridge} />;
    case 'pipeline': return <PipelinePanel bridge={bridge} />;
    case 'events': return <EventsPanel bridge={bridge} />;
    case 'device': return <DevicePanel bridge={bridge} />;
  }
}

function getPositionStyles(position: string): { button: CSSProperties; panel: CSSProperties } {
  switch (position) {
    case 'bottom-left':
      return {
        button: { bottom: '16px', left: '16px' },
        panel: { bottom: '16px', left: '16px' },
      };
    case 'top-right':
      return {
        button: { top: '16px', right: '16px' },
        panel: { top: '16px', right: '16px' },
      };
    case 'top-left':
      return {
        button: { top: '16px', left: '16px' },
        panel: { top: '16px', left: '16px' },
      };
    case 'bottom-right':
    default:
      return {
        button: { bottom: '16px', right: '16px' },
        panel: { bottom: '16px', right: '16px' },
      };
  }
}

export type { DevToolsWidgetProps as WidgetProps };
