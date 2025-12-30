/**
 * @file pdf.service.ts
 * @description Service for PDF loading, embedding, and search using @localmode packages
 */
import { extractPDFText } from '@localmode/pdfjs';
import { createVectorDB, chunk, embed, embedMany, rerank, type VectorDB } from '@localmode/core';
import { transformers, isWebGPUAvailable } from '@localmode/transformers';
import { PDF_CONFIG, MODELS } from '../_lib/constants';
import type { PDFDocument, DocumentChunk, SearchResult } from '../_lib/types';

/** Cached embedding model instance */
let embeddingModelInstance: ReturnType<typeof transformers.embedding> | null = null;
let modelInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Get the optimal device for model inference
 * Uses WebGPU if available for better performance, falls back to WASM
 */
async function getOptimalDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const webgpuAvailable = await isWebGPUAvailable();
    if (webgpuAvailable) {
      console.log('[PDF Service] WebGPU is available, using GPU acceleration');
      return 'webgpu';
    }
  } catch (error) {
    console.warn('[PDF Service] WebGPU check failed:', error);
  }
  console.log('[PDF Service] Using WASM backend');
  return 'wasm';
}

/**
 * Initialize the embedding model (call this during app startup)
 * This ensures the model is fully loaded before any PDF processing
 */
