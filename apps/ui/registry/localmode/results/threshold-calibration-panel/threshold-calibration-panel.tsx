'use client';

import { cn } from '@/lib/utils';

/**
 * Similarity-distribution statistics for a calibration run — mirrors the
 * `distribution` field of `@localmode/react`'s `useCalibrateThreshold` result.
 */
export interface CalibrationDistribution {
  /** Arithmetic mean of all pairwise similarity scores. */
  mean: number;
  /** Median of all pairwise similarity scores. */
  median: number;
  /** Population standard deviation of the pairwise similarity scores. */
  stdDev: number;
  /** Minimum pairwise similarity observed. */
  min: number;
  /** Maximum pairwise similarity observed. */
  max: number;
  /** Number of pairwise comparisons — `C(sampleSize, 2)`. */
  count: number;
}

/**
 * A completed threshold-calibration result. Locally defined so the panel stays
 * portable: it mirrors the `ThresholdCalibration` shape produced by
 * `useCalibrateThreshold` / `calibrateThreshold` without importing from
 * `@localmode/*`.
 */
export interface CalibrationResult {
  /** The empirically calibrated similarity threshold. */
  threshold: number;
  /** The percentile the threshold was selected at (echoes the input). */
  percentile: number;
  /** Number of corpus samples actually used (may be capped below the corpus size). */
  sampleSize: number;
  /** The embedding model ID used for calibration. */
  modelId: string;
  /** The distance function the distribution was computed over. */
  distanceFunction: 'cosine' | 'euclidean' | 'dot';
  /** Statistics of the pairwise similarity distribution. */
  distribution: CalibrationDistribution;
}

/** A reference preset threshold for one model. */
export interface ThresholdPreset {
  /** The model ID the preset applies to. */
  modelId: string;
  /** The preset similarity threshold. */
  threshold: number;
}

