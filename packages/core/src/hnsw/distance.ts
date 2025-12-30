/**
 * Distance/similarity functions for vector comparison.
 */

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Compute cosine distance (1 - similarity).
 * Returns a value between 0 and 2, where 0 means identical direction.
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Compute Euclidean (L2) distance between two vectors.
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Compute dot product between two vectors.
 * Higher values mean more similar (for normalized vectors).
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

/**
 * Normalize a vector to unit length.
 */
export function normalize(v: Float32Array): Float32Array {
  let norm = 0;

  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }

  norm = Math.sqrt(norm);

  if (norm === 0) {
    return v;
  }

  const result = new Float32Array(v.length);

  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / norm;
  }

  return result;
}

export type DistanceFunction = 'cosine' | 'euclidean' | 'dot';

/**
 * Get the appropriate distance function.
 * For HNSW, we need a distance (lower = better) function.
 */
export function getDistanceFunction(
  type: DistanceFunction
): (a: Float32Array, b: Float32Array) => number {
  switch (type) {
    case 'cosine':
      return cosineDistance;
    case 'euclidean':
      return euclideanDistance;
    case 'dot':
      // For dot product, we negate since HNSW expects lower = better
      return (a, b) => -dotProduct(a, b);
    default:
      return cosineDistance;
  }
}

/**
 * Convert distance to similarity score.
 * Higher score = more similar.
 */
export function distanceToScore(distance: number, type: DistanceFunction): number {
  switch (type) {
    case 'cosine':
      // cosine distance is 1 - similarity, so similarity = 1 - distance
      return 1 - distance;
    case 'euclidean':
      // Convert to a 0-1 range (approximate)
      return 1 / (1 + distance);
    case 'dot':
      // We negated for distance, so negate back
      return -distance;
    default:
      return 1 - distance;
  }
}

