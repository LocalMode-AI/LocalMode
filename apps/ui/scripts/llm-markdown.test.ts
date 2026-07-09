/**
 * @file llm-markdown.test.ts
 * @description Real-flow tests for `expandDocMarkdown` — the transform that
 * backs "Copy page" / "View as Markdown" (`/api/md`) and `llms*.txt`. No mocks:
 * the component source is read from the real registry file on disk and the props
 * table is resolved by the real fumadocs-typescript type resolver, exactly as
 * the docs server does. The input mirrors the tag shapes fumadocs' processed
 * markdown emits for a component page (captured empirically from the live route).
 */
import { describe, expect, it } from 'vitest';
import { expandDocMarkdown } from '@/lib/llm-markdown';

// A faithful slice of a processed component page (device-badge), with the four
// registry MDX helper tags exactly as `getText('processed')` serializes them,
// plus a hand-written Examples fence that must survive untouched.
const PROCESSED = `# Device Badge

Device Badge [#device-badge]

The **Device Badge** surfaces a browser AI capability.

Preview [#preview]

<ComponentPreview name="ui/device-badge" note="Detects your browser's WebGPU / WASM / storage support — runs locally, no model download." />

<OpenInV0 name="ui/device-badge" />

Installation [#installation]

<InstallTabs name="ui/device-badge" />

Props [#props]

<AutoTypeTable path="registry/localmode/device-badge/device-badge.tsx" name="DeviceBadgeProps" />

Examples [#examples]

\`\`\`tsx
import { DeviceBadge } from '@/components/device-badge';

export function Example() {
  return <DeviceBadge />;
}
\`\`\`
`;

describe('expandDocMarkdown (expandSource: true — per-page Copy page)', () => {
  it('inlines the real component demo source as a fenced tsx block', async () => {
    const out = await expandDocMarkdown(PROCESSED, { expandSource: true });
    // The <ComponentPreview> tag is gone, replaced by the real demo source.
    expect(out).not.toContain('<ComponentPreview');
    expect(out).toContain('export default function DeviceBadgeDemo');
    // Imports are rewritten to the post-install alias a consumer actually uses.
    expect(out).toContain("from '@/components/device-badge'");
    expect(out).not.toContain("from './device-badge'");
  });

  it('renders a markdown props table of the component OWN props, pipe-escaped', async () => {
    const out = await expandDocMarkdown(PROCESSED, { expandSource: true });
    expect(out).not.toContain('<AutoTypeTable');
    expect(out).toContain('| Prop | Type | Default | Description |');
    expect(out).toContain('| `capability` |');
    expect(out).toContain('| `compact` |');
    // Union-type pipes are escaped so they don't break the markdown table.
    expect(out).toContain('"storage" \\| "wasm" \\| "webgpu"');
    // Inherited native attributes are NOT present (standalone interface here,
    // but className is always dropped).
    expect(out).not.toContain('| `className` |');
  });

  it('turns InstallTabs into a plain shadcn add command and drops OpenInV0', async () => {
    const out = await expandDocMarkdown(PROCESSED, { expandSource: true });
    expect(out).not.toContain('<InstallTabs');
    expect(out).not.toContain('<OpenInV0');
    expect(out).toContain('npx shadcn@latest add @localmode/ui/device-badge');
  });

  it('leaves the hand-written Examples fence untouched', async () => {
    const out = await expandDocMarkdown(PROCESSED, { expandSource: true });
    expect(out).toContain('export function Example()');
    expect(out).toContain('return <DeviceBadge />');
  });
});

describe('expandDocMarkdown (expandSource: false — lean llms-full.txt)', () => {
  it('points at the registry JSON instead of inlining full source', async () => {
    const out = await expandDocMarkdown(PROCESSED, { expandSource: false });
    expect(out).not.toContain('<ComponentPreview');
    // No inlined demo source.
    expect(out).not.toContain('DeviceBadgeDemo');
    // A compact pointer to the canonical registry source.
    expect(out).toContain('/r/ui/device-badge.json');
    expect(out).toContain('npx shadcn@latest add @localmode/ui/device-badge');
    // Props table still expands (it is compact and high-value).
    expect(out).toContain('| `capability` |');
  });
});

describe('expandDocMarkdown (no tags)', () => {
  it('returns tag-free markdown effectively unchanged', async () => {
    const input = '# Title\n\nSome prose with no registry tags.\n';
    const out = await expandDocMarkdown(input, { expandSource: true });
    expect(out).toBe('# Title\n\nSome prose with no registry tags.');
  });
});
