/**
 * GGUF Metadata Parser
 *
 * Reads GGUF file headers via HTTP Range requests (~4KB) to extract
 * model metadata without downloading the full model file.
 *
 * Uses `@huggingface/gguf` for parsing the binary header format.
 *
 * @packageDocumentation
 */

import { resolveModelUrl } from './utils.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Parsed GGUF metadata from a model file header.
 *
 * All fields are extracted from the GGUF binary header via HTTP Range requests,
 * downloading only ~4KB of the file regardless of total model size.
 */
export interface GGUFMetadata {
  /** Model family (e.g., 'llama', 'mistral', 'qwen2', 'phi', 'gemma') */
  architecture: string;

  /** Maximum context window from metadata */
  contextLength: number;

  /** Hidden size / embedding dimension */
  embeddingLength: number;

  /** Quantization type (e.g., 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'F16') */
  quantization: string;

  /** Total model parameters (computed from tensor dimensions) */
  parameterCount: number;

  /** Total file size in bytes */
  fileSize: number;

  /** Vocabulary token count */
  vocabSize: number;

  /** Number of attention heads */
  headCount: number;

  /** Number of transformer layers */
  layerCount: number;

  /** Human-readable name from metadata (if present) */
  modelName?: string;

  /** Model author from metadata (if present) */
  author?: string;

  /** License information from metadata (if present) */
  license?: string;

  /** Model description from metadata (if present) */
  description?: string;

  /** GGUF file type enum value (raw quantization identifier) */
  fileType: number;

  /** All raw metadata key-value pairs for advanced inspection */
  rawMetadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// QUANTIZATION MAPPING
// ═══════════════════════════════════════════════════════════════

/**
 * Map GGUF `general.file_type` integer values to human-readable quantization strings.
 *
 * @see https://github.com/ggerganov/llama.cpp/blob/master/ggml/include/ggml.h
 */
const FILE_TYPE_MAP: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  7: 'Q8_0',
  8: 'Q8_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  19: 'IQ2_XXS',
  20: 'IQ2_XS',
  21: 'IQ3_XXS',
  22: 'IQ1_S',
  23: 'IQ4_NL',
  24: 'IQ3_S',
  25: 'IQ2_S',
  26: 'IQ4_XS',
  27: 'IQ1_M',
  28: 'BF16',
};

/**
 * Map a GGUF file_type integer to a human-readable quantization string.
 *
 * @param fileType - The `general.file_type` value from GGUF metadata
 * @returns Human-readable quantization name (e.g., 'Q4_K_M')
 */
export function mapQuantizationType(fileType: number): string {
  return FILE_TYPE_MAP[fileType] ?? `UNKNOWN(${fileType})`;
}

// ═══════════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Parse GGUF metadata from a file URL via HTTP Range requests.
 *
 * Downloads only the header portion (~4KB) of the GGUF file, NOT the full model.
 * Works with any HuggingFace-hosted GGUF file and custom CDNs that support Range requests.
 *
 * @param url - Full URL or HuggingFace shorthand (`repo/name:filename.gguf`)
 * @param options - Optional abort signal
 * @returns Parsed GGUF metadata
 * @throws Error if the file is not a valid GGUF file, server does not support Range requests, or URL is invalid
 *
 * @example Parse a HuggingFace model
 * ```ts
 * import { parseGGUFMetadata } from '@localmode/wllama';
 *
 * const metadata = await parseGGUFMetadata(
 *   'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
 * );
 *
 * console.log(metadata.architecture);  // 'llama'
 * console.log(metadata.quantization);  // 'Q4_K_M'
 * console.log(metadata.contextLength); // 131072
 * console.log(metadata.parameterCount); // ~1.24B
 * ```
 *
 * @example Parse with AbortSignal
 * ```ts
 * const controller = new AbortController();
 * const metadata = await parseGGUFMetadata(url, { abortSignal: controller.signal });
 * ```
 */
