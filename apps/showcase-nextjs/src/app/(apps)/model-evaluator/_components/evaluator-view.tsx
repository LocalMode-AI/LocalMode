/**
 * @file evaluator-view.tsx
 * @description Main view component for the model evaluator application.
 * Two-tab layout: Evaluate (classification metrics + confusion matrix) and
 * Calibrate (threshold calibration + preset comparison).
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ArrowLeft,
  Play,
  Square,
  Download,
  Target,
  Activity,
  Gauge,
  Sparkles,
  Crosshair,
} from 'lucide-react';
import { MODEL_THRESHOLD_PRESETS } from '@localmode/core';
import { Button, IconBox, TabBar, StatCard, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useEvaluator, useCalibrator } from '../_hooks';
import {
  cn,
  formatScore,
  formatDuration,
  formatDecimal,
  buildExportPayload,
  downloadJson,
  getCellColor,
} from '../_lib/utils';
import {
  TABS,
  TAB_LABELS,
  CLASSIFIER_MODELS,
  EMBEDDING_MODELS,
  SAMPLE_DATASETS,
  SAMPLE_CORPORA,
} from '../_lib/constants';
import type { EvaluatorTab, EvaluationResults, ModelOption, SampleDataset, SampleCorpus } from '../_lib/types';
import type { ConfusionMatrix } from '@localmode/core';

// ============================================================================
// Sub-components: Model & Dataset Selectors
// ============================================================================

/** Radio-style model selector */
function ModelSelector({
  models,
  selectedId,
  onSelect,
  disabled,
}: {
  models: ModelOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-poster-text-main">Model</label>
      <div className="flex flex-col gap-2">
        {models.map((model) => (
          <label
            key={model.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
              selectedId === model.id
                ? 'border-poster-accent-purple/50 bg-poster-accent-purple/5'
                : 'border-poster-border/30 bg-poster-surface/30 hover:border-poster-border/50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input
              type="radio"
              name="model"
              className="radio radio-sm radio-primary"
              checked={selectedId === model.id}
              onChange={() => onSelect(model.id)}
              disabled={disabled}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-poster-text-main">{model.name}</span>
                <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub">
                  {model.size}
                </span>
              </div>
              <p className="text-xs text-poster-text-sub mt-0.5">{model.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Radio-style dataset selector */
function DatasetSelector({
  datasets,
  selectedId,
  onSelect,
  disabled,
}: {
  datasets: SampleDataset[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-poster-text-main">Dataset</label>
      <div className="flex flex-col gap-2">
        {datasets.map((dataset) => (
          <label
            key={dataset.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
              selectedId === dataset.id
                ? 'border-poster-accent-purple/50 bg-poster-accent-purple/5'
                : 'border-poster-border/30 bg-poster-surface/30 hover:border-poster-border/50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input
              type="radio"
              name="dataset"
              className="radio radio-sm radio-primary"
              checked={selectedId === dataset.id}
              onChange={() => onSelect(dataset.id)}
              disabled={disabled}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-poster-text-main">{dataset.name}</span>
                <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub">
                  {dataset.entries.length} items
                </span>
              </div>
              <p className="text-xs text-poster-text-sub mt-0.5">{dataset.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Radio-style corpus selector */
function CorpusSelector({
  corpora,
  selectedId,
  onSelect,
  disabled,
}: {
  corpora: SampleCorpus[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-poster-text-main">Corpus</label>
      <div className="flex flex-col gap-2">
        {corpora.map((corpus) => (
          <label
            key={corpus.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
              selectedId === corpus.id
                ? 'border-poster-accent-purple/50 bg-poster-accent-purple/5'
                : 'border-poster-border/30 bg-poster-surface/30 hover:border-poster-border/50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input
              type="radio"
              name="corpus"
              className="radio radio-sm radio-primary"
              checked={selectedId === corpus.id}
              onChange={() => onSelect(corpus.id)}
              disabled={disabled}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-poster-text-main">{corpus.name}</span>
                <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub">
                  {corpus.texts.length} texts
                </span>
              </div>
              <p className="text-xs text-poster-text-sub mt-0.5">{corpus.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components: Results Displays
// ============================================================================

/** Metrics dashboard with four stat cards */
function MetricsDashboard({ results }: { results: EvaluationResults }) {
  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-poster-accent-purple" />
        <h3 className="text-sm font-semibold text-poster-text-main">Evaluation Results</h3>
        <span className="text-xs text-poster-text-sub">
          Completed in {formatDuration(results.durationMs)}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Accuracy" value={formatScore(results.metrics.accuracy)} description="Overall correctness" />
        <StatCard label="Precision" value={formatScore(results.metrics.precision)} description="Macro-averaged" />
        <StatCard label="Recall" value={formatScore(results.metrics.recall)} description="Macro-averaged" />
        <StatCard label="F1 Score" value={formatScore(results.metrics.f1)} description="Macro-averaged" />
      </div>
    </div>
  );
}

/** Confusion matrix rendered as a colored grid */
function ConfusionMatrixGrid({ matrix }: { matrix: ConfusionMatrix }) {
  const { labels, matrix: grid } = matrix;

  // Find max count for intensity scaling
  let maxCount = 0;
  for (const row of grid) {
    for (const count of row) {
      if (count > maxCount) maxCount = count;
    }
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-poster-accent-purple" />
        <h3 className="text-sm font-semibold text-poster-text-main">Confusion Matrix</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-xs text-poster-text-sub font-normal" />
              {labels.map((label) => (
                <th
                  key={label}
                  className="p-2 text-xs text-poster-text-sub font-medium text-center min-w-[80px]"
                >
                  Pred: {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((trueLabel, rowIdx) => (
              <tr key={trueLabel}>
                <td className="p-2 text-xs text-poster-text-sub font-medium whitespace-nowrap">
                  True: {trueLabel}
                </td>
                {labels.map((predLabel, colIdx) => {
                  const count = grid[rowIdx][colIdx];
                  const isDiagonal = rowIdx === colIdx;
                  const cellColor = getCellColor(count, maxCount, isDiagonal);

                  return (
                    <td
                      key={predLabel}
                      className={cn(
                        'p-2 text-center text-sm font-semibold rounded-lg border border-poster-border/10',
                        cellColor,
                        isDiagonal ? 'text-success' : count > 0 ? 'text-error' : 'text-poster-text-sub/50'
                      )}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-poster-text-sub">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-success/60 inline-block" /> Correct
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-error/60 inline-block" /> Incorrect
        </span>
      </div>
    </div>
  );
}

/** Calibration result display */
function CalibrationResults({
  calibration,
  presetThreshold,
}: {
  calibration: { threshold: number; percentile: number; sampleSize: number; modelId: string; distanceFunction: string; distribution: { mean: number; median: number; stdDev: number; min: number; max: number; count: number } };
  presetThreshold: number | undefined;
}) {
  const { threshold, percentile, sampleSize, modelId, distanceFunction, distribution } = calibration;

  // Get a few model presets for reference
  const presetEntries = Object.entries(MODEL_THRESHOLD_PRESETS).slice(0, 5);

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Calibrated threshold */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Crosshair className="w-4 h-4 text-poster-accent-purple" />
          <h3 className="text-sm font-semibold text-poster-text-main">Calibrated Threshold</h3>
        </div>
        <div className="flex items-center gap-6 p-4 rounded-xl bg-poster-surface/50 border border-poster-border/30">
          <div className="text-center">
            <div className="text-3xl font-bold text-poster-accent-purple">{formatDecimal(threshold)}</div>
            <div className="text-xs text-poster-text-sub mt-1">Calibrated</div>
          </div>
          {presetThreshold !== undefined && (
            <>
              <div className="h-10 w-px bg-poster-border/30" />
              <div className="text-center">
                <div className="text-3xl font-bold text-poster-text-main">{formatDecimal(presetThreshold)}</div>
                <div className="text-xs text-poster-text-sub mt-1">Preset</div>
              </div>
            </>
          )}
          {presetThreshold === undefined && (
            <>
              <div className="h-10 w-px bg-poster-border/30" />
              <div className="text-center">
                <div className="text-lg text-poster-text-sub italic">No preset available</div>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-poster-text-sub">
          <span>Percentile: {percentile}th</span>
          <span>Sample size: {sampleSize}</span>
          <span>Model: {modelId}</span>
          <span>Distance: {distanceFunction}</span>
        </div>
      </div>

      {/* Distribution statistics */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-poster-accent-purple" />
          <h3 className="text-sm font-semibold text-poster-text-main">Distribution Statistics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm bg-poster-surface/30 border border-poster-border/20 rounded-xl">
            <thead>
              <tr>
                <th className="text-poster-text-sub text-xs">Statistic</th>
                <th className="text-poster-text-sub text-xs text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-poster-text-main text-sm">Mean</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(distribution.mean)}</td>
              </tr>
              <tr>
                <td className="text-poster-text-main text-sm">Median</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(distribution.median)}</td>
              </tr>
              <tr>
                <td className="text-poster-text-main text-sm">Std Dev</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(distribution.stdDev)}</td>
              </tr>
              <tr>
                <td className="text-poster-text-main text-sm">Min</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(distribution.min)}</td>
              </tr>
              <tr>
                <td className="text-poster-text-main text-sm">Max</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(distribution.max)}</td>
              </tr>
              <tr>
                <td className="text-poster-text-main text-sm">Pair Count</td>
                <td className="text-poster-text-main text-sm text-right font-mono">{distribution.count}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Preset thresholds reference */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-poster-accent-purple" />
          <h3 className="text-sm font-semibold text-poster-text-main">Preset Thresholds Reference</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm bg-poster-surface/30 border border-poster-border/20 rounded-xl">
            <thead>
              <tr>
                <th className="text-poster-text-sub text-xs">Model</th>
                <th className="text-poster-text-sub text-xs text-right">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {presetEntries.map(([presetModelId, presetValue]) => (
                <tr key={presetModelId}>
                  <td
                    className={cn(
                      'text-sm',
                      presetModelId === modelId ? 'text-poster-accent-purple font-medium' : 'text-poster-text-main'
                    )}
                  >
                    {presetModelId}
                    {presetModelId === modelId && (
                      <span className="badge badge-xs badge-primary ml-2">selected</span>
                    )}
                  </td>
                  <td className="text-poster-text-main text-sm text-right font-mono">{formatDecimal(presetValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main View
// ============================================================================

/** Main evaluator view with tab navigation */
export function EvaluatorView() {
  const [activeTab, setActiveTab] = useState<EvaluatorTab>('evaluate');

  const evaluator = useEvaluator();
  const calibrator = useCalibrator();

  const selectedClassifierModel = CLASSIFIER_MODELS.find((m) => m.id === evaluator.selectedModelId);

  const handleExport = () => {
    if (!evaluator.results) return;
    const payload = buildExportPayload(evaluator.results);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `evaluation-${evaluator.results.modelId.replace(/\//g, '-')}-${timestamp}.json`;
    downloadJson(payload, filename);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <IconBox size="sm" variant="primary" className="bg-poster-accent-purple/10 text-poster-accent-purple ring-1 ring-poster-accent-purple/30">
              <BarChart3 className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Model Evaluator</h1>
              <p className="text-xs text-poster-text-sub">Evaluate classification models & calibrate thresholds</p>
            </div>
            {selectedClassifierModel && (
              <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
                {selectedClassifierModel.name}
                <span className="text-poster-accent-purple">&middot;</span>
                {selectedClassifierModel.size}
              </span>
            )}
          </div>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-purple/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Tab bar */}
            <TabBar
              tabs={TABS}
              activeTab={activeTab}
              labels={TAB_LABELS}
              onTabChange={setActiveTab}
            />

            {/* Evaluate tab */}
            {activeTab === 'evaluate' && (
              <ErrorBoundary>
                <div className="flex flex-col gap-6">
                  {/* Error */}
                  {evaluator.error && (
                    <ErrorAlert
                      message={evaluator.error.message}
                      onDismiss={evaluator.clearError}
                      onRetry={evaluator.runEvaluation}
                    />
                  )}

                  {/* Model selection */}
                  <ModelSelector
                    models={CLASSIFIER_MODELS}
                    selectedId={evaluator.selectedModelId}
                    onSelect={evaluator.setSelectedModelId}
                    disabled={evaluator.isEvaluating}
                  />

                  {/* Dataset selection */}
                  <DatasetSelector
                    datasets={SAMPLE_DATASETS}
                    selectedId={evaluator.selectedDatasetId}
                    onSelect={evaluator.setSelectedDatasetId}
                    disabled={evaluator.isEvaluating}
                  />

                  {/* Run / Cancel button */}
                  <div className="flex items-center gap-3">
                    {evaluator.isEvaluating ? (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={evaluator.cancel}
                        className="hover:text-error transition-colors duration-200"
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        onClick={evaluator.runEvaluation}
                        className="bg-poster-accent-purple hover:bg-poster-accent-purple/80 border-poster-accent-purple hover:border-poster-accent-purple/80 transition-all duration-300 hover:shadow-lg hover:shadow-poster-accent-purple/20 cursor-pointer"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Run Evaluation
                      </Button>
                    )}
                  </div>

                  {/* Progress bar */}
                  {evaluator.isEvaluating && evaluator.progress && (
                    <div className="flex flex-col gap-2 animate-fadeIn">
                      <div className="flex items-center justify-between text-xs text-poster-text-sub">
                        <span>Evaluating...</span>
                        <span>
                          {evaluator.progress.completed} / {evaluator.progress.total}
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full overflow-hidden bg-poster-surface">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-poster-accent-purple via-poster-accent-teal to-poster-accent-purple bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-500"
                          style={{
                            width: `${Math.max(
                              (evaluator.progress.completed / evaluator.progress.total) * 100,
                              3
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Results dashboard */}
                  {evaluator.results && (
                    <>
                      <MetricsDashboard results={evaluator.results} />
                      <ConfusionMatrixGrid matrix={evaluator.results.confusionMatrix} />

                      {/* Export button */}
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleExport}
                          className="hover:text-poster-accent-purple transition-colors duration-200"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export JSON
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={evaluator.clearResults}
                          className="hover:text-error transition-colors duration-200"
                        >
                          Clear Results
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </ErrorBoundary>
            )}

            {/* Calibrate tab */}
            {activeTab === 'calibrate' && (
              <ErrorBoundary>
                <div className="flex flex-col gap-6">
                  {/* Error */}
                  {calibrator.error && (
                    <ErrorAlert
                      message={calibrator.error.message}
                      onDismiss={calibrator.clearError}
                      onRetry={calibrator.runCalibration}
                    />
                  )}

                  {/* Model selection */}
                  <ModelSelector
                    models={EMBEDDING_MODELS}
                    selectedId={calibrator.selectedModelId}
                    onSelect={calibrator.setSelectedModelId}
                    disabled={calibrator.isCalibrating}
                  />

                  {/* Corpus selection */}
                  <CorpusSelector
                    corpora={SAMPLE_CORPORA}
                    selectedId={calibrator.selectedCorpusId}
                    onSelect={calibrator.setSelectedCorpusId}
                    disabled={calibrator.isCalibrating}
                  />

                  {/* Calibrate / Cancel button */}
                  <div className="flex items-center gap-3">
                    {calibrator.isCalibrating ? (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={calibrator.cancel}
                        className="hover:text-error transition-colors duration-200"
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        onClick={calibrator.runCalibration}
                        className="bg-poster-accent-purple hover:bg-poster-accent-purple/80 border-poster-accent-purple hover:border-poster-accent-purple/80 transition-all duration-300 hover:shadow-lg hover:shadow-poster-accent-purple/20 cursor-pointer"
                      >
                        <Crosshair className="w-4 h-4 mr-2" />
                        Calibrate
                      </Button>
                    )}
                  </div>

                  {/* Loading indicator */}
                  {calibrator.isCalibrating && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-poster-surface/50 border border-poster-border/30 animate-fadeIn">
                      <Spinner size="md" className="text-poster-accent-purple" />
                      <div>
                        <div className="text-sm font-medium text-poster-text-main">Calibrating threshold...</div>
                        <div className="text-xs text-poster-text-sub">Embedding corpus and computing pairwise similarities</div>
                      </div>
                    </div>
                  )}

                  {/* Calibration results */}
                  {calibrator.calibration && (
                    <CalibrationResults
                      calibration={calibrator.calibration}
                      presetThreshold={calibrator.presetThreshold}
                    />
                  )}
                </div>
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
