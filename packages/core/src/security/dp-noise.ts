/**
 * Differential Privacy Noise Mechanisms
 *
 * Provides cryptographically secure noise generation for differential privacy.
 * Uses Web Crypto API (crypto.getRandomValues) for all randomness — never Math.random().
 *
 * @packageDocumentation
 */

// ============================================================================
// Cryptographic Random Helpers
// ============================================================================

/**
 * Generate a cryptographically secure uniform random number in [0, 1).
 * Uses crypto.getRandomValues() for security.
 */
function secureRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // Divide by 2^32 to get [0, 1)
  return buffer[0] / 4294967296;
}

/**
 * Generate a pair of cryptographically secure uniform random numbers in (0, 1).
 * Ensures neither value is exactly 0 (needed for log transform).
 */
function secureRandomPair(): [number, number] {
  let u1 = 0;
  let u2 = 0;
  // Rejection sample to avoid exact 0
  while (u1 === 0) u1 = secureRandom();
  while (u2 === 0) u2 = secureRandom();
  return [u1, u2];
}

// ============================================================================
// Gaussian Noise (Box-Muller Transform)
// ============================================================================

/**
 * Generate Gaussian (normal) noise with mean 0 and standard deviation sigma.
 *
 * Uses the Box-Muller transform to convert pairs of uniform random variables
 * into pairs of independent standard normal random variables, then scales
 * by sigma.
 *
 * @param dimensions - Number of noise values to generate
 * @param sigma - Standard deviation of the Gaussian distribution
 * @returns Float32Array of Gaussian noise values
 *
 * @example
 * ```ts
 * // Generate 384-dimensional Gaussian noise with sigma=0.1
 * const noise = gaussianNoise(384, 0.1);
 * ```
 */
export function gaussianNoise(dimensions: number, sigma: number): Float32Array {
  const noise = new Float32Array(dimensions);

  // Box-Muller generates pairs, so process 2 at a time
  for (let i = 0; i < dimensions; i += 2) {
    const [u1, u2] = secureRandomPair();

    // Box-Muller transform
    const magnitude = sigma * Math.sqrt(-2.0 * Math.log(u1));
    const angle = 2.0 * Math.PI * u2;

    noise[i] = magnitude * Math.cos(angle);
    if (i + 1 < dimensions) {
      noise[i + 1] = magnitude * Math.sin(angle);
    }
  }

  return noise;
}

// ============================================================================
// Laplacian Noise (Inverse CDF Method)
// ============================================================================

/**
 * Generate Laplacian noise with mean 0 and scale parameter b.
 *
 * Uses the inverse CDF method: if U ~ Uniform(0,1), then
 * X = -b * sign(U - 0.5) * ln(1 - 2|U - 0.5|) is Laplace(0, b).
 *
 * @param dimensions - Number of noise values to generate
 * @param scale - Scale parameter b of the Laplace distribution (b = sensitivity / epsilon)
 * @returns Float32Array of Laplacian noise values
 *
 * @example
 * ```ts
 * // Generate 384-dimensional Laplacian noise with scale=0.5
 * const noise = laplacianNoise(384, 0.5);
 * ```
 */
export function laplacianNoise(dimensions: number, scale: number): Float32Array {
  const noise = new Float32Array(dimensions);

  for (let i = 0; i < dimensions; i++) {
    let u = 0;
    // Rejection sample to avoid u = 0 or u = 0.5 (which causes log(0))
    while (u === 0 || u === 0.5) {
      u = secureRandom();
    }

    // Inverse CDF of Laplace distribution
    const shift = u - 0.5;
    const sign = shift < 0 ? -1 : 1;
    noise[i] = -scale * sign * Math.log(1 - 2 * Math.abs(shift));
  }

  return noise;
}

// ============================================================================
// Noise Application
// ============================================================================

/**
 * Add noise vector to an embedding vector (element-wise addition).
 *
 * @param embedding - Original embedding vector
 * @param noise - Noise vector (same dimensions)
 * @returns New Float32Array with noise added
 *
 * @example
 * ```ts
 * const noisyEmbedding = addNoise(embedding, noise);
 * ```
 */
export function addNoise(embedding: Float32Array, noise: Float32Array): Float32Array {
  const result = new Float32Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    result[i] = embedding[i] + noise[i];
  }
  return result;
}