export async function parseGGUFMetadata(
  url: string,
  options?: { abortSignal?: AbortSignal }
): Promise<GGUFMetadata> {
  options?.abortSignal?.throwIfAborted();

  // Resolve shorthand URLs
  const resolvedUrl = resolveModelUrl(url);

  try {
    // Dynamic import of @huggingface/gguf
    const { gguf } = await import('@huggingface/gguf');

    options?.abortSignal?.throwIfAborted();

    // Create a custom fetch that supports abort signal
    const customFetch = options?.abortSignal
      ? (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: options.abortSignal })
      : undefined;

    // Parse the GGUF header via Range requests with parameter count computation
    const result = await gguf(resolvedUrl, {
      fetch: customFetch,
      computeParametersCount: true,
    });

    const { metadata: rawMeta, tensorInfos } = result;

    // Cast metadata to a loose record for dynamic key access
    const meta = rawMeta as unknown as Record<string, unknown>;
    const arch = (getStringValue(meta, 'general.architecture') ?? 'unknown');

    // Extract architecture-prefixed metadata keys
    const contextLength =
      getNumberValue(meta, `${arch}.context_length`) ??
      getNumberValue(meta, 'general.context_length') ??
      0;

    const embeddingLength =
      getNumberValue(meta, `${arch}.embedding_length`) ?? 0;

    const vocabSize =
      getNumberValue(meta, `${arch}.vocab_size`) ??
      getTokenArrayLength(meta) ??
      0;

    const headCount =
      getNumberValue(meta, `${arch}.attention.head_count`) ?? 0;

    const layerCount =
      getNumberValue(meta, `${arch}.block_count`) ?? 0;

    const fileType = getNumberValue(meta, 'general.file_type') ?? -1;
    const quantization = mapQuantizationType(fileType);

    // Use the computed parameter count from @huggingface/gguf
    const parameterCount = (result as { parameterCount?: number }).parameterCount ??
      computeParameterCount(tensorInfos);

    // Estimate file size from tensors
    const fileSize = estimateFileSizeFromTensors(tensorInfos);

    return {
      architecture: arch,
      contextLength,
      embeddingLength,
      quantization,
      parameterCount,
      fileSize,
      vocabSize,
      headCount,
      layerCount,
      modelName: getStringValue(meta, 'general.name'),
      author: getStringValue(meta, 'general.author'),
      license: getStringValue(meta, 'general.license'),
      description: getStringValue(meta, 'general.description'),
      fileType,
      rawMetadata: meta,
    };
  } catch (error) {
    // Re-throw abort errors as-is
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    // Check for Range request issues
    if (message.includes('416') || message.includes('Range Not Satisfiable')) {
      throw new Error(
        `Server does not support HTTP Range requests for ${resolvedUrl}. ` +
        'GGUF metadata parsing requires Range request support. ' +
        'Use a HuggingFace URL or a CDN that supports Range requests.'
      );
    }

    // Check for non-GGUF files
    if (message.includes('GGUF') || message.includes('magic') || message.includes('Invalid')) {
      throw new Error(
        `File at ${resolvedUrl} is not a valid GGUF file. ` +
        'Ensure the URL points to a .gguf model file.'
      );
    }

    throw new Error(
      `Failed to parse GGUF metadata from ${resolvedUrl}: ${message}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract a string value from metadata.
 * @internal
 */
function getStringValue(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract a number value from metadata.
 * @internal
 */
function getNumberValue(meta: Record<string, unknown>, key: string): number | undefined {
  const value = meta[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

/**
 * Get vocab size from the tokenizer tokens array length.
 * @internal
 */
function getTokenArrayLength(meta: Record<string, unknown>): number | undefined {
  const tokens = meta['tokenizer.ggml.tokens'];
  if (Array.isArray(tokens)) return tokens.length;
  return undefined;
}

/**
 * Compute total parameter count from tensor info array.
 * @internal
 */
function computeParameterCount(tensorInfos: Array<{ shape: bigint[] }>): number {
  let total = 0;
  for (const tensor of tensorInfos) {
    let tensorParams = 1;
    for (const dim of tensor.shape) {
      tensorParams *= Number(dim);
    }
    total += tensorParams;
  }
  return total;
}

/**
 * Estimate file size from tensor info array.
 * This is a rough estimate — actual file size depends on exact quantization overhead.
 * @internal
 */
function estimateFileSizeFromTensors(tensorInfos: Array<{ shape: bigint[]; dtype: number }>): number {
  // Approximate bits per weight for different quantization types
  const bitsPerWeight: Record<number, number> = {
    0: 32,   // F32
    1: 16,   // F16
    2: 4.5,  // Q4_0
    3: 5,    // Q4_1
    6: 5.5,  // Q5_0
    7: 5.5,  // Q5_1
    8: 8.5,  // Q8_0
    9: 9,    // Q8_1
    10: 2.5, // Q2_K
    11: 3.5, // Q3_K_S
    12: 3.5, // Q3_K_M
    13: 3.5, // Q3_K_L
    14: 4.5, // Q4_K_S
    15: 4.5, // Q4_K_M
    16: 5.5, // Q5_K_S
    17: 5.5, // Q5_K_M
    18: 6.5, // Q6_K
    28: 16,  // BF16
  };

  let totalBits = 0;
  for (const tensor of tensorInfos) {
    let elements = 1;
    for (const dim of tensor.shape) {
      elements *= Number(dim);
    }
    const bpw = bitsPerWeight[tensor.dtype] ?? 4.5; // conservative default
    totalBits += elements * bpw;
  }

  // Convert bits to bytes and add ~1% overhead for header/metadata
  return Math.ceil((totalBits / 8) * 1.01);
}