/** Props for {@link ThresholdCalibrationPanel}. */
export interface ThresholdCalibrationPanelProps {
  /**
   * The calibration result to render, or `null` for the empty / pre-run state.
   * Recommended producer: `useCalibrateThreshold` from `@localmode/react` — but
   * any backend that returns this shape works.
   */
  calibration: CalibrationResult | null;
  /**
   * The selected model's preset threshold, rendered side-by-side with the
   * calibrated value. Omit to show an explicit "no preset" state.
   */
  presetThreshold?: number;
  /**
   * A reference list of known-good preset thresholds. The entry whose `modelId`
   * matches `calibration.modelId` is highlighted.
   */
  presets?: ThresholdPreset[];
  /** Whether a calibration run is in progress (renders the busy state). */
  isCalibrating?: boolean;
  /** Fired when the user requests a (re)calibration from the empty/idle state. */
  onCalibrate?: () => void;
  /** Fired when the user cancels an in-flight calibration. */
  onCancel?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Format a 0–1 (or raw) similarity value to a fixed 4-decimal string. */
function fmt(value: number, decimals = 4) {
  return value.toFixed(decimals);
}

/** Human-readable label for a distance function. */
const DISTANCE_LABELS: Record<CalibrationResult['distanceFunction'], string> = {
  cosine: 'Cosine',
  euclidean: 'Euclidean',
  dot: 'Dot product',
};

/** A labeled metadata chip. */
function MetaChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

/** A large threshold value with a caption. */
function ThresholdValue({
  caption,
  value,
  accent,
  testId,
}: {
  caption: string;
  value: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-lg border p-4 text-center',
        accent ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {caption}
      </span>
      <span className={cn('font-mono text-2xl font-semibold tabular-nums', accent && 'text-primary')}>
        {value}
      </span>
    </div>
  );
}

/**
 * A presentational panel for similarity-threshold calibration results. Renders
 * the calibrated threshold against a preset value side-by-side, calibration
 * metadata (percentile, sample size, model, distance function), the pairwise
 * similarity distribution statistics, and a reference list of known-good preset
 * thresholds with the active model highlighted. Loading and empty states carry
 * optional calibrate / cancel affordances.
 *
 * Presentational and hook-driven: it renders the props you pass and emits the
 * optional callbacks; it owns no orchestration state. Styled with shadcn/ui
 * CSS-variable tokens and `cn()` — no daisyUI, no chart library.
 *
 * Backend-agnostic — works with any producer of the {@link CalibrationResult}
 * shape. Recommended LocalMode hook: `useCalibrateThreshold` from
 * `@localmode/react` (pair `presetThreshold` with `getDefaultThreshold(modelId)`
 * and `presets` with `MODEL_THRESHOLD_PRESETS`).
 *
 * @example
 * ```tsx
 * const { calibration, isCalibrating, calibrate, cancel } = useCalibrateThreshold({ model });
 * <ThresholdCalibrationPanel
 *   calibration={calibration}
 *   presetThreshold={getDefaultThreshold(model.modelId)}
 *   presets={Object.entries(MODEL_THRESHOLD_PRESETS).map(([modelId, threshold]) => ({ modelId, threshold }))}
 *   isCalibrating={isCalibrating}
 *   onCalibrate={() => calibrate(corpus)}
 *   onCancel={cancel}
 * />
 * ```
 */
export function ThresholdCalibrationPanel({
  calibration,
  presetThreshold,
  presets,
  isCalibrating = false,
  onCalibrate,
  onCancel,
  className,
}: ThresholdCalibrationPanelProps) {
  // ── Busy state ──
  if (isCalibrating) {
    return (
      <div
        data-testid="threshold-calibration-panel"
        data-state="calibrating"
        className={cn('rounded-lg border border-border bg-card p-6', className)}
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">Calibrating threshold…</p>
          <p className="text-xs text-muted-foreground">
            Embedding the corpus and analyzing the pairwise similarity distribution.
          </p>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="mt-1 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (!calibration) {
    return (
      <div
        data-testid="threshold-calibration-panel"
        data-state="empty"
        className={cn('rounded-lg border border-dashed border-border bg-card p-6', className)}
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No calibration yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Calibrate a similarity threshold from your corpus to compare it against the model&apos;s
            preset default.
          </p>
          {onCalibrate && (
            <button
              type="button"
              onClick={onCalibrate}
              className="mt-1 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Calibrate
            </button>
          )}
        </div>
      </div>
    );
  }

  const { threshold, percentile, sampleSize, modelId, distanceFunction, distribution } = calibration;
  const hasPreset = presetThreshold !== undefined;
  const delta = hasPreset ? threshold - presetThreshold : 0;

  const distributionRows: Array<[string, number]> = [
    ['Mean', distribution.mean],
    ['Median', distribution.median],
    ['Std. deviation', distribution.stdDev],
    ['Minimum', distribution.min],
    ['Maximum', distribution.max],
  ];

  return (
    <div
      data-testid="threshold-calibration-panel"
      data-state="result"
      data-threshold={fmt(threshold)}
      data-model-id={modelId}
      className={cn('@container flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4', className)}
    >
      {/* ── Calibrated vs. preset comparison ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Calibrated threshold</h3>
        <div className="flex flex-col gap-2 @sm:flex-row">
          <ThresholdValue
            caption="Calibrated"
            value={fmt(threshold)}
            accent
            testId="threshold-calibration-panel-calibrated"
          />
          {hasPreset ? (
            <ThresholdValue
              caption="Model preset"
              value={fmt(presetThreshold)}
              testId="threshold-calibration-panel-preset"
            />
          ) : (
            <div
              data-testid="threshold-calibration-panel-no-preset"
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center"
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Model preset
              </span>
              <span className="text-xs text-muted-foreground">No preset for this model</span>
            </div>
          )}
        </div>
        {hasPreset && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Calibrated value is{' '}
            <span
              className={cn(
                'font-medium',
                delta > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-sky-600 dark:text-sky-400',
              )}
            >
              {delta >= 0 ? '+' : ''}
              {fmt(delta)}
            </span>{' '}
            vs. the preset.
          </p>
        )}
      </div>

      {/* ── Metadata chips ── */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Calibration metadata
        </h3>
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <MetaChip label="Percentile" value={`${percentile}%`} />
          <MetaChip label="Sample size" value={sampleSize} />
          <MetaChip label="Distance" value={DISTANCE_LABELS[distanceFunction]} />
          <MetaChip label="Pairs" value={distribution.count} />
        </div>
        <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" title={modelId}>
          {modelId}
        </p>
      </div>

      {/* ── Distribution statistics ── */}
      <div data-testid="threshold-calibration-panel-distribution">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Similarity distribution
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 @xl:grid-cols-5">
          {distributionRows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xs tabular-nums text-foreground">{fmt(value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Preset reference table ── */}
      {presets && presets.length > 0 && (
        <div data-testid="threshold-calibration-panel-presets">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preset thresholds reference
          </h3>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {presets.map((preset) => {
              const active = preset.modelId === modelId;
              return (
                <li
                  key={preset.modelId}
                  data-active={active}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-1.5 text-xs',
                    active && 'bg-primary/10',
                  )}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-mono',
                      active ? 'font-medium text-primary' : 'text-muted-foreground',
                    )}
                    title={preset.modelId}
                  >
                    {preset.modelId}
                  </span>
                  <span className={cn('font-mono tabular-nums', active && 'font-semibold text-primary')}>
                    {fmt(preset.threshold, 2)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
