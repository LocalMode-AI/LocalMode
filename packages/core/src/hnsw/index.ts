/**
 * HNSW (Hierarchical Navigable Small World) index implementation.
 * Pure TypeScript, no external dependencies.
 *
 * Based on the paper: "Efficient and robust approximate nearest neighbor search
 * using Hierarchical Navigable Small World graphs" by Malkov & Yashunin (2016).
 */

import type { HNSWOptions, SerializedHNSWIndex } from '../types.js';
import { getDistanceFunction, distanceToScore, type DistanceFunction } from './distance.js';

interface HNSWNode {
  id: string;
  level: number;
  connections: Map<number, Set<string>>; // level -> connected node IDs
}

interface SearchCandidate {
  id: string;
  distance: number;
}

/**
 * Priority queue for nearest neighbor search.
 * Min-heap implementation for efficient retrieval of closest elements.
 */
class MinHeap {
  private heap: SearchCandidate[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(candidate: SearchCandidate): void {
    this.heap.push(candidate);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): SearchCandidate | undefined {
    if (this.heap.length === 0) return undefined;

    const min = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return min;
  }

  peek(): SearchCandidate | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].distance <= this.heap[index].distance) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild].distance < this.heap[smallest].distance) {
        smallest = leftChild;
      }

      if (rightChild < length && this.heap[rightChild].distance < this.heap[smallest].distance) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

/**
 * Max-heap for maintaining the furthest k candidates.
 */
class MaxHeap {
  private heap: SearchCandidate[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(candidate: SearchCandidate): void {
    this.heap.push(candidate);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): SearchCandidate | undefined {
    if (this.heap.length === 0) return undefined;

    const max = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return max;
  }

  peek(): SearchCandidate | undefined {
    return this.heap[0];
  }

  toArray(): SearchCandidate[] {
    return [...this.heap].sort((a, b) => a.distance - b.distance);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].distance >= this.heap[index].distance) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      if (leftChild < length && this.heap[leftChild].distance > this.heap[largest].distance) {
        largest = leftChild;
      }

      if (rightChild < length && this.heap[rightChild].distance > this.heap[largest].distance) {
        largest = rightChild;
      }

      if (largest === index) break;

      [this.heap[largest], this.heap[index]] = [this.heap[index], this.heap[largest]];
      index = largest;
    }
  }
}

export class HNSWIndex {
  private nodes: Map<string, HNSWNode> = new Map();
  private vectors: Map<string, Float32Array> = new Map();
  private entryPointId: string | null = null;
  private maxLevel = 0;

  private readonly m: number; // Max connections per node
  private readonly mMax: number; // Max connections for layer 0
  private readonly efConstruction: number;
  private efSearch: number;
  private readonly distanceType: DistanceFunction;
  private readonly distanceFn: (a: Float32Array, b: Float32Array) => number;

  constructor(private dimensions: number, options: HNSWOptions = {}) {
    this.m = options.m ?? 16;
    this.mMax = this.m * 2; // Layer 0 has 2x connections
    this.efConstruction = options.efConstruction ?? 200;
    this.efSearch = options.efSearch ?? 50;
    this.distanceType = options.distanceFunction ?? 'cosine';
    this.distanceFn = getDistanceFunction(this.distanceType);
  }

  /**
   * Get the number of vectors in the index.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Set the efSearch parameter for queries.
   */
  setEfSearch(ef: number): void {
    this.efSearch = ef;
  }

