/**
 * Download Manager
 *
 * Handles downloading model files with chunked transfers, resume support,
 * retry with exponential backoff, and offline awareness.
 *
 * @packageDocumentation
 */

import { globalEventBus } from '../events/index.js';
import { isOnline, waitForOnline } from '../utils/network.js';
import { NetworkError, OfflineError } from '../errors/index.js';
import { ChunkedModelStore } from './chunked-store.js';
import type { ModelDownloadProgress, ModelLoaderConfig } from './types.js';

// ============================================================================
// Types
// ============================================================================

/** Options passed to the download method. */
export interface DownloadOptions {
  /** Signal to abort the download. */
  abortSignal?: AbortSignal;

  /** Progress callback. */
  onProgress?: (modelId: string, progress: ModelDownloadProgress) => void;
}

/** Internal state for an active download. */
interface ActiveDownload {
  modelId: string;
  controller: AbortController;
}

// ============================================================================
// DownloadManager
// ============================================================================

/**
 * Manages downloading model files with chunking, resume, and retry.
 */
export class DownloadManager {
  private store: ChunkedModelStore;
  private chunkSize: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private activeDownloads: Map<string, ActiveDownload> = new Map();

  /**
   * @param store - Chunked store for persisting downloaded data
   * @param config - Loader configuration
   */
  constructor(store: ChunkedModelStore, config: Required<Pick<ModelLoaderConfig, 'chunkSize' | 'maxRetries' | 'retryDelayMs'>>) {
    this.store = store;
    this.chunkSize = config.chunkSize;
    this.maxRetries = config.maxRetries;
    this.retryDelayMs = config.retryDelayMs;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Download a model file, storing it as chunks in IndexedDB.
   *
   * 1. Sends a HEAD request to determine `Content-Length` and `Accept-Ranges`.
   * 2. If the server supports Range requests, downloads chunk-by-chunk.
   * 3. Otherwise, streams the entire response and splits into chunks locally.
   *
   * Resume support: chunks already present in the store are skipped.
   *
   * @param url - URL of the model file
   * @param modelId - Unique identifier for the model
   * @param options - Abort signal and progress callback
   */
  async download(url: string, modelId: string, options: DownloadOptions = {}): Promise<void> {
    const { abortSignal, onProgress } = options;

    // Check abort before starting
    abortSignal?.throwIfAborted();

    // Check online status
    if (!isOnline()) {
      throw new OfflineError('download model');
    }

    // Register this download
    const controller = new AbortController();
    const download: ActiveDownload = { modelId, controller };
    this.activeDownloads.set(modelId, download);

    // Combine external signal with our internal one
    const combinedSignal = abortSignal
      ? this.combineSignals(abortSignal, controller.signal)
      : controller.signal;

    const startTime = Date.now();

    try {
      // Emit download start
      globalEventBus.emit('modelDownloadStart' as 'open', {
        modelId,
        totalBytes: 0,
      } as unknown as { name: string });

      // HEAD request to get size and range support
      const headInfo = await this.headRequest(url, combinedSignal);

      // Emit with actual total bytes
      globalEventBus.emit('modelDownloadStart' as 'open', {
        modelId,
        totalBytes: headInfo.totalBytes,
      } as unknown as { name: string });

      const totalChunks = headInfo.totalBytes > 0
        ? Math.ceil(headInfo.totalBytes / this.chunkSize)
        : 0;

      // Write initial metadata
      await this.store.writeMetadata({
        modelId,
        url,
        totalBytes: headInfo.totalBytes,
        chunkCount: totalChunks,
        chunkSize: this.chunkSize,
        status: 'partial',
        lastAccessed: new Date(),
        createdAt: new Date(),
      });

      // Progress reporter
      const reportProgress = (downloadedBytes: number, chunksComplete: number, chunksTotal: number) => {
        const progress: ModelDownloadProgress = {
          modelId,
          downloadedBytes,
          totalBytes: headInfo.totalBytes,
          progress: headInfo.totalBytes > 0 ? downloadedBytes / headInfo.totalBytes : 0,
          chunksComplete,
          chunksTotal,
        };

        onProgress?.(modelId, progress);

        globalEventBus.emit('modelDownloadProgress' as 'open', {
          modelId,
          downloadedBytes,
          totalBytes: headInfo.totalBytes,
          progress: progress.progress,
        } as unknown as { name: string });
      };

      if (headInfo.supportsRange && headInfo.totalBytes > 0) {
        await this.downloadChunked(url, modelId, headInfo.totalBytes, totalChunks, combinedSignal, reportProgress);
      } else {
        await this.downloadStreaming(url, modelId, headInfo.totalBytes, combinedSignal, reportProgress);
      }

      // Mark as complete
      const meta = await this.store.readMetadata(modelId);
      if (meta) {
        meta.status = 'complete';
        meta.lastAccessed = new Date();
        await this.store.writeMetadata(meta);
      }

      const durationMs = Date.now() - startTime;

      globalEventBus.emit('modelDownloadComplete' as 'open', {
        modelId,
        totalBytes: headInfo.totalBytes,
        durationMs,
      } as unknown as { name: string });
    } catch (err) {
      // Mark as error in metadata (unless aborted)
      const isAbort = err instanceof DOMException && err.name === 'AbortError';

      if (!isAbort) {
        const meta = await this.store.readMetadata(modelId);
        if (meta) {
          meta.status = 'error';
          await this.store.writeMetadata(meta);
        }

        globalEventBus.emit('modelDownloadError' as 'open', {
          modelId,
          error: err instanceof Error ? err : new Error(String(err)),
        } as unknown as { name: string });
      }

      throw err;
    } finally {
      this.activeDownloads.delete(modelId);
    }
  }

  /**
   * Cancel an in-progress download.
   *
   * @param modelId - Model to cancel
   */
  cancel(modelId: string): void {
    const download = this.activeDownloads.get(modelId);
    if (download) {
      download.controller.abort();
      this.activeDownloads.delete(modelId);
    }
  }

  /**
   * Cancel all in-progress downloads.
   */
  cancelAll(): void {
    for (const download of this.activeDownloads.values()) {
      download.controller.abort();
    }
    this.activeDownloads.clear();
  }

  /**
   * Check whether a download is currently active for a model.
   *
   * @param modelId - Model to check
   * @returns `true` if actively downloading
   */
  isDownloading(modelId: string): boolean {
    return this.activeDownloads.has(modelId);
  }

  /**
   * Get the set of model IDs currently being downloaded.
   *
   * @returns Set of active model IDs
   */
  getActiveModelIds(): Set<string> {
    return new Set(this.activeDownloads.keys());
  }

  // --------------------------------------------------------------------------
  // Chunked Download (Range requests)
  // --------------------------------------------------------------------------

  /**
   * Download a model using HTTP Range requests, one chunk at a time.
   */
  private async downloadChunked(
    url: string,
    modelId: string,
    totalBytes: number,
    totalChunks: number,
    signal: AbortSignal,
    reportProgress: (downloaded: number, chunksComplete: number, chunksTotal: number) => void,
  ): Promise<void> {
    let downloadedBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
      signal.throwIfAborted();

      // Check if chunk already exists (resume support)
      const existingCount = await this.store.getChunkCount(modelId);
      if (i < existingCount) {
        // Chunk exists, skip but count its bytes
        const chunkEnd = Math.min((i + 1) * this.chunkSize, totalBytes);
        const chunkStart = i * this.chunkSize;
        downloadedBytes += chunkEnd - chunkStart;
        reportProgress(downloadedBytes, i + 1, totalChunks);
        continue;
      }

      // Wait for online before each chunk
      if (!isOnline()) {
        await waitForOnline(60_000);
      }

      const rangeStart = i * this.chunkSize;
      const rangeEnd = Math.min(rangeStart + this.chunkSize - 1, totalBytes - 1);

      const chunkData = await this.fetchWithRetry(url, signal, {
        headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
      });

      await this.store.writeChunk(modelId, i, chunkData);

      downloadedBytes += chunkData.byteLength;
      reportProgress(downloadedBytes, i + 1, totalChunks);
    }
  }

