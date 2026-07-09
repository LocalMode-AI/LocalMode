/**
 * @file llm-markdown.ts
 * @description Expands the registry-specific MDX helper tags into real markdown
 * for the "Copy page" / "View as Markdown" (`/api/md/<slug>`) and `llms*.txt`
 * surfaces. Fumadocs' `getText('processed')` leaves custom JSX (ComponentPreview,
 * AutoTypeTable, InstallTabs, OpenInV0) as bare tags, so an agent copying a page
 * would miss the component source and the props API. This closes those holes:
 *
 *   1. <ComponentPreview name="…"/> → a fenced ```tsx block of the demo source
 *      (when `expandSource`), else a compact pointer to the registry JSON.
 *   2. <AutoTypeTable path="…" name="…"/> → a markdown props table.
 *   3. <InstallTabs name="…"/> → a plain `npx shadcn@latest add …` command,
 *      and <OpenInV0/> (plus the bare <ComponentsIndex/>) are dropped.
 *
 * Server-only: reads registry sources from disk and runs the TS type resolver.
 */
import { getOwnPropDocs, type PropDoc } from '@/lib/type-table-data';
import { readDemoSource } from '@/lib/registry-source';
import { installCommand, registryItemUrl } from '@/lib/registry';

/** Options for {@link expandDocMarkdown}. */
export interface ExpandOptions {
  /**
   * When true, inline the full component demo source for each `<ComponentPreview>`
   * (the per-page "Copy page" surface). When false, emit a compact pointer to the
   * registry JSON instead (keeps `llms-full.txt` lean). @default true
   */
  expandSource?: boolean;
}

/** Parse `name="x" path="y"` attributes out of a matched self-closing tag body. */
function parseAttrs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Replace every match of `regex` in `str` with the result of an async `fn`. */
async function asyncReplace(
  str: string,
  regex: RegExp,
  fn: (match: RegExpMatchArray) => Promise<string> | string,
): Promise<string> {
  const matches = [...str.matchAll(regex)];
  if (matches.length === 0) return str;
  const replacements = await Promise.all(matches.map((m) => fn(m)));
  let out = '';
  let last = 0;
  matches.forEach((m, i) => {
    out += str.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + str.slice(last);
}

/** Collapse whitespace/newlines and escape table-breaking pipes for a table cell. */
function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Render resolved prop docs as GitHub-flavored markdown tables. */
function propsTable(docs: PropDoc[]): string {
  if (docs.length === 0) return 'This component exposes no configurable props.';
  return docs
    .map((doc) => {
      const rows = doc.entries
        .map((e) => {
          const type = `\`${cell(e.type)}\``;
          const def = e.default ? `\`${cell(e.default)}\`` : '—';
          let desc = cell(e.description ?? '');
          if (e.deprecated) desc = `**Deprecated.** ${desc}`.trim();
          if (e.required) desc = `**Required.** ${desc}`.trim();
          return `| \`${e.name}\` | ${type} | ${def} | ${desc || '—'} |`;
        })
        .join('\n');
      const label = doc.name.replace(/Props$/, '');
      return `**${label}**\n\n| Prop | Type | Default | Description |\n| --- | --- | --- | --- |\n${rows}`;
    })
    .join('\n\n');
}

/**
 * Expand the registry MDX helper tags in a processed-markdown string. Idempotent
 * for tag-free input. Async (reads registry sources + resolves TS types).
 */
export async function expandDocMarkdown(
  markdown: string,
  { expandSource = true }: ExpandOptions = {},
): Promise<string> {
  let out = markdown;

  // 1. <ComponentPreview name="…" …/> → fenced source (or a registry pointer).
  out = await asyncReplace(out, /<ComponentPreview\b([^>]*?)\/>/g, (m) => {
    const { name } = parseAttrs(m[1]);
    if (!name) return '';
    const cmd = installCommand(name);
    if (!expandSource) {
      return `Install: \`${cmd}\`\n\nFull source: ${registryItemUrl(name)}`;
    }
    const src = readDemoSource(name);
    if (!src) return `Install: \`${cmd}\`\n\nFull source: ${registryItemUrl(name)}`;
    return `\`\`\`tsx\n${src.trim()}\n\`\`\``;
  });

  // 2. <AutoTypeTable path="…" name="…"/> → markdown props table.
  out = await asyncReplace(out, /<AutoTypeTable\b([^>]*?)\/>/g, async (m) => {
    const { path: sourcePath, name } = parseAttrs(m[1]);
    if (!sourcePath || !name) return '';
    try {
      return propsTable(await getOwnPropDocs({ path: sourcePath, name }));
    } catch {
      return '';
    }
  });

  // 3a. <InstallTabs name="…"/> → a plain shadcn add command block.
  out = await asyncReplace(out, /<InstallTabs\b([^>]*?)\/>/g, (m) => {
    const { name } = parseAttrs(m[1]);
    return name ? `\`\`\`bash\n${installCommand(name)}\n\`\`\`` : '';
  });

  // 3b. Drop UI-only affordances that carry no markdown value.
  out = out.replace(/<OpenInV0\b[^>]*?\/>/g, '');
  out = out.replace(/<ComponentsIndex\b[^>]*?\/>/g, '');

  // Tidy the blank lines left by removed/replaced block tags.
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