  /**
   * Generate a random level for a new node.
   * Higher levels are exponentially less likely.
   */
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < 1 / this.m && level < 32) {
      level++;
    }
    return level;
  }

  /**
   * Add a vector to the index.
   */
  add(id: string, vector: Float32Array): void {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }

    // Check if already exists
    if (this.nodes.has(id)) {
      // Update existing vector
      this.vectors.set(id, vector);
      return;
    }

    const level = this.randomLevel();
    const node: HNSWNode = {
      id,
      level,
      connections: new Map(),
    };

    // Initialize connection sets for each level
    for (let l = 0; l <= level; l++) {
      node.connections.set(l, new Set());
    }

    this.nodes.set(id, node);
    this.vectors.set(id, vector);

    // First node becomes entry point
    if (this.entryPointId === null) {
      this.entryPointId = id;
      this.maxLevel = level;
      return;
    }

    let currNodeId = this.entryPointId;

    // Search from top layer to node's level + 1
    for (let l = this.maxLevel; l > level; l--) {
      currNodeId = this.searchLayer(vector, currNodeId, 1, l)[0]?.id ?? currNodeId;
    }

    // Insert into layers level down to 0
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const neighbors = this.searchLayer(vector, currNodeId, this.efConstruction, l);
      const selectedNeighbors = this.selectNeighbors(vector, neighbors, l === 0 ? this.mMax : this.m);

      // Connect new node to selected neighbors
      const nodeConnections = node.connections.get(l)!;
      for (const neighbor of selectedNeighbors) {
        nodeConnections.add(neighbor.id);

        // Connect neighbors back to new node
        const neighborNode = this.nodes.get(neighbor.id)!;
        let neighborConnections = neighborNode.connections.get(l);
        if (!neighborConnections) {
          neighborConnections = new Set();
          neighborNode.connections.set(l, neighborConnections);
        }
        neighborConnections.add(id);

        // Prune if necessary
        const maxConnections = l === 0 ? this.mMax : this.m;
        if (neighborConnections.size > maxConnections) {
          this.pruneConnections(neighbor.id, l, maxConnections);
        }
      }

      if (neighbors.length > 0) {
        currNodeId = neighbors[0].id;
      }
    }

    // Update entry point if new node has higher level
    if (level > this.maxLevel) {
      this.entryPointId = id;
      this.maxLevel = level;
    }
  }

  /**
   * Search for the k nearest neighbors.
   */
  search(query: Float32Array, k: number): Array<{ id: string; score: number }> {
    if (query.length !== this.dimensions) {
      throw new Error(`Query dimension mismatch: expected ${this.dimensions}, got ${query.length}`);
    }

    if (this.entryPointId === null) {
      return [];
    }

    let currNodeId = this.entryPointId;

    // Traverse from top layer to layer 1
    for (let l = this.maxLevel; l > 0; l--) {
      const result = this.searchLayer(query, currNodeId, 1, l);
      if (result.length > 0) {
        currNodeId = result[0].id;
      }
    }

    // Search layer 0 with efSearch candidates
    const candidates = this.searchLayer(query, currNodeId, Math.max(k, this.efSearch), 0);

    // Return top k results with scores
    return candidates.slice(0, k).map((c) => ({
      id: c.id,
      score: distanceToScore(c.distance, this.distanceType),
    }));
  }

  /**
   * Remove a vector from the index.
   * Uses tombstone approach - marks for deletion but doesn't remove connections.
   */
  delete(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove from vectors (effectively marks as deleted)
    this.vectors.delete(id);
    this.nodes.delete(id);

    // Remove connections to this node from all neighbors
    for (const [level, connections] of node.connections) {
      for (const neighborId of connections) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.connections.get(level)?.delete(id);
        }
      }
    }

    // If we deleted the entry point, find a new one
    if (this.entryPointId === id) {
      this.entryPointId = this.nodes.size > 0 ? this.nodes.keys().next().value ?? null : null;
      if (this.entryPointId) {
        this.maxLevel = this.nodes.get(this.entryPointId)!.level;
      } else {
        this.maxLevel = 0;
      }
    }

    return true;
  }

  /**
   * Check if a vector exists in the index.
   */
  has(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Get a vector by ID.
   */
  getVector(id: string): Float32Array | undefined {
    return this.vectors.get(id);
  }

  /**
   * Search a single layer of the graph.
   */
  private searchLayer(
    query: Float32Array,
    entryId: string,
    ef: number,
    level: number
  ): SearchCandidate[] {
    const visited = new Set<string>([entryId]);
    const entryVector = this.vectors.get(entryId);

    if (!entryVector) {
      return [];
    }

    const entryDist = this.distanceFn(query, entryVector);
    const candidates = new MinHeap();
    const results = new MaxHeap();

    candidates.push({ id: entryId, distance: entryDist });
    results.push({ id: entryId, distance: entryDist });

    while (candidates.size > 0) {
      const current = candidates.pop()!;

      // If current is further than the furthest result, we're done
      if (results.size >= ef && current.distance > results.peek()!.distance) {
        break;
      }

      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;

      const connections = currentNode.connections.get(level);
      if (!connections) continue;

      for (const neighborId of connections) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborVector = this.vectors.get(neighborId);
        if (!neighborVector) continue;

        const neighborDist = this.distanceFn(query, neighborVector);

        // Add to results if better than current worst or results not full
        if (results.size < ef || neighborDist < results.peek()!.distance) {
          candidates.push({ id: neighborId, distance: neighborDist });
          results.push({ id: neighborId, distance: neighborDist });

          // Keep only ef best results
          if (results.size > ef) {
            results.pop();
          }
        }
      }
    }

    return results.toArray();
  }

  /**
   * Select the best neighbors using simple distance-based selection.
   */
  private selectNeighbors(
    _query: Float32Array,
    candidates: SearchCandidate[],
    maxConnections: number
  ): SearchCandidate[] {
    // Simple selection: take the closest neighbors
    return candidates.slice(0, maxConnections);
  }

  /**
   * Prune connections for a node to maintain the max connections limit.
   */
  private pruneConnections(nodeId: string, level: number, maxConnections: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const connections = node.connections.get(level);
    if (!connections || connections.size <= maxConnections) return;

    const nodeVector = this.vectors.get(nodeId);
    if (!nodeVector) return;

    // Score all connections by distance and keep the best
    const scored: SearchCandidate[] = [];
    for (const connId of connections) {
      const connVector = this.vectors.get(connId);
      if (connVector) {
        scored.push({
          id: connId,
          distance: this.distanceFn(nodeVector, connVector),
        });
      }
    }

    scored.sort((a, b) => a.distance - b.distance);

    const newConnections = new Set<string>();
    for (let i = 0; i < Math.min(maxConnections, scored.length); i++) {
      newConnections.add(scored[i].id);
    }

    node.connections.set(level, newConnections);
  }

  /**
   * Serialize the index to a JSON-compatible object.
   */
  serialize(): SerializedHNSWIndex {
    const nodes: SerializedHNSWIndex['nodes'] = [];

    for (const [id, node] of this.nodes) {
      const connections: Array<[number, string[]]> = [];
      for (const [level, conns] of node.connections) {
        connections.push([level, Array.from(conns)]);
      }
      nodes.push({ id, level: node.level, connections });
    }

    return {
      version: 1,
      dimensions: this.dimensions,
      m: this.m,
      efConstruction: this.efConstruction,
      entryPointId: this.entryPointId,
      maxLevel: this.maxLevel,
      nodes,
    };
  }

  /**
   * Deserialize an index from a JSON object.
   */
  static deserialize(
    data: SerializedHNSWIndex,
    vectors: Map<string, Float32Array>,
    options?: HNSWOptions
  ): HNSWIndex {
    const index = new HNSWIndex(data.dimensions, {
      m: data.m,
      efConstruction: data.efConstruction,
      ...options,
    });

    index.entryPointId = data.entryPointId;
    index.maxLevel = data.maxLevel;
    index.vectors = vectors;

    for (const nodeData of data.nodes) {
      const node: HNSWNode = {
        id: nodeData.id,
        level: nodeData.level,
        connections: new Map(),
      };

      for (const [level, conns] of nodeData.connections) {
        node.connections.set(level, new Set(conns));
      }

      index.nodes.set(nodeData.id, node);
    }

    return index;
  }

  /**
   * Clear all data from the index.
   */
  clear(): void {
    this.nodes.clear();
    this.vectors.clear();
    this.entryPointId = null;
    this.maxLevel = 0;
  }
}

