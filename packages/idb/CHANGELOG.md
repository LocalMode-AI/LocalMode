# @localmode/idb

## 2.0.2

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.0.1

### Added

- Test suite now runs core's `createStorageAdapterConformanceSuite()` — the shared StorageAdapter contract cases: full-`Collection` fidelity, document/vector/index ops, close→reopen persistence, and SQ8 fidelity after reopen.

### Fixed

- Collection writes/reads now persist the **full `Collection` object** instead of cherry-picking `{ id, name, dimensions, createdAt }`. The dropped extended fields (`modelFingerprint`, `calibration`, `pqCodebook`, `compressionCalibration`, `deltaCalibration`, `compression`) round-tripped in-session but decoded as raw bytes after a close→reopen, corrupting quantized or compressed vectors and silently disabling drift detection. Data written with quantization/compression by earlier versions is unrecoverable — `clear()` and re-ingest.
- SQ8/PQ-compressed `Uint8Array` vector payloads are now stored and read with their type preserved. Previously `addVector()` reinterpreted every payload as f32, throwing a `RangeError` and making compression unusable with this adapter.

### Backward Compatibility

- Vectors written by earlier versions (raw `ArrayBuffer` of f32 data) still read back as `Float32Array`, and pre-existing collection records load unchanged. No migration needed for non-quantized data.

## 2.0.0

### Major Changes

- Added `updateCollection()` method to implement updated `StorageAdapter` interface
- Full test coverage
- **Breaking**: Implements new `StorageAdapter` interface requiring `updateCollection()`

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
