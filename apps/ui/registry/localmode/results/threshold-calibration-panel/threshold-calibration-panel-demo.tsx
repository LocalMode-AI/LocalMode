'use client';

import {
  ThresholdCalibrationPanel,
  type CalibrationResult,
  type ThresholdPreset,
} from './threshold-calibration-panel';

/** A recorded BGE-small calibration result (fixture — no model runs here). */
const CALIBRATION: CalibrationResult = {
  threshold: 0.6234,
  percentile: 90,
  sampleSize: 20,
  modelId: 'Xenova/bge-small-en-v1.5',
  distanceFunction: 'cosine',
  distribution: {
    mean: 0.4187,
    median: 0.4021,
    stdDev: 0.1103,
    min: 0.1442,
    max: 0.7318,
    count: 190,
  },
};

/** Known-good preset thresholds (mirrors `MODEL_THRESHOLD_PRESETS`). */
const PRESETS: ThresholdPreset[] = [
  { modelId: 'Xenova/bge-small-en-v1.5', threshold: 0.5 },
  { modelId: 'Xenova/bge-base-en-v1.5', threshold: 0.5 },
  { modelId: 'Xenova/all-MiniLM-L6-v2', threshold: 0.68 },
  { modelId: 'nomic-ai/nomic-embed-text-v1.5', threshold: 0.55 },
  { modelId: 'Xenova/gte-small', threshold: 0.6 },
];

/**
 * Demo for ThresholdCalibrationPanel. Renders fixture calibration data only —
 * no model download, no network. Wire `calibration` to `useCalibrateThreshold`
 * and pair `presetThreshold` with `getDefaultThreshold(modelId)` in your app.
 */
export default function ThresholdCalibrationPanelDemo() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <ThresholdCalibrationPanel
        calibration={CALIBRATION}
        presetThreshold={0.5}
        presets={PRESETS}
      />
    </div>
  );
}