export async function initializeEmbeddingModel(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Skip if already initialized
  if (modelInitialized && embeddingModelInstance) {
    return;
  }

  initializationPromise = (async () => {
    console.log('[PDF Service] Initializing embedding model...');

    try {
      // Detect optimal device (WebGPU if available, WASM as fallback)
      const device = await getOptimalDevice();

      // Create model with detected device
      embeddingModelInstance = transformers.embedding(MODELS.EMBEDDING, {
        device,
        quantized: true, // Use quantized model for smaller size
      });

      // Run a test embedding to fully initialize the model pipeline
      console.log('[PDF Service] Running test embedding...');
      const result = await embed({
        model: embeddingModelInstance,
        value: 'initialization test',
      });

      console.log('[PDF Service] Model ready, dimensions:', result.embedding.length);
      modelInitialized = true;
    } catch (error) {
      console.error('[PDF Service] Model initialization failed:', error);
      embeddingModelInstance = null;
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Check if the embedding model is ready
 */
export function isEmbeddingModelReady(): boolean {
  return modelInitialized && embeddingModelInstance !== null;
}

/**
 * Get the embedding model (must be initialized first)
 */
async function getEmbeddingModel() {
  if (!modelInitialized || !embeddingModelInstance) {
    // Initialize if not done yet
    await initializeEmbeddingModel();
  }
  return embeddingModelInstance!;
}

/** Singleton vector database instance */
let vectorDB: VectorDB | null = null;

/**
 * Get or create the vector database instance
 */
export async function getVectorDB() {
  if (!vectorDB) {
    vectorDB = await createVectorDB({
      name: PDF_CONFIG.dbName,
      dimensions: 384, // MiniLM-L6-v2 dimension
    });
  }
  return vectorDB;
}

/**
 * Extract text from a PDF file
 * @param file - PDF file to extract text from
 */
export async function extractPDFContent(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await extractPDFText(arrayBuffer);
  return result;
}

/**
 * Chunk text content into smaller pieces
 * @param text - Text to chunk
 * @param documentId - ID of the document
 */
export function createChunks(text: string, documentId: string): DocumentChunk[] {
  // Handle empty or whitespace-only text
  const trimmedText = text?.trim() ?? '';
  if (!trimmedText) {
    console.warn('[PDF Service] No text content to chunk');
    return [];
  }

  console.log(
    `[PDF Service] Chunking ${trimmedText.length} characters with size=${PDF_CONFIG.chunkSize}`
  );

  try {
    // Use sentence-prioritized separators for PDF content
    // PDFs often have poor paragraph structure, so sentence boundaries are more reliable
    const chunks = chunk(trimmedText, {
      strategy: 'recursive',
      size: PDF_CONFIG.chunkSize,
      overlap: PDF_CONFIG.chunkOverlap,
      separators: [
        '\n\n', // Paragraph breaks (if any)
        '\n', // Line breaks
        '. ', // Sentence ends (most reliable for PDFs)
        '? ', // Questions
        '! ', // Exclamations
        '; ', // Semicolons
        ': ', // Colons (often precede lists)
        ', ', // Commas
        ' ', // Words
        '', // Characters (last resort)
      ],
    });

    console.log(`[PDF Service] Chunker returned ${chunks.length} chunks`);

    // Check if chunks array is empty but text exists
    if (chunks.length === 0 && trimmedText.length > 0) {
      console.log('[PDF Service] Chunker returned empty, creating manual chunks');
      // Fallback: create chunks manually if the chunker fails
      const manualChunks: DocumentChunk[] = [];
      const chunkSize = PDF_CONFIG.chunkSize;

      for (let i = 0; i < trimmedText.length; i += chunkSize - PDF_CONFIG.chunkOverlap) {
        const chunkText = trimmedText.slice(i, i + chunkSize).trim();
        if (chunkText.length > 0) {
          manualChunks.push({
            id: `${documentId}-chunk-${manualChunks.length}`,
            text: chunkText,
            pageNumber: 1,
            chunkIndex: manualChunks.length,
            documentId,
          });
        }
      }

      console.log(`[PDF Service] Created ${manualChunks.length} manual chunks`);
      return manualChunks;
    }

    // Filter out empty chunks and map to DocumentChunk
    const validChunks = chunks
      .filter((c) => c.text && c.text.trim().length > 0)
      .map((c, index) => ({
        id: `${documentId}-chunk-${index}`,
        text: c.text.trim(),
        pageNumber: 1, // PDF page info not available from chunk metadata
        chunkIndex: index,
        documentId,
      }));

    console.log(`[PDF Service] After filtering: ${validChunks.length} valid chunks`);
    return validChunks;
  } catch (error) {
    console.error('[PDF Service] Chunking error:', error);

    // Fallback: create a single chunk with all text
    if (trimmedText.length > 0) {
      console.log('[PDF Service] Using fallback single chunk');
      return [
        {
          id: `${documentId}-chunk-0`,
          text: trimmedText.slice(0, 2000), // Limit to reasonable size
          pageNumber: 1,
          chunkIndex: 0,
          documentId,
        },
      ];
    }
    return [];
  }
}

/** Batch size for embedding to avoid memory issues */
const EMBEDDING_BATCH_SIZE = 5;

/**
 * Embed chunks and store in vector database
 * @param chunks - Chunks to embed
 * @param filename - Source filename for metadata
 * @param onProgress - Optional progress callback
 */
export async function embedAndStoreChunks(
  chunks: DocumentChunk[],
  filename: string,
  onProgress?: (progress: number) => void
) {
  // Validate chunks - filter out any with empty/null text
  const validChunks = chunks.filter((c) => c.text && c.text.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error('No valid text chunks to embed. The PDF may be empty or contain only images.');
  }

  if (validChunks.length !== chunks.length) {
    console.warn(`[PDF Service] Filtered out ${chunks.length - validChunks.length} empty chunks`);
  }

  const db = await getVectorDB();
  const embeddingModel = await getEmbeddingModel();

  // Extract texts for embedding - ensure no null/undefined values
  const texts = validChunks.map((c) => c.text.trim());

  // Process in batches to avoid memory issues
  const allEmbeddings: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    // Double-check batch has no empty strings
    const validBatch = batch.filter((t) => t && t.length > 0);
    if (validBatch.length !== batch.length) {
      console.warn(
        `[PDF Service] Skipped ${batch.length - validBatch.length} empty texts in batch`
      );
    }

    if (validBatch.length === 0) {
      continue;
    }

    try {
      // Embed batch
      const { embeddings: batchEmbeddings } = await embedMany({
        model: embeddingModel,
        values: validBatch,
      });

      allEmbeddings.push(...batchEmbeddings);
    } catch (error) {
      // Log detailed error for debugging
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[PDF Service] Embedding batch failed:', {
        batchIndex: i,
        batchSize: validBatch.length,
        sampleTexts: validBatch.slice(0, 2).map((t) => t.substring(0, 50) + '...'),
        message: errorObj.message,
      });
      throw error;
    }

    // Report progress (embedding is ~70% of the work)
    const embeddingProgress = ((i + batch.length) / texts.length) * 70;
    onProgress?.(embeddingProgress);
  }

  // Store in vector DB with metadata
  const documents = validChunks.map((chunk, i) => ({
    id: chunk.id,
    vector: allEmbeddings[i],
    metadata: {
      text: chunk.text,
      filename,
      page: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      documentId: chunk.documentId,
    },
  }));

  await db.addMany(documents, {
    onProgress: (completed, total) => onProgress?.(70 + (completed / total) * 30),
  });

  console.log(`[PDF Service] Stored ${validChunks.length} chunks for ${filename}`);
  return { count: validChunks.length };
}

/** Parameters for searching documents */
interface SearchParams {
  /** Search query */
  query: string;
  /** Number of results to return */
  topK: number;
  /** Whether to use reranking */
  useReranking: boolean;
}

/**
 * Search documents using semantic search with optional reranking
 * @param params - Search parameters
 */
export async function searchDocuments(params: SearchParams): Promise<{
  results: SearchResult[];
  searchTime: number;
}> {
  const { query, topK, useReranking } = params;
  const startTime = Date.now();

  const db = await getVectorDB();
  const embeddingModel = await getEmbeddingModel();

  // Get query embedding
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: [query],
  });

  // Search vector DB - get more results if reranking
  const searchK = useReranking ? Math.min(topK * 3, 30) : topK;
  const searchResults = await db.search(embeddings[0], {
    k: searchK,
  });

  let finalResults = searchResults;

  // Apply reranking if enabled
  if (useReranking && searchResults.length > 0) {
    const rerankerModel = transformers.reranker(MODELS.RERANKER);

    // Extract texts for reranking
    const textsToRerank = searchResults.map((r) => String(r.metadata?.text ?? ''));

    const reranked = await rerank({
      model: rerankerModel,
      query,
      documents: textsToRerank,
      topK,
    });

    // Map reranked results back with metadata using index
    finalResults = reranked.results.map((r) => ({
      ...searchResults[r.index],
      score: r.score,
    }));
  }

  const searchTime = Date.now() - startTime;

  return {
    results: finalResults.slice(0, topK).map((r) => ({
      text: String(r.metadata?.text ?? ''),
      score: r.score,
      metadata: {
        filename: String(r.metadata?.filename ?? 'Unknown'),
        page: Number(r.metadata?.page ?? 1),
        chunkIndex: Number(r.metadata?.chunkIndex ?? 0),
      },
    })),
    searchTime,
  };
}

