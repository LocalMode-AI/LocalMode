// @vitest-environment node
/**
 * @file ssr.test.tsx
 * @description Task 5.5 (SSR half) — `react-dom/server` renderToString of
 * consumers of every hook in a REAL server environment (vitest node env — no
 * `window`, no jsdom, no bridge): rendering succeeds without throwing and
 * every hook yields its inert value.
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  useDevToolsBridge,
  useDevToolsStatus,
  useDevToolsQueueStats,
  useDevToolsEvents,
  useDevToolsModelCache,
  useDevToolsPipelineRuns,
  useDevToolsVectorDBs,
  useDevToolsStorage,
  useDevToolsCapabilities,
} from '../../src/react/index.js';

/** Consumes every hook and serializes what it saw. */
function AllHooksProbe() {
  const bridge = useDevToolsBridge();
  const status = useDevToolsStatus();
  const queues = useDevToolsQueueStats();
  const events = useDevToolsEvents();
  const filteredEvents = useDevToolsEvents({ types: ['vectordb'], limit: 5 });
  const models = useDevToolsModelCache();
  const pipelines = useDevToolsPipelineRuns();
  const vectorDBs = useDevToolsVectorDBs();
  const storage = useDevToolsStorage();
  const capabilities = useDevToolsCapabilities();

  return (
    <div>
      {JSON.stringify({
        bridgeIsNull: bridge === null,
        status,
        queueKeys: Object.keys(queues).length,
        eventCount: events.length,
        filteredEventCount: filteredEvents.length,
        modelKeys: Object.keys(models).length,
        pipelineKeys: Object.keys(pipelines).length,
        vectorDBKeys: Object.keys(vectorDBs).length,
        storageIsNull: storage === null,
        capabilitiesIsNull: capabilities === null,
      })}
    </div>
  );
}

/** Decode the HTML entities renderToString escapes in text content. */
function decodeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

describe('SSR safety (real node environment, no window)', () => {
  it('runs in an environment without window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('renderToString renders every hook inert without throwing', () => {
    const html = renderToString(<AllHooksProbe />);

    const payload = JSON.parse(
      decodeHtml(html).replace(/^<div>/, '').replace(/<\/div>$/, '')
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      bridgeIsNull: true,
      status: { available: false, enabled: false },
      queueKeys: 0,
      eventCount: 0,
      filteredEventCount: 0,
      modelKeys: 0,
      pipelineKeys: 0,
      vectorDBKeys: 0,
      storageIsNull: true,
      capabilitiesIsNull: true,
    });
  });

  it('the main entry enableDevTools() also stays SSR-safe alongside the hooks', async () => {
    // Server code paths may import both entries; enabling on the server must
    // not throw (bridge is simply not attached to a window).
    const { enableDevTools, disableDevTools, isDevToolsEnabled } = await import(
      '../../src/index.js'
    );
    expect(() => enableDevTools()).not.toThrow();
    expect(isDevToolsEnabled()).toBe(true);
    const html = renderToString(<AllHooksProbe />);
    expect(decodeHtml(html)).toContain('"bridgeIsNull":true');
    disableDevTools();
  });
});
