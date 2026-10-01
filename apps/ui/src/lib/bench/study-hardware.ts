/**
 * "About this computer": the hardware a paid-study participant reports on
 * /bench/run. The browser masks the GPU name and caps the RAM it discloses,
 * and never says whether the device is a laptop, so a study run asks. The
 * answers go into the run file as `environment.userReportedHardware` and are
 * published with it; a run from any other visit carries no such field.
 *
 * Everything here is pure except the localStorage helpers at the bottom,
 * which never throw. During a series the answers are stored beside the series
 * state, so every run of the series records them after its page reload.
 */

import { REPORTED_GPU_MAX_LENGTH, sanitizeReportedGpu, type UserReportedHardware } from '@localmode/bench';

export { REPORTED_GPU_MAX_LENGTH };

/** RAM buckets offered, in GB; the last one reads "128 GB or more". */
export const RAM_BUCKETS_GB: readonly number[] = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];

/** Computer types offered. */
export const CHASSIS_CHOICES: ReadonlyArray<{ value: Chassis; label: string }> = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'other', label: 'Other' },
];

export type Chassis = 'laptop' | 'desktop' | 'other';

/** The form as the participant fills it; an empty string is an unanswered control. */
export interface HardwareAnswers {
  gpu: string;
  chassis: Chassis | '';
  /** A bucket from `RAM_BUCKETS_GB` as a string, or `unsure` for "Not sure". */
  ram: string;
  otherApps: 'yes' | 'no' | '';
}

export const EMPTY_HARDWARE_ANSWERS: HardwareAnswers = { gpu: '', chassis: '', ram: '', otherApps: '' };

/** Label of each question, as the inline reason names it. Every question is required. */
const REQUIRED_LABELS = {
  gpu: 'graphics card or chip',
  chassis: 'computer type',
  ram: 'memory (RAM)',
  otherApps: 'other heavy programs running',
} as const;

/**
 * The questions still unanswered, in form order.
 *
 * @param answers - The form state.
 * @returns Labels of the missing answers; empty when the run may start.
 */
export function missingHardwareAnswers(answers: HardwareAnswers): string[] {
  const missing: string[] = [];
  if (!sanitizeReportedGpu(answers.gpu)) missing.push(REQUIRED_LABELS.gpu);
  if (!answers.chassis) missing.push(REQUIRED_LABELS.chassis);
  if (!answers.ram) missing.push(REQUIRED_LABELS.ram);
  if (!answers.otherApps) missing.push(REQUIRED_LABELS.otherApps);
  return missing;
}

/**
 * The inline reason shown beside the disabled Start benchmark button.
 *
 * @param answers - The form state.
 * @returns The sentence, or null when every answer is given.
 * @example
 * hardwareBlockReason(EMPTY_HARDWARE_ANSWERS);
 * // 'Still to answer: graphics card or chip, computer type, memory (RAM) and other heavy programs running.'
 */
export function hardwareBlockReason(answers: HardwareAnswers): string | null {
  const missing = missingHardwareAnswers(answers);
  if (missing.length === 0) return null;
  const list =
    missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Still to answer: ${list}.`;
}

/**
 * The answers as the run file records them. Only answered questions appear;
 * the GPU name is normalized (`sanitizeReportedGpu`) and "Not sure" RAM is
 * `null`.
 *
 * @param answers - The form state at the moment the run file is assembled.
 * @returns The field, or undefined when nothing is answered.
 */
export function toUserReportedHardware(answers: HardwareAnswers): UserReportedHardware | undefined {
  const out: UserReportedHardware = {};
  const gpu = sanitizeReportedGpu(answers.gpu);
  if (gpu) out.gpu = gpu;
  if (answers.chassis) out.chassis = answers.chassis;
  if (answers.ram === 'unsure') out.ramGB = null;
  else if (RAM_BUCKETS_GB.includes(Number(answers.ram))) out.ramGB = Number(answers.ram);
  if (answers.otherApps) out.otherAppsRunning = answers.otherApps === 'yes';
  return Object.keys(out).length > 0 ? out : undefined;
}

/** localStorage key of the answers kept for a series (a sibling of the series state). */
export const SERIES_HARDWARE_STORAGE_KEY = 'localmode-bench-series-hardware';

/** Parse stored answers; anything malformed reads as none. */
export function parseStoredHardware(raw: string | null, seriesId: string): HardwareAnswers | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { seriesId: id, answers } = v as { seriesId?: unknown; answers?: Record<string, unknown> };
  if (id !== seriesId || typeof answers !== 'object' || answers === null) return null;
  const { gpu, chassis, ram, otherApps } = answers;
  if (typeof gpu !== 'string' || gpu.length > REPORTED_GPU_MAX_LENGTH) return null;
  if (!['', 'laptop', 'desktop', 'other'].includes(chassis as string)) return null;
  if (!(ram === '' || ram === 'unsure' || RAM_BUCKETS_GB.map(String).includes(ram as string))) return null;
  if (!['', 'yes', 'no'].includes(otherApps as string)) return null;
  return { gpu, chassis: chassis as HardwareAnswers['chassis'], ram: ram as string, otherApps: otherApps as HardwareAnswers['otherApps'] };
}

/** Read the answers stored for this series (null when absent, for another series, malformed, or storage is blocked). */
export function loadSeriesHardware(seriesId: string): HardwareAnswers | null {
  try {
    return parseStoredHardware(localStorage.getItem(SERIES_HARDWARE_STORAGE_KEY), seriesId);
  } catch {
    return null;
  }
}

/** Keep the answers for the runs after the next reload of this series. */
export function saveSeriesHardware(seriesId: string, answers: HardwareAnswers): void {
  try {
    localStorage.setItem(SERIES_HARDWARE_STORAGE_KEY, JSON.stringify({ seriesId, answers }));
  } catch {
    // Storage blocked: the next run of the series asks again.
  }
}

/** Forget the stored answers (the series ended, was stopped, or was closed). */
export function clearSeriesHardware(): void {
  try {
    localStorage.removeItem(SERIES_HARDWARE_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
