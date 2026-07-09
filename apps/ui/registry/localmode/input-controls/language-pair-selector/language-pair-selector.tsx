'use client';

import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A language available for translation. */
export interface LanguageOption {
  /** Model/ISO code (e.g. `"en"`, `"fra_Latn"`). */
  code: string;
  /** Display name (e.g. `"English"`). */
  name: string;
  /** Optional flag emoji or short symbol shown before the name. */
  flag?: string;
}

/** Props for {@link LanguagePairSelector}. */
export interface LanguagePairSelectorProps {
  /** All selectable languages, used for both source and target. */
  languages: LanguageOption[];
  /** Currently selected source code. */
  sourceCode: string;
  /** Currently selected target code. */
  targetCode: string;
  /** Fired with the new source code. */
  onSelectSource: (code: string) => void;
  /** Fired with the new target code. */
  onSelectTarget: (code: string) => void;
  /** Fired when the swap button exchanges source and target. */
  onSwap: () => void;
  /**
   * Layout variant. `pills` renders From/To pill toggles with a swap button;
   * `compact` renders a grouped `{source} → {target}` pair of selects.
   * @default "pills"
   */
  variant?: 'pills' | 'compact';
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Render a flag + name label for a code. */
function labelFor(languages: LanguageOption[], code: string) {
  const lang = languages.find((l) => l.code === code);
  if (!lang) return code;
  return lang.flag ? `${lang.flag} ${lang.name}` : lang.name;
}

/** A row of selectable language pills. */
function PillRow({
  label,
  languages,
  selected,
  onSelect,
}: {
  label: string;
  languages: LanguageOption[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {languages.map((lang) => {
          const active = lang.code === selected;
          return (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(lang.code)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary font-medium text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {lang.flag && <span aria-hidden="true">{lang.flag}</span>}
              {lang.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Native styled select used by the compact variant. */
function NativeSelect({
  value,
  onChange,
  languages,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  languages: LanguageOption[];
  'aria-label': string;
}) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-input bg-transparent pl-3 pr-8 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {labelFor(languages, lang.code)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/**
 * A paired source/target language picker. The `pills` variant renders From/To
 * pill toggles with flag + name and a swap-languages button; the `compact`
 * variant renders a grouped `{source} → {target}` pair of selects. Fully
 * controlled via `sourceCode` / `targetCode` and the three callbacks.
 *
 * Presentational only — feed the selected codes to `@localmode/react`'s
 * `useTranslate()` (and compose with `useDetectLanguage()` to auto-fill the
 * source). Styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * <LanguagePairSelector
 *   languages={langs}
 *   sourceCode={src}
 *   targetCode={tgt}
 *   onSelectSource={setSrc}
 *   onSelectTarget={setTgt}
 *   onSwap={() => { const s = src; setSrc(tgt); setTgt(s); }}
 * />
 * ```
 */
export function LanguagePairSelector({
  languages,
  sourceCode,
  targetCode,
  onSelectSource,
  onSelectTarget,
  onSwap,
  variant = 'pills',
  className,
}: LanguagePairSelectorProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <NativeSelect
          aria-label="Source language"
          value={sourceCode}
          onChange={onSelectSource}
          languages={languages}
        />
        <button
          type="button"
          aria-label="Swap languages"
          onClick={onSwap}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <NativeSelect
          aria-label="Target language"
          value={targetCode}
          onChange={onSelectTarget}
          languages={languages}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end', className)}>
      <PillRow label="From" languages={languages} selected={sourceCode} onSelect={onSelectSource} />
      <button
        type="button"
        aria-label="Swap languages"
        onClick={onSwap}
        className="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:mb-1 sm:size-9"
      >
        <ArrowLeftRight className="size-4" />
      </button>
      <PillRow label="To" languages={languages} selected={targetCode} onSelect={onSelectTarget} />
    </div>
  );
}
