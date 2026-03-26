/**
 * @file constants.ts
 * @description Constants for the model advisor application
 */
import type { TaskCategory, TaskGroup } from './types';
import type { BatchTaskType } from '@localmode/core';

/** App metadata */
export const APP_TITLE = 'Model Advisor';
export const APP_SUBTITLE = 'Find the best model for your device';

/** Primary accent color used throughout the app */
export const ACCENT_COLOR = 'poster-accent-teal';

/** Default task category on initial load */
export const DEFAULT_TASK: TaskCategory = 'embedding';

/** Default embedding dimensions for batch size computation */
export const DEFAULT_DIMENSIONS = 384;

/** Task categories grouped by domain for the dropdown selector */
export const TASK_GROUPS: TaskGroup[] = [
  {
    label: 'Text',
    tasks: [
      'embedding',
      'classification',
      'zero-shot',
      'ner',
      'reranking',
      'fill-mask',
      'question-answering',
    ],
  },
  {
    label: 'Generation',
    tasks: ['generation'],
  },
  {
    label: 'Translation & Summarization',
    tasks: ['translation', 'summarization'],
  },
  {
    label: 'Vision',
    tasks: [
      'image-classification',
      'image-captioning',
      'object-detection',
      'segmentation',
      'ocr',
      'document-qa',
      'image-features',
      'image-to-image',
      'multimodal-embedding',
    ],
  },
  {
    label: 'Audio',
    tasks: ['speech-to-text', 'text-to-speech'],
  },
];

/**
 * Maps each TaskCategory to a BatchTaskType for computeOptimalBatchSize().
 * Only 'embedding' and 'ingestion' are valid BatchTaskTypes.
 * All tasks default to 'embedding'.
 */
export const BATCH_TASK_MAP: Record<TaskCategory, BatchTaskType> = {
  'embedding': 'embedding',
  'classification': 'embedding',
  'zero-shot': 'embedding',
  'ner': 'embedding',
  'reranking': 'embedding',
  'generation': 'embedding',
  'translation': 'embedding',
  'summarization': 'embedding',
  'fill-mask': 'embedding',
  'question-answering': 'embedding',
  'speech-to-text': 'embedding',
  'text-to-speech': 'embedding',
  'image-classification': 'embedding',
  'image-captioning': 'embedding',
  'object-detection': 'embedding',
  'segmentation': 'embedding',
  'ocr': 'embedding',
  'document-qa': 'embedding',
  'image-features': 'embedding',
  'image-to-image': 'embedding',
  'multimodal-embedding': 'embedding',
};
