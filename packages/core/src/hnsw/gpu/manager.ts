/**
 * @file manager.ts
 * @description GPU distance manager for WebGPU-accelerated vector distance computation.
 *
 * Manages the WebGPU device lifecycle, caches compiled compute pipelines (one per
 * distance metric), and pools GPU buffers for reuse across calls. Handles automatic
 * sub-batching when candidate data exceeds GPU buffer size limits, and supports
 * device lost recovery.
 *
 * @packageDocumentation
 */

import { LocalModeError } from '../../errors/index.js';
import type { DistanceFunction } from '../distance.js';
import { getShaderSource } from './shaders.js';
import { WORKGROUP_SIZE, type GPUBufferEntry, type GPUManagerOptions } from './types.js';

/**
 * Manages WebGPU device, pipeline cache, and buffer pool for GPU-accelerated
 * vector distance computation.
 *
 * Use `GPUDistanceManager.create()` to initialize. Reuse the same manager
 * across multiple search calls for optimal performance (pipeline compilation
 * and buffer allocation are amortized).
 *
 * @example
 * ```ts
 * const manager = await GPUDistanceManager.create();
 * const distances = await manager.computeDistances(query, candidates, 'cosine');
 * manager.destroy();
 * ```
 */
export class GPUDistanceManager {
  private device: GPUDevice;
  private pipelines: Map<DistanceFunction, GPUComputePipeline>;
  private bindGroupLayouts: Map<DistanceFunction, GPUBindGroupLayout>;
  private bufferPool: GPUBufferEntry[] = [];
  private disposed = false;
  private deviceLost = false;
  private onFallback?: (reason: string) => void;

  private constructor(
    device: GPUDevice,
    pipelines: Map<DistanceFunction, GPUComputePipeline>,
    bindGroupLayouts: Map<DistanceFunction, GPUBindGroupLayout>,
    options?: GPUManagerOptions,
  ) {
    this.device = device;
    this.pipelines = pipelines;
    this.bindGroupLayouts = bindGroupLayouts;
    this.onFallback = options?.onFallback;

    // Listen for device lost
    this.device.lost.then((info) => {
      this.deviceLost = true;
      this.onFallback?.(`GPU device lost: ${info.message}`);
    });
  }

  /**
   * Create a new GPUDistanceManager.
   *
   * Requests a GPU adapter and device, compiles compute pipelines for all
   * three distance metrics, and returns an initialized manager.
   *
   * @param options - Optional configuration
   * @returns Initialized GPUDistanceManager
   * @throws {LocalModeError} With code 'GPU_NOT_AVAILABLE' if WebGPU is not supported
   *
   * @example
   * ```ts
   * const manager = await GPUDistanceManager.create();
   * ```
   */
  static async create(options?: GPUManagerOptions): Promise<GPUDistanceManager> {
    // Check WebGPU availability
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new LocalModeError(
        'WebGPU is not available in this environment.',
        'GPU_NOT_AVAILABLE',
        {
          hint: 'WebGPU requires Chrome 113+, Edge 113+, Firefox 141+, or Safari 26+. Use CPU distance functions as a fallback.',
        },
      );
    }

