import { describe, expect, it } from 'vitest';

import {
  absolutizeDependencies,
  absolutizeDependency,
  resolveRegistryOrigin,
} from './absolutize-registry-deps';

const ORIGIN = 'https://localmode.ai';

describe('resolveRegistryOrigin()', () => {
  it('prefers NEXT_PUBLIC_REGISTRY_ORIGIN', () => {
    expect(
      resolveRegistryOrigin({
        NEXT_PUBLIC_REGISTRY_ORIGIN: 'https://preview.example.com',
        NEXT_PUBLIC_SITE_URL: 'https://localmode.ai',
      }),
    ).toBe('https://preview.example.com');
  });

  it('falls back to NEXT_PUBLIC_SITE_URL, then to production', () => {
    expect(resolveRegistryOrigin({ NEXT_PUBLIC_SITE_URL: 'https://site.example' })).toBe(
      'https://site.example',
    );
    expect(resolveRegistryOrigin({})).toBe('https://localmode.ai');
  });

  it('trims trailing slashes so URLs never double up', () => {
    expect(resolveRegistryOrigin({ NEXT_PUBLIC_REGISTRY_ORIGIN: 'http://localhost:4599/' })).toBe(
      'http://localhost:4599',
    );
  });
});

describe('absolutizeDependency()', () => {
  it('rewrites a namespaced item to its public registry URL', () => {
    expect(absolutizeDependency('@localmode/ui/lib/utils', ORIGIN)).toBe(
      'https://localmode.ai/r/ui/lib/utils.json',
    );
    expect(absolutizeDependency('@localmode/ui/audio/waveform-activity-bars', ORIGIN)).toBe(
      'https://localmode.ai/r/ui/audio/waveform-activity-bars.json',
    );
  });

  it('leaves bare shadcn item names untouched', () => {
    for (const bare of ['button', 'badge', 'collapsible', 'tabs']) {
      expect(absolutizeDependency(bare, ORIGIN)).toBe(bare);
    }
  });

  it('leaves already-absolute URLs untouched (idempotent)', () => {
    const url = 'https://localmode.ai/r/ui/lib/utils.json';
    expect(absolutizeDependency(url, ORIGIN)).toBe(url);
    expect(absolutizeDependency(absolutizeDependency('@localmode/ui/lib/utils', ORIGIN), ORIGIN)).toBe(
      url,
    );
  });

  it('leaves other shadcn address forms untouched', () => {
    expect(absolutizeDependency('./editor.json', ORIGIN)).toBe('./editor.json');
    expect(absolutizeDependency('acme/ui/button#v1.2.0', ORIGIN)).toBe('acme/ui/button#v1.2.0');
  });

  it('honors a localhost origin (the consumer-test lanes)', () => {
    expect(absolutizeDependency('@localmode/ui/lib/utils', 'http://localhost:4599')).toBe(
      'http://localhost:4599/r/ui/lib/utils.json',
    );
  });
});

describe('absolutizeDependencies()', () => {
  it('rewrites only the namespaced entries of a mixed list', () => {
    expect(
      absolutizeDependencies(['@localmode/ui/lib/utils', 'button', '@localmode/ui/audio/voice-picker'], ORIGIN),
    ).toEqual([
      'https://localmode.ai/r/ui/lib/utils.json',
      'button',
      'https://localmode.ai/r/ui/audio/voice-picker.json',
    ]);
  });

  it('passes through a missing dependency list', () => {
    expect(absolutizeDependencies(undefined, ORIGIN)).toBeUndefined();
  });

  it('leaves an empty list empty', () => {
    expect(absolutizeDependencies([], ORIGIN)).toEqual([]);
  });
});
