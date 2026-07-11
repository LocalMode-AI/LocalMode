/**
 * @file type-table-data.ts
 * @description Server-only prop-extraction core shared by the rendered props
 * table ({@link AutoTypeTable}) and the markdown pipeline (`getLLMText`). It
 * resolves a component's props from the registry TypeScript (fumadocs-
 * typescript), then drops the inherited native-element attributes so only the
 * component's OWN props survive.
 *
 * A prop interface that `extends React.ComponentProps<'X'>` inherits ~200 native
 * attributes (className, style, onClick, aria-*, data-*, …) — @types/react even
 * JSDocs the aria-* ones, so filtering by "has a description" isn't enough. We
 * instead drop only the attributes of the element(s) the interface ACTUALLY
 * extends (parsed from its `ComponentProps<'X'>` clause); a standalone interface
 * is never filtered, so real props that happen to share a native attribute name
 * (e.g. a copy button's `value`, a task's `step`) are preserved.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createGenerator } from 'fumadocs-typescript';

const generator = createGenerator();

/** Baseline native-element types (see `dom-baseline.ts`), keyed by element tag. */
const BASELINE_PATH = 'src/lib/dom-baseline.ts';
const BASELINE_BY_ELEMENT: Record<string, string> = {
  div: 'DomBaselineDiv',
  button: 'DomBaselineButton',
  span: 'DomBaselineSpan',
  ol: 'DomBaselineOl',
  textarea: 'DomBaselineTextarea',
  section: 'DomBaselineSection',
  p: 'DomBaselineP',
  li: 'DomBaselineLi',
  form: 'DomBaselineForm',
  figure: 'DomBaselineFigure',
  blockquote: 'DomBaselineBlockquote',
  a: 'DomBaselineA',
  input: 'DomBaselineInput',
};

let baselinesPromise: Promise<Map<string, Set<string>>> | null = null;

/** Per-element sets of inherited prop names (computed once, memoized). */
function getBaselines(): Promise<Map<string, Set<string>>> {
  if (!baselinesPromise) {
    baselinesPromise = (async () => {
      const map = new Map<string, Set<string>>();
      for (const [element, typeName] of Object.entries(BASELINE_BY_ELEMENT)) {
        const set = new Set<string>();
        try {
          const docs = await generator.generateTypeTable({ path: BASELINE_PATH, name: typeName });
          for (const doc of docs) for (const entry of doc.entries) set.add(entry.name);
        } catch {
          /* a missing baseline type shouldn't break the tables */
        }
        map.set(element, set);
      }
      return map;
    })();
  }
  return baselinesPromise;
}

/**
 * UI primitives → the DOM element whose native attributes they inherit, for
 * `ComponentProps<typeof X>` extends clauses (extend as new primitives are used).
 */
const PRIMITIVE_ELEMENT: Record<string, string> = {
  Button: 'button',
  Avatar: 'span',
  Badge: 'span',
};

/**
 * The native element tags a type's `extends`/alias clause pulls in (e.g. ['div']).
 * Multi-line safe: the header spans to the first `{`/`;` across newlines (an
 * `extends` on a continuation line is common and must not truncate the header).
 * Follows `ComponentProps<typeof Primitive>` via {@link PRIMITIVE_ELEMENT} and
 * `extends <LocalInterface>` (including inside `Omit<>`) by recursing in-source.
 */
function extendedElements(source: string, typeName: string, seen = new Set<string>()): string[] {
  if (seen.has(typeName)) return [];
  seen.add(typeName);
  const decl = new RegExp(`(?:interface|type)\\s+${typeName}\\b([^{;]*?)(?:\\{|;)`).exec(source);
  const header = decl?.[1] ?? '';
  const tags = new Set<string>();
  for (const m of header.matchAll(/ComponentProps(?:WithoutRef|WithRef)?<\s*'([a-z0-9]+)'\s*>/g)) {
    tags.add(m[1]);
  }
  for (const m of header.matchAll(/ComponentProps(?:WithoutRef|WithRef)?<\s*typeof\s+([A-Za-z0-9_]+)\s*>/g)) {
    const el = PRIMITIVE_ELEMENT[m[1]];
    if (el) tags.add(el);
  }
  for (const m of header.matchAll(/\b([A-Z][A-Za-z0-9_]*Props)\b/g)) {
    const local = m[1];
    if (local !== typeName && new RegExp(`(?:interface|type)\\s+${local}\\b`).test(source)) {
      for (const el of extendedElements(source, local, seen)) tags.add(el);
    }
  }
  return [...tags];
}

/**
 * Property names declared in the interface BODY of `typeName` — the component's
 * OWN props, kept even when they shadow a native attribute (e.g. a re-declared
 * `content` or `onSubmit` the header `Omit<…>`s from the base element).
 */
