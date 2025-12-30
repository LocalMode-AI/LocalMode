/**
 * Capability Reporting
 *
 * Generate comprehensive capability reports for debugging and diagnostics.
 *
 * @packageDocumentation
 */

import type { CapabilityReport, DeviceCapabilities } from './types.js';
import { detectCapabilities } from './detect.js';

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Create a comprehensive capability report.
 *
 * Useful for debugging issues and providing support information.
 *
 * @returns Detailed capability report
 *
 * @example
 * ```typescript
 * import { createCapabilityReport, formatCapabilityReport } from '@localmode/core';
 *
 * const report = await createCapabilityReport();
 * console.log(formatCapabilityReport(report));
 * ```
 */
export async function createCapabilityReport(): Promise<CapabilityReport> {
  const capabilities = await detectCapabilities();

  // Calculate scores
  const scores = calculateScores(capabilities);

  // Generate recommendations
  const recommendations = generateRecommendations(capabilities);

  // Detect issues
  const issues = detectIssues(capabilities);

  return {
    timestamp: new Date(),
    capabilities,
    scores,
    recommendations,
    issues,
  };
}

/**
 * Calculate capability scores.
 */
function calculateScores(caps: DeviceCapabilities): CapabilityReport['scores'] {
  // ML Readiness Score (0-100)
  let mlReadiness = 0;
  if (caps.features.wasm) mlReadiness += 20;
  if (caps.features.simd) mlReadiness += 15;
  if (caps.features.threads) mlReadiness += 10;
  if (caps.features.webgpu) mlReadiness += 30;
  if (caps.features.webnn) mlReadiness += 10;
  if (caps.hardware.cores >= 4) mlReadiness += 10;
  if (caps.hardware.memory && caps.hardware.memory >= 4) mlReadiness += 5;

  // Storage Capacity Score (0-100)
  let storageCapacity = 0;
  const quotaGB = caps.storage.quotaBytes / (1024 * 1024 * 1024);
  const usedPercent = (caps.storage.usedBytes / caps.storage.quotaBytes) * 100;

  if (quotaGB >= 10) storageCapacity += 40;
  else if (quotaGB >= 5) storageCapacity += 30;
  else if (quotaGB >= 1) storageCapacity += 20;
  else storageCapacity += 10;

  if (usedPercent < 50) storageCapacity += 30;
  else if (usedPercent < 80) storageCapacity += 20;
  else storageCapacity += 10;

  if (caps.storage.isPersisted) storageCapacity += 20;
  if (caps.features.opfs) storageCapacity += 10;

  // Performance Potential Score (0-100)
  let performancePotential = 0;
  if (caps.features.webgpu) performancePotential += 40;
  else if (caps.features.wasm) performancePotential += 20;

  if (caps.features.simd) performancePotential += 20;
  if (caps.features.threads && caps.hardware.cores >= 4) performancePotential += 20;
  if (caps.hardware.cores >= 8) performancePotential += 10;
  else if (caps.hardware.cores >= 4) performancePotential += 5;

  if (caps.hardware.gpu?.toLowerCase().includes('nvidia')) performancePotential += 10;
  else if (caps.hardware.gpu?.toLowerCase().includes('amd')) performancePotential += 8;
  else if (caps.hardware.gpu?.toLowerCase().includes('apple')) performancePotential += 8;

  return {
    mlReadiness: Math.min(100, mlReadiness),
    storageCapacity: Math.min(100, storageCapacity),
    performancePotential: Math.min(100, performancePotential),
  };
}

/**
 * Generate recommendations based on capabilities.
 */
function generateRecommendations(caps: DeviceCapabilities): string[] {
  const recommendations: string[] = [];

  // Browser recommendations
  if (!caps.features.webgpu && caps.browser.name === 'Firefox') {
    recommendations.push(
      'Enable WebGPU in Firefox: about:config → dom.webgpu.enabled = true'
    );
  }

  if (!caps.features.webgpu && caps.browser.name !== 'Chrome' && caps.browser.name !== 'Edge') {
    recommendations.push(
      'For best performance, use Chrome 113+ or Edge 113+ for WebGPU support'
    );
  }

  // CORS isolation
  if (!caps.features.crossOriginisolated && caps.features.sharedarraybuffer === false) {
    recommendations.push(
      'Enable cross-origin isolation for multi-threading: Add COOP and COEP headers'
    );
  }

  // Storage
  if (!caps.storage.isPersisted) {
    recommendations.push(
      'Request persistent storage to prevent data loss: navigator.storage.persist()'
    );
  }

  if (caps.storage.usedBytes / caps.storage.quotaBytes > 0.8) {
    recommendations.push(
      'Storage is over 80% full. Consider cleaning up old data.'
    );
  }

  // Memory
  if (caps.hardware.memory && caps.hardware.memory < 4) {
    recommendations.push(
      'Low device memory detected. Use smaller models (e.g., whisper-tiny instead of whisper-large)'
    );
  }

  // Performance
  if (!caps.features.simd) {
    recommendations.push(
      'WASM SIMD not available. Vector operations will be slower.'
    );
  }

  return recommendations;
}