/**
 * Process a PDF file - extract text, chunk, embed, and store
 * @param file - PDF file to process
 * @param onProgress - Optional progress callback
 */
export async function processPDF(
  file: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<PDFDocument> {
  const documentId = crypto.randomUUID();

  // Extract text
  onProgress?.('Extracting text...', 10);
  const pdfResult = await extractPDFContent(file);

  // Combine page texts
  const fullText = pdfResult.pages.map((p) => p.text).join('\n\n');

  // Check if we got any text
  if (!fullText || !fullText.trim()) {
    throw new Error(
      'Could not extract text from PDF. The file may be scanned images or protected.'
    );
  }

  console.log(
    `[PDF Service] Extracted ${fullText.length} characters from ${pdfResult.pages.length} pages`
  );

  // Create chunks
  onProgress?.('Chunking text...', 30);
  const chunks = createChunks(fullText, documentId);

  if (chunks.length === 0) {
    throw new Error('No text chunks could be created. The PDF may have too little text content.');
  }

  console.log(`[PDF Service] Created ${chunks.length} chunks`);

  // Embed and store
  onProgress?.('Embedding chunks...', 50);
  await embedAndStoreChunks(chunks, file.name, (p) => {
    onProgress?.('Embedding chunks...', 50 + p * 0.4);
  });

  onProgress?.('Complete!', 100);

  return {
    id: documentId,
    filename: file.name,
    metadata: {
      filename: file.name,
      fileSize: file.size,
      pageCount: pdfResult.pages.length,
      uploadedAt: new Date(),
    },
    chunks,
  };
}

/**
 * Delete a single document's vectors from the database
 * @param documentId - ID of the document to delete
 */
export async function deleteDocumentVectors(documentId: string): Promise<void> {
  const db = await getVectorDB();

  // Delete all vectors with matching documentId in metadata (exact match)
  const deleted = await db.deleteWhere({
    documentId: documentId,
  });

  console.log(`[PDF Service] Deleted ${deleted} vectors for document ${documentId}`);
}

/**
 * Delete all documents from the vector database
 */
export async function clearAllDocuments() {
  if (vectorDB) {
    await vectorDB.clear();
  }
}
