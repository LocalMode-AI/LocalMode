'use client';

import { cn } from '@/lib/utils';

/** A single selectable mode. */
export interface ModeItem<TId extends string = string> {
  /** Stable identifier emitted via `onSelect`. */
  id: TId;
  /** Visible label. */
  label: string;
}

/** Props for {@link SegmentedModePicker}. */
export interface SegmentedModePickerProps<TId extends string = string> {
  /** The 2–4 mutually-exclusive modes to render. */
  items: ModeItem<TId>[];
  /** Currently selected mode id. */
  selectedId: TId;
  /** Fired with the selected mode id when the user activates a mode. */
  onSelect: (id: TId) => void;
  /**
   * Classes applied to the active segment. Defaults to a raised segmented-control
   * look (`bg-background text-foreground shadow-sm`) that reads clearly on the
   * muted track in both light and dark themes.
   * @default "bg-background text-foreground shadow-sm"
   */
  accent?: string;
  /** Accessible label for the group. */
  'aria-label'?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const DEFAULT_ACCENT = 'bg-background text-foreground shadow-sm';

/**
 * A pill toggle for 2–4 mutually-exclusive named modes (OCR content-type,
 * summary length, translation formality, …). Renders as a classic segmented
 * control: a muted track with the active segment raised on a `bg-background`
 * chip. Selection is fully controlled: pass `selectedId` and handle `onSelect`.
 *
 * Styled with shadcn/ui CSS-variable utilities so it inherits the consumer's
 * theme. For a typed tab variant with `disabledTabs` gating, use {@link TabBar}.
 *
 * @example
 * ```tsx
 * <SegmentedModePicker
 *   items={[{ id: 'short', label: 'Short' }, { id: 'long', label: 'Long' }]}
 *   selectedId={mode}
 *   onSelect={setMode}
 * />
 * ```
 */
export function SegmentedModePicker<TId extends string = string>({
  items,
  selectedId,
  onSelect,
  accent = DEFAULT_ACCENT,
  className,
  ...rest
}: SegmentedModePickerProps<TId>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={cn(
              // `max-w-full` (no `min-w-0`/`truncate`) lets a long label wrap
              // inside its segment instead of clipping; the row `flex-wrap`s
              // segments onto new lines at narrow widths so every label stays
              // fully readable.
              'max-w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active ? accent : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="block">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A single tab. */
export interface Tab<TId extends string = string> {
  /** Stable identifier emitted via `onSelect`. */
  id: TId;
  /** Visible label. */
  label: string;
}

/** Props for {@link TabBar}. */
export interface TabBarProps<TId extends string = string> {
  /** The tabs to render. */
  tabs: Tab<TId>[];
  /** Currently active tab id. */
  activeId: TId;
  /** Fired with the tab id when a (non-disabled) tab is activated. */
  onSelect: (id: TId) => void;
  /** Ids of tabs that are present but not selectable. */
  disabledTabs?: TId[];
  /** Accessible label for the tablist. */
  'aria-label'?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A typed, underline-style tab bar — the generalized variant of
 * {@link SegmentedModePicker}. Supports `disabledTabs` gating (e.g. an "Inspect"
 * tab disabled until a model is selected). Fully controlled.
 *
 * @example
 * ```tsx
 * <TabBar
 *   tabs={[{ id: 'browse', label: 'Browse' }, { id: 'inspect', label: 'Inspect' }]}
 *   activeId={tab}
 *   onSelect={setTab}
 *   disabledTabs={['inspect']}
 * />
 * ```
 */
export function TabBar<TId extends string = string>({
  tabs,
  activeId,
  onSelect,
  disabledTabs = [],
  className,
  ...rest
}: TabBarProps<TId>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn('inline-flex items-center gap-4 border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const disabled = disabledTabs.includes(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && onSelect(tab.id)}
            className={cn(
              '-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
