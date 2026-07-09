# @localmode/localforage

## 2.0.1

### Added

- Test suite now runs core's `createStorageAdapterConformanceSuite()` — the shared StorageAdapter contract cases: full-`Collection` fidelity, document/vector/index ops, close→reopen persistence, and SQ8 fidelity after reopen.

### Fixed

- Collection writes/reads now persist the **full `Collection` object** instead of cherry-picking `{ id, name, dimensions, createdAt }`. The dropped extended fields (`modelFingerprint`, `calibration`, `pqCodebook`, `compressionCalibration`, `deltaCalibration`, `compression`) round-tripped in-session but were lost after a close→reopen, corrupting quantized or compressed vectors and silently disabling drift detection. Data written with quantization/compression by earlier versions is unrecoverable — `clear()` and re-ingest. (Under the localStorage **fallback** driver, typed arrays nested in calibration data are JSON-serialized and still degrade; the default IndexedDB driver is unaffected.)
- SQ8/PQ-compressed `Uint8Array` vector payloads now round-trip with their type intact via a new `dtype` discriminator. Previously `getVector()`/`getAllVectors()` always rebuilt payloads as `Float32Array`, silently corrupting compressed vectors.

### Backward Compatibility

- Vectors written by earlier versions (no `dtype` field) still read back as `Float32Array`, and pre-existing collection records load unchanged. No migration needed for non-quantized data.

## 2.0.0

### Major Changes

- Added `updateCollection()` method to implement updated `StorageAdapter` interface
- Full test coverage
- **Breaking**: Implements new `StorageAdapter` interface requiring `updateCollection()`

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