  // --------------------------------------------------------------------------
  // Streaming Download (no Range support)
  // --------------------------------------------------------------------------

  /**
   * Download a model as a single stream, splitting into chunks locally.
   */
  private async downloadStreaming(
    url: string,
    modelId: string,
    totalBytes: number,
    signal: AbortSignal,
    reportProgress: (downloaded: number, chunksComplete: number, chunksTotal: number) => void,
  ): Promise<void> {
    const response = await this.fetchResponseWithRetry(url, signal);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new NetworkError('Response body is not readable', { url });
    }

    let chunkIndex = 0;
    let buffer = new Uint8Array(0);
    let downloadedBytes = 0;
    const estimatedChunks = totalBytes > 0 ? Math.ceil(totalBytes / this.chunkSize) : 0;

    try {
      while (true) {
        signal.throwIfAborted();

        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
        downloadedBytes += value.length;

        // Flush complete chunks
        while (buffer.length >= this.chunkSize) {
          const chunkData = buffer.slice(0, this.chunkSize).buffer;
          await this.store.writeChunk(modelId, chunkIndex, chunkData);
          chunkIndex++;

          buffer = buffer.slice(this.chunkSize);
          reportProgress(downloadedBytes, chunkIndex, estimatedChunks || chunkIndex);
        }
      }

      // Flush remaining data as final chunk
      if (buffer.length > 0) {
        await this.store.writeChunk(modelId, chunkIndex, buffer.buffer);
        chunkIndex++;
        reportProgress(downloadedBytes, chunkIndex, estimatedChunks || chunkIndex);
      }

      // Update metadata with actual chunk count
      const meta = await this.store.readMetadata(modelId);
      if (meta) {
        meta.chunkCount = chunkIndex;
        meta.totalBytes = downloadedBytes;
        await this.store.writeMetadata(meta);
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --------------------------------------------------------------------------
  // HEAD Request
  // --------------------------------------------------------------------------

  /**
   * Perform a HEAD request to determine file size and range support.
   */
  private async headRequest(url: string, signal: AbortSignal): Promise<{ totalBytes: number; supportsRange: boolean }> {
    try {
      const response = await fetch(url, { method: 'HEAD', signal });

      if (!response.ok) {
        throw new NetworkError(`HEAD request failed: ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
        });
      }

      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');

      return {
        totalBytes: contentLength ? parseInt(contentLength, 10) : 0,
        supportsRange: acceptRanges === 'bytes',
      };
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;

      // HEAD not supported — fall back to unknown size, no range
      return { totalBytes: 0, supportsRange: false };
    }
  }

  // --------------------------------------------------------------------------
  // Retry Logic
  // --------------------------------------------------------------------------

  /**
   * Fetch a chunk with retry and exponential backoff.
   * Returns the response body as an ArrayBuffer.
   */
  private async fetchWithRetry(
    url: string,
    signal: AbortSignal,
    init?: RequestInit,
  ): Promise<ArrayBuffer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      signal.throwIfAborted();

      try {
        const response = await fetch(url, { ...init, signal });

        if (!response.ok) {
          throw new NetworkError(
            `Download failed: ${response.status} ${response.statusText}`,
            { url, status: response.status },
          );
        }

        return await response.arrayBuffer();
      } catch (err) {
        // Don't retry abort errors
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay, signal);
        }
      }
    }

    throw new NetworkError(
      `Download failed after ${this.maxRetries + 1} attempts`,
      { url, cause: lastError ?? undefined },
    );
  }

  /**
   * Fetch a full Response object with retry (for streaming downloads).
   */
  private async fetchResponseWithRetry(url: string, signal: AbortSignal): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      signal.throwIfAborted();

      try {
        const response = await fetch(url, { signal });

        if (!response.ok) {
          throw new NetworkError(
            `Download failed: ${response.status} ${response.statusText}`,
            { url, status: response.status },
          );
        }

        return response;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay, signal);
        }
      }
    }

    throw new NetworkError(
      `Download failed after ${this.maxRetries + 1} attempts`,
      { url, cause: lastError ?? undefined },
    );
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Sleep for the given duration, respecting an abort signal.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Combine two AbortSignals into one.
   */
  private combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const abort = () => controller.abort();

    if (a.aborted || b.aborted) {
      controller.abort();
      return controller.signal;
    }

    a.addEventListener('abort', abort, { once: true });
    b.addEventListener('abort', abort, { once: true });

    return controller.signal;
  }
}
