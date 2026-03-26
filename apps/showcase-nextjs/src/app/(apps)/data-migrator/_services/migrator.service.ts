/**
 * @file migrator.service.ts
 * @description Service for creating embedding model and VectorDB instances
 */
import { transformers } from '@localmode/transformers';
import { EMBEDDING_MODEL_ID } from '../_lib/constants';

/** Get an embedding model instance for re-embedding text-only records */
export function getEmbeddingModel() {
  return transformers.embedding(EMBEDDING_MODEL_ID);
}
