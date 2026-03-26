/**
 * @file redactor.service.ts
 * @description Service helpers for NER-based document redaction using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID, EMBEDDING_MODEL_ID } from '../_lib/constants';
import type { Entity } from '@localmode/core';
import type { DetectedEntity } from '../_lib/types';

/** Cached NER model instance */
let model: ReturnType<typeof transformers.ner> | null = null;

/** Get or create the NER model instance */
export function getNERModel() {
  if (!model) {
    model = transformers.ner(MODEL_ID);
  }
  return model;
}

/** Cached embedding model instance */
let embeddingModel: ReturnType<typeof transformers.embedding> | null = null;

/** Get or create the embedding model instance for DP demonstration */
export function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = transformers.embedding(EMBEDDING_MODEL_ID);
  }
  return embeddingModel;
}

/** Map core Entity objects to the app's DetectedEntity shape */
export function mapEntities(entities: Entity[]): DetectedEntity[] {
  return entities.map((e) => ({
    text: e.text,
    label: e.type.replace(/^[BI]-/, ''),
    start: e.start,
    end: e.end,
    score: e.score,
  }));
}
