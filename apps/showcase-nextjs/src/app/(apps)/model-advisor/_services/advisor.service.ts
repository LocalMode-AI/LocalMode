/**
 * @file advisor.service.ts
 * @description Service layer for model registry and capabilities APIs from @localmode/core
 */
import { registerModel, getModelRegistry } from '@localmode/core';
import type { ModelRegistryEntry, TaskCategory } from '@localmode/core';

/** All 21 task category values */
const ALL_TASKS: TaskCategory[] = [
  'embedding',
  'classification',
  'zero-shot',
  'ner',
  'reranking',
  'generation',
  'translation',
  'summarization',
  'fill-mask',
  'question-answering',
  'speech-to-text',
  'text-to-speech',
  'image-classification',
  'image-captioning',
  'object-detection',
  'segmentation',
  'ocr',
  'document-qa',
  'image-features',
  'image-to-image',
  'multimodal-embedding',
];

/** Register a custom model entry in the runtime registry */
export function registerCustomModel(entry: ModelRegistryEntry) {
  registerModel(entry);
}

/** Get the full combined model registry (default + custom entries) */
export function getRegistry() {
  return getModelRegistry();
}

/** Get all 21 task category values */
export function getTaskCategories(): TaskCategory[] {
  return ALL_TASKS;
}