function bodyPropNames(source: string, typeName: string): Set<string> {
  const start = source.search(new RegExp(`(?:export\\s+)?(?:interface|type)\\s+${typeName}\\b`));
  if (start < 0) return new Set();
  const open = source.indexOf('{', start);
  if (open < 0) return new Set(); // type alias — no body
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open + 1, end < 0 ? undefined : end);
  const names = new Set<string>();
  for (const m of body.matchAll(/(?:^|\n)[ \t]*(?:readonly[ \t]+)?([A-Za-z_$][\w$]*)\??[ \t]*:/g)) {
    names.add(m[1]);
  }
  return names;
}

/** Pull a `@default` / `@defaultValue` tag's text, if present. */
function defaultFromTags(tags: ReadonlyArray<{ name: string; text: string }> | undefined) {
  const t = tags?.find((x) => x.name === 'default' || x.name === 'defaultValue');
  return t?.text?.trim() || undefined;
}

/** How to filter a type's props: inherited names to hide, body-declared names to
 *  always keep, and whether any filtering applies (standalone interfaces → none). */
interface FilterSpec {
  excluded: Set<string>;
  own: Set<string>;
  filtering: boolean;
}

/** Compute the filter spec (inherited attrs to hide + own body props to keep). */
async function filterSpecFor(sourcePath: string, typeName: string): Promise<FilterSpec> {
  let source = '';
  try {
    source = readFileSync(path.join(process.cwd(), sourcePath), 'utf8');
  } catch {
    return { excluded: new Set(), own: new Set(), filtering: false };
  }
  const elements = extendedElements(source, typeName);
  const own = bodyPropNames(source, typeName);
  if (elements.length === 0) return { excluded: new Set(), own, filtering: false }; // standalone → keep all
  const baselines = await getBaselines();
  const excluded = new Set<string>();
  for (const el of elements) for (const n of baselines.get(el) ?? []) excluded.add(n);
  return { excluded, own, filtering: true };
}

/** Keep only a component's own, distinctive props: always drop the universal
 *  `className`; always keep body-declared props (even ones that shadow a native
 *  attribute); otherwise drop inherited attrs + `aria-*`/`data-*`. */
function keepOwn<T extends { name: string }>(entries: ReadonlyArray<T>, spec: FilterSpec): T[] {
  return entries.filter((e) => {
    if (e.name === 'className') return false;
    if (spec.own.has(e.name)) return true;
    if (!spec.filtering) return true;
    return !spec.excluded.has(e.name) && !e.name.startsWith('aria-') && !e.name.startsWith('data-');
  });
}

/** Arguments identifying a type to resolve. */
export interface TypeTableRef {
  /**
   * Path to the source file containing the type, relative to the app root,
   * e.g. `registry/localmode/local-first/device-badge/device-badge.tsx`.
   */
  path: string;
  /** Exported type/interface name to render, e.g. `DeviceBadgeProps`. */
  name: string;
}

/** One resolved prop, filtered to a component's own API. */
export interface PropEntry {
  /** Prop name. */
  name: string;
  /** Simplified (readable) type signature. */
  type: string;
  /** Full type signature, only when it differs from {@link type}. */
  fullType?: string;
  /** JSDoc description. */
  description?: string;
  /** `@default` value text, if declared. */
  default?: string;
  /** Whether the prop is required. */
  required: boolean;
  /** Whether the prop is `@deprecated`. */
  deprecated: boolean;
}

/** A type's own props, grouped by the resolved doc name. */
export interface PropDoc {
  /** Resolved type/interface name. */
  name: string;
  /** The type's own props (inherited native attributes dropped). */
  entries: PropEntry[];
}

/**
 * Resolve a component's OWN props from the registry TypeScript, dropping
 * inherited native-element attributes. Docs with no surviving props are omitted,
 * so an empty array means the component exposes no configurable props.
 */
export async function getOwnPropDocs({ path: sourcePath, name }: TypeTableRef): Promise<PropDoc[]> {
  const [docs, spec] = await Promise.all([
    generator.generateTypeTable({ path: sourcePath, name }),
    filterSpecFor(sourcePath, name),
  ]);

  const result: PropDoc[] = [];
  for (const doc of docs) {
    const own = keepOwn(doc.entries, spec);
    if (own.length === 0) continue;
    result.push({
      name: doc.name,
      entries: own.map((e) => ({
        name: e.name,
        type: e.simplifiedType,
        fullType: e.type !== e.simplifiedType ? e.type : undefined,
        description: e.description || undefined,
        default: defaultFromTags(e.tags),
        required: e.required,
        deprecated: e.deprecated,
      })),
    });
  }
  return result;
}

/**
 * Whether the type at `path`/`name` exposes any own props — used by doc pages to
 * skip the whole "Props" section for pure pass-through components (e.g. a grid
 * that only takes `className`, or a boundary that only takes `children`).
 */
export async function hasOwnProps(ref: TypeTableRef): Promise<boolean> {
  return (await getOwnPropDocs(ref)).length > 0;
}
