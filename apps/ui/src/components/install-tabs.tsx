'use client';

/**
 * @file install-tabs.tsx
 * @description Package-manager tabs for the shadcn install command of a
 * registry item. Renders `npx shadcn@latest add @localmode/ui/<name>` with the
 * per-PM executor (pnpm dlx / npx / yarn dlx / bunx). Built on Fumadocs Tabs +
 * the shared code-block styling (the docs-site equivalent of Remark NPM).
 */
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';

/** Props for {@link InstallTabs}. */
interface InstallTabsProps {
  /** Registry item name under the ui/ scheme, e.g. `ui/local-first/device-badge`. */
  name: string;
}

const RUNNERS = [
  { label: 'pnpm', cmd: (item: string) => `pnpm dlx shadcn@latest add ${item}` },
  { label: 'npm', cmd: (item: string) => `npx shadcn@latest add ${item}` },
  { label: 'yarn', cmd: (item: string) => `yarn dlx shadcn@latest add ${item}` },
  { label: 'bun', cmd: (item: string) => `bunx --bun shadcn@latest add ${item}` },
] as const;

/** Render the install command as package-manager tabs. */
export function InstallTabs({ name }: InstallTabsProps) {
  const item = `@localmode/${name}`;
  return (
    <Tabs items={RUNNERS.map((r) => r.label)} groupId="package-manager" persist>
      {RUNNERS.map((r) => (
        <Tab key={r.label} value={r.label}>
          <DynamicCodeBlock lang="bash" code={r.cmd(item)} />
        </Tab>
      ))}
    </Tabs>
  );
}
