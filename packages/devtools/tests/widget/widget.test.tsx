/**
 * @file widget.test.tsx
 * @description Tests for the DevToolsWidget component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DevToolsWidget } from '../../src/widget/index.js';
import type { DevToolsBridge } from '../../src/types.js';

function createMockBridge(): DevToolsBridge {
  const subscribers = new Set<() => void>();
  return {
    version: 1,
    enabled: true,
    events: [],
    queues: {},
    pipelines: {},
    storage: null,
    capabilities: null,
    models: {},
    vectorDBs: {},
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
  };
}

// Mock enableDevTools
vi.mock('../../src/index.js', async () => {
  const actual = await vi.importActual('../../src/index.js');
  return {
    ...actual,
    enableDevTools: vi.fn(() => {
      const subscribers = new Set<() => void>();
      window.__LOCALMODE_DEVTOOLS__ = {
        version: 1,
        enabled: true,
        events: [],
        queues: {},
        pipelines: {},
        storage: null,
        capabilities: null,
        models: {},
        vectorDBs: {},
        subscribe(callback: () => void) {
          subscribers.add(callback);
          return () => { subscribers.delete(callback); };
        },
      };
    }),
    isDevToolsEnabled: vi.fn(() => !!window.__LOCALMODE_DEVTOOLS__),
  };
});

describe('DevToolsWidget', () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('renders a floating button when closed', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget />);
    expect(screen.getByRole('button', { name: /open localmode devtools/i })).toBeTruthy();
  });

  it('toggles the panel on button click', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget />);

    const button = screen.getByRole('button', { name: /open localmode devtools/i });
    fireEvent.click(button);

    // Panel should be open with tabs visible
    expect(screen.getByText('Models')).toBeTruthy();
    expect(screen.getByText('VectorDB')).toBeTruthy();
    expect(screen.getByText('Queue')).toBeTruthy();
  });

  it('switches tabs when clicked', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget defaultOpen={true} />);

    // Default tab shows Models content
    expect(screen.getByText('No models loaded yet.')).toBeTruthy();

    // Switch to Queue tab
    fireEvent.click(screen.getByText('Queue'));
    expect(screen.getByText(/No queues registered/)).toBeTruthy();
  });

  it('auto-enables when bridge not present', async () => {
    const { enableDevTools } = await import('../../src/index.js');
    render(<DevToolsWidget />);
    expect(enableDevTools).toHaveBeenCalled();
  });

  it('does not auto-enable when autoEnable is false', async () => {
    const { enableDevTools } = await import('../../src/index.js');
    render(<DevToolsWidget autoEnable={false} />);
    expect(enableDevTools).not.toHaveBeenCalled();
  });

  it('shows fallback message when autoEnable is false and no bridge', () => {
    render(<DevToolsWidget autoEnable={false} defaultOpen={true} />);
    expect(screen.getByText('DevTools not enabled.')).toBeTruthy();
  });

  it('applies custom zIndex', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget zIndex={50000} />);
    const button = screen.getByRole('button', { name: /open localmode devtools/i });
    expect(button.style.zIndex).toBe('50000');
  });

  it('applies custom position', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget position="top-left" />);
    const button = screen.getByRole('button', { name: /open localmode devtools/i });
    expect(button.style.top).toBe('16px');
    expect(button.style.left).toBe('16px');
  });

  it('applies custom panelHeight', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget defaultOpen={true} panelHeight={600} />);
    // The panel container should have height 600px
    const panel = screen.getByText('Models').closest('div[style]')?.parentElement;
    expect(panel?.style.height).toBe('600px');
  });

  it('closes panel when close button is clicked', () => {
    window.__LOCALMODE_DEVTOOLS__ = createMockBridge();
    render(<DevToolsWidget defaultOpen={true} />);

    // Panel should be open
    expect(screen.getByText('Models')).toBeTruthy();

    // Click close button
    fireEvent.click(screen.getByRole('button', { name: /close devtools panel/i }));

    // Should be back to floating button
    expect(screen.getByRole('button', { name: /open localmode devtools/i })).toBeTruthy();
  });
});
