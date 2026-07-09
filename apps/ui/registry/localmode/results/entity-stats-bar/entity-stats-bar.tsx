'use client';

import { cn } from '@/lib/utils';

/**
 * A detected entity, matching the shape returned by `useExtractEntities`
 * (`@localmode/react`) — only `type` is required for counting.
 */
export interface DetectedEntity {
  /** The entity text as it appears in the input. */
  text?: string;
  /** Entity type (e.g. 'PER', 'LOC', 'ORG', 'MISC'). */
  type: string;
  /** Confidence score (0–1). */
  score?: number;
}

/** Display config for one entity type. */
export interface EntityTypeConfig {
  /** Human-readable label (e.g. "Person"). Falls back to the type key. */
  label?: string;
  /** Dot color (any CSS color). */
  color: string;
}

/** A registry mapping entity-type keys → display config. */
export type EntityTypeRegistry = Record<string, EntityTypeConfig>;

/** Props for {@link EntityStatsBar}. */
export interface EntityStatsBarProps {
  /**
   * The detected entities to count. Either pass `entities` (counts are computed
   * internally) or a pre-computed `counts` map.
   */
  entities?: DetectedEntity[];
  /** Pre-computed per-type counts, as an alternative to `entities`. */
  counts?: Record<string, number>;
  /**
   * Per-type display config. Types absent from the registry still render with
   * a default color.
   * @default the built-in PER/LOC/ORG/MISC registry
   */
  registry?: EntityTypeRegistry;
  /**
   * Whether to hide types with a zero count.
   * @default true
   */
  hideEmpty?: boolean;
  /**
   * Singular noun for the counted items, shown before the breakdown (e.g.
   * "6 entities"). Non-NER consumers pass their own noun — e.g. `"result"`
   * renders "6 results" / "1 result". The plural is derived automatically.
   * @default "entity"
   */
  itemNoun?: string;
  /**
   * Plural form of {@link itemNoun}. Defaults to a regular English
   * pluralization of `itemNoun` ("entity" → "entities", "result" → "results");
   * pass this only for irregular plurals.
   * @default pluralize(itemNoun)
   */
  itemNounPlural?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Regular English pluralization covering the common noun endings. */
function pluralize(noun: string): string {
  if (/[^aeiou]y$/i.test(noun)) return noun.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

/** Default entity-type registry — colors wired to CSS variables. */
const DEFAULT_REGISTRY: EntityTypeRegistry = {
  PER: { label: 'Person', color: 'var(--color-sky-500, #0ea5e9)' },
  LOC: { label: 'Location', color: 'var(--color-emerald-500, #10b981)' },
  ORG: { label: 'Organization', color: 'var(--color-violet-500, #8b5cf6)' },
  MISC: { label: 'Misc', color: 'var(--color-amber-500, #f59e0b)' },
};

const FALLBACK_COLOR = 'var(--color-muted-foreground, #6b7280)';

/** Tally entities by type. Exported for reuse. */
export function countByType(entities: DetectedEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.type] = (counts[entity.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * A horizontal stats bar showing the total detected-entity count plus a
 * per-type breakdown badge (colored dot + count + label) for each entity type.
 * Counts are computed internally from a `DetectedEntity[]` (or pass a
 * pre-computed `counts` map) against a color/label registry.
 *
 * @example
 * ```tsx
 * const { entities } = useExtractEntities({ model });
 * <EntityStatsBar entities={entities ?? []} />
 * ```
 */
export function EntityStatsBar({
  entities,
  counts: countsProp,
  registry = DEFAULT_REGISTRY,
  hideEmpty = true,
  itemNoun = 'entity',
  itemNounPlural = pluralize(itemNoun),
  className,
}: EntityStatsBarProps) {
  const counts = countsProp ?? countByType(entities ?? []);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // Union of registry keys and any types found in the data.
  const types = Array.from(
    new Set([...Object.keys(registry), ...Object.keys(counts)]),
  );

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5 text-card-foreground',
        className,
      )}
    >
      <span className="text-sm font-semibold">
        {total} {total === 1 ? itemNoun : itemNounPlural}
      </span>
      <span
        className="hidden h-4 w-px bg-border sm:block"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {types.map((type) => {
          const count = counts[type] ?? 0;
          if (hideEmpty && count === 0) return null;
          const config = registry[type];
          return (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 text-xs"
              title={config?.label ?? type}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: config?.color ?? FALLBACK_COLOR }}
                aria-hidden="true"
              />
              <span className="font-medium tabular-nums">{count}</span>
              <span className="text-muted-foreground">
                {config?.label ?? type}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