    const gpu = (navigator as any).gpu as GPU;

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new LocalModeError(
        'Failed to request WebGPU adapter. No compatible GPU found.',
        'GPU_NOT_AVAILABLE',
        {
          hint: 'Ensure your device has a compatible GPU and WebGPU is enabled in browser settings.',
        },
      );
    }

    const device = await adapter.requestDevice();

    // Compile pipelines for all three metrics
    const metrics: DistanceFunction[] = ['cosine', 'euclidean', 'dot'];
    const pipelines = new Map<DistanceFunction, GPUComputePipeline>();
    const bindGroupLayouts = new Map<DistanceFunction, GPUBindGroupLayout>();

    for (const metric of metrics) {
      const shaderCode = getShaderSource(metric);
      const shaderModule = device.createShaderModule({ code: shaderCode });

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      const pipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });

      pipelines.set(metric, pipeline);
      bindGroupLayouts.set(metric, bindGroupLayout);
    }

    return new GPUDistanceManager(device, pipelines, bindGroupLayouts, options);
  }

  /**
   * Compute distances between a query vector and an array of candidate vectors
   * using GPU compute shaders.
   *
   * Automatically sub-batches if the candidate data exceeds GPU buffer size limits.
   *
   * @param query - The query vector
   * @param candidates - Array of candidate vectors
   * @param metric - Distance metric to use
   * @returns Float32Array of distances, one per candidate
   * @throws {LocalModeError} With code 'GPU_DESTROYED' if the manager has been disposed
   */
  async computeDistances(
    query: Float32Array,
    candidates: Float32Array[],
    metric: DistanceFunction,
  ): Promise<Float32Array> {
    if (this.disposed) {
      throw new LocalModeError(
        'GPUDistanceManager has been destroyed. Create a new instance.',
        'GPU_DESTROYED',
        { hint: 'Call GPUDistanceManager.create() to get a new manager.' },
      );
    }

    // Attempt device recovery if lost
    if (this.deviceLost) {
      await this.recoverDevice();
    }

    if (candidates.length === 0) {
      return new Float32Array(0);
    }

    const dimensions = query.length;
    const totalCandidates = candidates.length;

    // Check if sub-batching is needed
    const bytesPerCandidate = dimensions * 4; // Float32 = 4 bytes
    const maxBufferSize = this.device.limits.maxStorageBufferBindingSize;
    const maxCandidatesPerBatch = Math.floor(maxBufferSize / bytesPerCandidate);

    if (maxCandidatesPerBatch < 1) {
      throw new LocalModeError(
        `Vector dimensions (${dimensions}) too large for GPU buffer limits.`,
        'GPU_BUFFER_LIMIT',
        { hint: 'Reduce vector dimensions or use CPU distance functions.' },
      );
    }

    if (totalCandidates <= maxCandidatesPerBatch) {
      // Single dispatch
      return this.dispatchBatch(query, candidates, metric, dimensions);
    }

    // Sub-batch: split candidates into chunks that fit within GPU limits
    const allResults = new Float32Array(totalCandidates);
    let offset = 0;

    while (offset < totalCandidates) {
      const batchEnd = Math.min(offset + maxCandidatesPerBatch, totalCandidates);
      const batchCandidates = candidates.slice(offset, batchEnd);
      const batchResults = await this.dispatchBatch(query, batchCandidates, metric, dimensions);

      allResults.set(batchResults, offset);
      offset = batchEnd;
    }

    return allResults;
  }

  /**
   * Dispatch a single GPU compute batch.
   * @internal
   */
  private async dispatchBatch(
    query: Float32Array,
    candidates: Float32Array[],
    metric: DistanceFunction,
    dimensions: number,
  ): Promise<Float32Array> {
    const candidateCount = candidates.length;
    const pipeline = this.pipelines.get(metric)!;
    const bindGroupLayout = this.bindGroupLayouts.get(metric)!;

    // Pack candidate vectors into a contiguous Float32Array
    const packedCandidates = new Float32Array(candidateCount * dimensions);
    for (let i = 0; i < candidateCount; i++) {
      packedCandidates.set(candidates[i], i * dimensions);
    }

    // Create params buffer data (dimensions, candidate_count as u32)
    const params = new Uint32Array([dimensions, candidateCount]);

    // Acquire or allocate GPU buffers
    const queryBufferSize = query.byteLength;
    const candidateBufferSize = packedCandidates.byteLength;
    const resultBufferSize = candidateCount * 4; // Float32
    const paramsBufferSize = params.byteLength;

    const queryBuffer = this.acquireBuffer(queryBufferSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const candidateBuffer = this.acquireBuffer(candidateBufferSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const resultBuffer = this.acquireBuffer(resultBufferSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const paramsBuffer = this.acquireBuffer(paramsBufferSize, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const readbackBuffer = this.acquireBuffer(resultBufferSize, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);

    // Upload data to GPU
    this.device.queue.writeBuffer(queryBuffer, 0, query.buffer, query.byteOffset, query.byteLength);
    this.device.queue.writeBuffer(candidateBuffer, 0, packedCandidates.buffer, packedCandidates.byteOffset, packedCandidates.byteLength);
    this.device.queue.writeBuffer(paramsBuffer, 0, params.buffer, params.byteOffset, params.byteLength);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: queryBuffer, size: queryBufferSize } },
        { binding: 1, resource: { buffer: candidateBuffer, size: candidateBufferSize } },
        { binding: 2, resource: { buffer: resultBuffer, size: resultBufferSize } },
        { binding: 3, resource: { buffer: paramsBuffer, size: paramsBufferSize } },
      ],
    });

    // Dispatch compute shader
    const workgroupCount = Math.ceil(candidateCount / WORKGROUP_SIZE);
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupCount);
    passEncoder.end();

    // Copy results to readback buffer
    commandEncoder.copyBufferToBuffer(resultBuffer, 0, readbackBuffer, 0, resultBufferSize);

    // Submit and wait for results
    this.device.queue.submit([commandEncoder.finish()]);

    // Map readback buffer to read results
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readbackBuffer.getMappedRange().slice(0));
    readbackBuffer.unmap();

    // Return buffers to pool
    this.releaseBuffer(queryBuffer, queryBufferSize);
    this.releaseBuffer(candidateBuffer, candidateBufferSize);
    this.releaseBuffer(resultBuffer, resultBufferSize);
    this.releaseBuffer(paramsBuffer, paramsBufferSize);
    this.releaseBuffer(readbackBuffer, resultBufferSize);

    return resultData;
  }

  /**
   * Acquire a GPU buffer from the pool or allocate a new one.
   * @internal
   */
  private acquireBuffer(size: number, usage: GPUBufferUsageFlags): GPUBuffer {
    // Find a suitable buffer in the pool
    for (let i = 0; i < this.bufferPool.length; i++) {
      const entry = this.bufferPool[i];
      if (entry.size >= size && entry.buffer.usage === usage) {
        this.bufferPool.splice(i, 1);
        return entry.buffer;
      }
    }

    // Allocate a new buffer
    return this.device.createBuffer({ size, usage });
  }

  /**
   * Return a GPU buffer to the pool for reuse.
   * @internal
   */
  private releaseBuffer(buffer: GPUBuffer, size: number): void {
    if (this.disposed) {
      buffer.destroy();
      return;
    }
    this.bufferPool.push({ buffer, size });
  }

  /**
   * Attempt to recover the GPU device after it has been lost.
   * @internal
   */
  private async recoverDevice(): Promise<void> {
    try {
      // Clear old pool — buffers from a lost device are invalid
      this.bufferPool = [];

      const gpu = (navigator as any).gpu as GPU;
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        throw new Error('No adapter available');
      }

      const device = await adapter.requestDevice();
      this.device = device;

      // Re-compile pipelines
      const metrics: DistanceFunction[] = ['cosine', 'euclidean', 'dot'];
      for (const metric of metrics) {
        const shaderCode = getShaderSource(metric);
        const shaderModule = device.createShaderModule({ code: shaderCode });

        const bindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          ],
        });

        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        const pipeline = device.createComputePipeline({
          layout: pipelineLayout,
          compute: { module: shaderModule, entryPoint: 'main' },
        });

        this.pipelines.set(metric, pipeline);
        this.bindGroupLayouts.set(metric, bindGroupLayout);
      }

      this.deviceLost = false;

      // Re-register device lost listener
      this.device.lost.then((info) => {
        this.deviceLost = true;
        this.onFallback?.(`GPU device lost: ${info.message}`);
      });
    } catch {
      // Recovery failed — caller should fall back to CPU
      throw new LocalModeError(
        'Failed to recover GPU device after loss.',
        'GPU_RECOVERY_FAILED',
        { hint: 'The GPU device was lost and could not be re-acquired. Using CPU fallback.' },
      );
    }
  }

  /**
   * Release all GPU resources and mark the manager as disposed.
   *
   * After calling destroy(), subsequent `computeDistances()` calls will throw
   * a `LocalModeError` with code 'GPU_DESTROYED'.
   */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Destroy all pooled buffers
    for (const entry of this.bufferPool) {
      entry.buffer.destroy();
    }
    this.bufferPool = [];

    // Destroy the device
    this.device.destroy();
  }
}