/**
 * Detect issues in capabilities.
 */
function detectIssues(
  caps: DeviceCapabilities
): CapabilityReport['issues'] {
  const issues: CapabilityReport['issues'] = [];

  // Critical issues
  if (!caps.features.wasm) {
    issues.push({
      severity: 'error',
      message: 'WebAssembly is not supported',
      suggestion: 'Use a modern browser (Chrome 57+, Firefox 52+, Safari 11+)',
    });
  }

  if (!caps.features.indexeddb) {
    issues.push({
      severity: 'error',
      message: 'IndexedDB is not available',
      suggestion: 'Disable private browsing mode or use a different browser',
    });
  }

  // Warnings
  if (!caps.features.webworkers) {
    issues.push({
      severity: 'warning',
      message: 'Web Workers not available',
      suggestion: 'Heavy operations will block the UI',
    });
  }

  if (!caps.features.webgpu && !caps.features.webnn) {
    issues.push({
      severity: 'warning',
      message: 'No GPU acceleration available',
      suggestion: 'ML inference will use CPU only, which is slower',
    });
  }

  if (caps.hardware.cores < 2) {
    issues.push({
      severity: 'warning',
      message: 'Single-core device detected',
      suggestion: 'Performance may be limited for ML workloads',
    });
  }

  // Info
  if (caps.device.type === 'mobile') {
    issues.push({
      severity: 'info',
      message: 'Mobile device detected',
      suggestion: 'Use smaller models for better performance and battery life',
    });
  }

  if (!caps.features.opfs) {
    issues.push({
      severity: 'info',
      message: 'Origin Private File System not available',
      suggestion: 'Large file storage will use IndexedDB instead',
    });
  }

  return issues;
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Format a capability report as a human-readable string.
 *
 * @param report - Capability report to format
 * @returns Formatted string
 */
export function formatCapabilityReport(report: CapabilityReport): string {
  const lines: string[] = [];
  const { capabilities: caps, scores, recommendations, issues } = report;

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    CAPABILITY REPORT                          ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Generated: ${report.timestamp.toISOString()}`);
  lines.push('');

  // Browser & Device
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ BROWSER & DEVICE                                            │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push(`  Browser:  ${caps.browser.name} ${caps.browser.version} (${caps.browser.engine})`);
  lines.push(`  Device:   ${caps.device.type} - ${caps.device.os} ${caps.device.osVersion}`);
  lines.push(`  Cores:    ${caps.hardware.cores}`);
  lines.push(`  Memory:   ${caps.hardware.memory ? `${caps.hardware.memory} GB` : 'unknown'}`);
  lines.push(`  GPU:      ${caps.hardware.gpu ?? 'unknown'}`);
  lines.push('');

  // Features
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ FEATURES                                                     │');
  lines.push('└─────────────────────────────────────────────────────────────┘');

  const featureList: Array<[string, boolean]> = [
    ['WebGPU', caps.features.webgpu],
    ['WebNN', caps.features.webnn],
    ['WebAssembly', caps.features.wasm],
    ['WASM SIMD', caps.features.simd],
    ['WASM Threads', caps.features.threads],
    ['IndexedDB', caps.features.indexeddb],
    ['OPFS', caps.features.opfs],
    ['Web Workers', caps.features.webworkers],
    ['SharedArrayBuffer', caps.features.sharedarraybuffer],
    ['Cross-Origin Isolated', caps.features.crossOriginisolated],
    ['Service Worker', caps.features.serviceworker],
    ['BroadcastChannel', caps.features.broadcastchannel],
    ['Web Locks', caps.features.weblocks],
  ];

  for (const [name, supported] of featureList) {
    const icon = supported ? '✓' : '✗';
    const status = supported ? 'supported' : 'not available';
    lines.push(`  ${icon} ${name.padEnd(22)} ${status}`);
  }
  lines.push('');

  // Storage
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ STORAGE                                                      │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push(`  Quota:     ${formatBytes(caps.storage.quotaBytes)}`);
  lines.push(`  Used:      ${formatBytes(caps.storage.usedBytes)}`);
  lines.push(`  Available: ${formatBytes(caps.storage.availableBytes)}`);
  lines.push(`  Persisted: ${caps.storage.isPersisted ? 'yes' : 'no'}`);
  lines.push('');

  // Scores
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ SCORES                                                       │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push(`  ML Readiness:        ${formatScore(scores.mlReadiness)}`);
  lines.push(`  Storage Capacity:    ${formatScore(scores.storageCapacity)}`);
  lines.push(`  Performance Potential: ${formatScore(scores.performancePotential)}`);
  lines.push('');

  // Issues
  if (issues.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ ISSUES                                                       │');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`     → ${issue.suggestion}`);
      }
    }
    lines.push('');
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ RECOMMENDATIONS                                              │');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    for (const rec of recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatScore(score: number): string {
  const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
  return `${bar} ${score}%`;
}

