import { describe, expect, it } from 'vitest';

import {
  appendDefaultExport,
  hasDefaultExport,
  isPrimaryFile,
  namedExports,
  pascalCase,
  PRIMARY_EXPORT_OVERRIDES,
  resolvePrimaryExport,
} from './add-default-export';

describe('pascalCase()', () => {
  it('converts a kebab basename to PascalCase, stripping the extension', () => {
    expect(pascalCase('device-badge.tsx')).toBe('DeviceBadge');
    expect(pascalCase('chrome-ai-download-gate.tsx')).toBe('ChromeAiDownloadGate');
    expect(pascalCase('message.tsx')).toBe('Message');
  });

  it('handles underscores and no extension', () => {
    expect(pascalCase('voice_orb')).toBe('VoiceOrb');
    expect(pascalCase('reasoning')).toBe('Reasoning');
  });
});

describe('isPrimaryFile()', () => {
  it('matches the file whose basename equals the item last segment', () => {
    expect(isPrimaryFile('ui/conversation/message', 'registry/localmode/conversation/message/message.tsx')).toBe(true);
    expect(isPrimaryFile('ui/local-first/device-badge', 'registry/localmode/local-first/device-badge/device-badge.tsx')).toBe(true);
  });

  it('rejects sibling files and non-code files', () => {
    expect(isPrimaryFile('ui/conversation/message', 'registry/localmode/conversation/lib/markdown.tsx')).toBe(false);
    expect(isPrimaryFile('ui/local-first/device-badge', 'registry/localmode/local-first/device-badge/device-badge.css')).toBe(false);
  });
});

describe('namedExports()', () => {
  it('collects function / const / class declarations', () => {
    const src = `
      export function Reasoning() {}
      export const ReasoningTrigger = () => null;
      export class ThinkingBar {}
      const Private = 1;
    `;
    const names = namedExports(src);
    expect(names).toContain('Reasoning');
    expect(names).toContain('ReasoningTrigger');
    expect(names).toContain('ThinkingBar');
    expect(names.has('Private')).toBe(false);
  });

  it('collects `export { A, B as C }` names (the aliased name)', () => {
    const names = namedExports(`function a(){} function b(){}\nexport { a as Alpha, b };`);
    expect(names).toContain('Alpha');
    expect(names).toContain('b');
  });
});

describe('hasDefaultExport()', () => {
  it('detects an existing default export', () => {
    expect(hasDefaultExport('export function X(){}\nexport default X;\n')).toBe(true);
    expect(hasDefaultExport('export default function X(){}')).toBe(true);
  });

  it('is false for named-only source', () => {
    expect(hasDefaultExport('export function X(){}\n')).toBe(false);
    // must not false-positive on a string that merely contains the words
    expect(hasDefaultExport('const s = "export default is a phrase";\n')).toBe(false);
  });
});

describe('resolvePrimaryExport()', () => {
  it('picks the exact PascalCase(basename) export', () => {
    expect(
      resolvePrimaryExport('ui/local-first/device-badge', 'device-badge.tsx', new Set(['DeviceBadge'])),
    ).toBe('DeviceBadge');
  });

  it('resolves a unique case-insensitive match (ChromeAIDownloadGate)', () => {
    const exports = new Set(['ChromeAIDownloadGate', 'ChromeAIReadyBadge']);
    expect(
      resolvePrimaryExport('ui/local-first/chrome-ai-download-gate', 'chrome-ai-download-gate.tsx', exports),
    ).toBe('ChromeAIDownloadGate');
  });

  it('honors an explicit override for multi-component files', () => {
    const exports = new Set(['MultiStepPipelineTracker', 'StagePipelineTracker', 'StepsPlan', 'InferenceQueueSurface']);
    expect(resolvePrimaryExport('ui/conversation/pipeline-tracker', 'pipeline-tracker.tsx', exports)).toBe(
      'MultiStepPipelineTracker',
    );
    // the override is genuinely one of the file's exports
    expect(exports.has(PRIMARY_EXPORT_OVERRIDES['ui/conversation/pipeline-tracker'])).toBe(true);
  });

  it('returns null when nothing resolves (never guess a missing binding)', () => {
    expect(resolvePrimaryExport('ui/x/mystery', 'mystery.tsx', new Set(['SomethingElse', 'AndAnother']))).toBeNull();
    // an override that isn't actually exported is rejected, not blindly emitted
    expect(resolvePrimaryExport('ui/conversation/pipeline-tracker', 'pipeline-tracker.tsx', new Set(['Other']))).toBeNull();
  });
});

describe('appendDefaultExport()', () => {
  it('appends a default export with a single blank-line separator', () => {
    expect(appendDefaultExport('export function DeviceBadge(){}\n', 'DeviceBadge')).toBe(
      'export function DeviceBadge(){}\n\nexport default DeviceBadge;\n',
    );
  });

  it('normalizes trailing whitespace so output is deterministic', () => {
    expect(appendDefaultExport('export const X = 1;\n\n\n  ', 'X')).toBe('export const X = 1;\n\nexport default X;\n');
  });

  it('round-trips through hasDefaultExport (idempotency guard for the pipeline)', () => {
    const out = appendDefaultExport('export function X(){}', 'X');
    expect(hasDefaultExport(out)).toBe(true);
  });
});
