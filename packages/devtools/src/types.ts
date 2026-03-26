/**
 * DevTools types for bridge data and configuration.
 *
 * @packageDocumentation
 */

import type { QueueStats } from '@localmode/core';

/** Configuration options for enableDevTools(). */
export interface DevToolsOptions {
  /** Maximum number of events in the circular buffer (default: 500) */
  eventBufferSize?: number;

  /** Interval in ms for polling storage quota (default: 5000) */
  storagePollingIntervalMs?: number;
}

/** A single event captured by the event collector. */
export interface DevToolsEvent {
  /** Monotonically increasing event ID */
  id: number;

  /** Event type with namespace prefix (e.g., 'vectordb:add', 'embedding:complete') */
  type: string;

  /** Event payload */
  data: Record<string, unknown>;

  /** ISO 8601 timestamp */
  timestamp: string;
}

/** Snapshot of model cache info, populated from embedding events. */
export interface ModelCacheInfo {
  /** Model identifier */
  modelId: string;

  /** Load duration in milliseconds */
  loadDurationMs: number;

  /** Current status */
  status: 'loaded' | 'error';

  /** Last time the model was used */
  lastUsed: string;
}

/** Aggregated VectorDB stats per collection. */
export interface VectorDBSnapshot {
  /** Total add operations */
  totalAdds: number;

  /** Total search operations */
  totalSearches: number;

  /** Total delete operations */
  totalDeletes: number;

  /** Average search duration in milliseconds */
  avgSearchDurationMs: number;

  /** Last activity timestamp */
  lastActivity: string;
}

/** Snapshot of a running or completed pipeline. */
export interface PipelineSnapshot {
  /** Current step name */
  currentStep: string;

  /** Number of steps completed */
  completed: number;

  /** Total number of steps */
  total: number;

  /** Pipeline status */
  status: 'running' | 'completed' | 'idle';

  /** When the pipeline started */
  startedAt: string;

  /** Duration in ms (set on completion) */
  durationMs?: number;
}

/** Storage quota snapshot. */
export interface StorageQuotaSnapshot {
  /** Used bytes */
  usedBytes: number;

  /** Total quota bytes */
  quotaBytes: number;

  /** Percentage used */
  percentUsed: number;

  /** Whether storage is persisted */
  isPersisted: boolean;

  /** Available bytes */
  availableBytes: number;
}

/** Device capabilities snapshot. */
export interface DeviceCapabilitiesSnapshot {
  /** Browser info */
  browser: Record<string, unknown>;

  /** Device info */
  device: Record<string, unknown>;

  /** Hardware info */
  hardware: Record<string, unknown>;

  /** Feature flags */
  features: Record<string, boolean>;

  /** Storage info */
  storage: Record<string, unknown>;
}

/** The bridge object exposed on window.__LOCALMODE_DEVTOOLS__. */
export interface DevToolsBridge {
  /** Version for forward compatibility */
  version: 1;

  /** Whether instrumentation is active */
  enabled: boolean;

  /** Timestamped event log (circular buffer) */
  events: DevToolsEvent[];

  /** Latest queue stats per registered queue */
  queues: Record<string, QueueStats>;

  /** Latest pipeline progress per registered pipeline */
  pipelines: Record<string, PipelineSnapshot>;

  /** Latest storage quota snapshot */
  storage: StorageQuotaSnapshot | null;

  /** Device capabilities (set once on init) */
  capabilities: DeviceCapabilitiesSnapshot | null;

  /** Model cache info (populated from events) */
  models: Record<string, ModelCacheInfo>;

  /** VectorDB stats (aggregated from events) */
  vectorDBs: Record<string, VectorDBSnapshot>;

  /** Subscribe to bridge data changes */
  subscribe: (callback: () => void) => () => void;
}

/** Cleanup function returned by collectors. */
export type CleanupFn = () => void;

/** Augment the global Window interface. */
declare global {
  interface Window {
    __LOCALMODE_DEVTOOLS__?: DevToolsBridge;
  }
}
