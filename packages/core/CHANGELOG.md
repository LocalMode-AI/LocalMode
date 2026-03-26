# @localmode/core

## 2.0.0

### Major Changes

- Agent framework with ReAct loop, tool registry, and VectorDB-backed memory
- Evaluation SDK with accuracy, F1, ROUGE, BLEU, NDCG, MRR metrics
- Pipeline builder with composable multi-step workflows and pre-built step factories
- Inference queue with priority-based scheduling and concurrency control
- Model cache with chunked IndexedDB downloads, LRU eviction, and cross-tab coordination
- WebGPU-accelerated vector distance via WGSL compute shaders
- Import/export adapters for Pinecone, ChromaDB, CSV, and JSONL formats
- Structured output with `generateObject()`, `streamObject()`, and Zod schema support
- Language model middleware with `wrapLanguageModel()` and `composeLanguageModelMiddleware()`
- Semantic cache middleware for LLM response caching via embedding similarity
- Scalar (SQ8) and product quantization (PQ) for 4-32x vector compression
- Storage compression with `compressVectors()` and `decompressVectors()`
- Differential privacy middleware for embeddings and classification
- Multimodal embeddings with `embedImage()` and CLIP support
- Embedding drift detection with model fingerprinting and automatic reindexing
- Threshold calibration from corpus sampling with per-model presets
- Adaptive batch sizing via `computeOptimalBatchSize()`
- Model registry with device-aware recommendations via `recommendModels()`
- Semantic chunking via embedding cosine similarity for topic-boundary detection
- Typed VectorDB metadata with generic type parameter and Zod schema validation
- Audio classification and depth estimation functions
- **Breaking**: `ChatMessage.content` is now `string | ContentPart[]`
- **Breaking**: `StorageAdapter` requires new `updateCollection()` method
- **Breaking**: `jsonSchema()` signature updated for Zod 4 compatibility

## 1.0.2

### Patch Changes

- bump to v1.0.2

## 1.0.1

### Patch Changes

- d311bd7: update package metadata and readme files
