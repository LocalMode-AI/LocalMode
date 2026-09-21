/**
 * The run overlay's retry line is read by study participants: one plain
 * sentence per retry, never a driver path or a stack fragment.
 */
import { describe, expect, it } from 'vitest';
import { describeRetryCause } from '../src/lib/bench/overlay-text';

describe('describeRetryCause()', () => {
  it('names a lost GPU device without the Dawn source path', () => {
    const message =
      "Failed to execute 'requestDevice' on 'GPUAdapter': D3D12 create command queue failed with DXGI_ERROR_DEVICE_REMOVED (0x887A0005)\n    at CheckHRESULTImpl (..\\..\\third_party\\dawn\\src\\dawn\\native\\d3d\\D3DError.cpp:119)";
    const text = describeRetryCause({ name: 'OperationError', message });
    expect(text).toBe('the GPU device was lost');
    expect(text).not.toMatch(/dawn|CheckHRESULT|third_party/);
  });

  it('names the memory, download, and stall cases', () => {
    expect(describeRetryCause({ name: 'Error', message: "Can't create a session. ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc" })).toBe('the browser ran out of memory');
    expect(describeRetryCause({ name: 'RangeError', message: 'Array buffer allocation failed' })).toBe('the browser ran out of memory');
    expect(describeRetryCause({ name: 'ModelLoadError', message: 'Failed to load model: X', cause: 'ggml_aligned_malloc: insufficient memory (attempted to allocate 157.81 MB)' })).toBe('the browser ran out of memory');
    expect(describeRetryCause({ name: 'TypeError', message: 'Failed to fetch' })).toBe('a download failed');
    expect(describeRetryCause({ name: 'TimeoutError', message: 'load made no progress for 180000 ms' })).toBe('the model load stalled');
    expect(describeRetryCause({ name: 'TimeoutError', message: 'quality lane: no stream progress for 120000 ms' })).toBe('the step stalled');
  });

  it('falls back to the first line of an unknown error, trimmed of stack fragments and capped', () => {
    const text = describeRetryCause({ name: 'RuntimeError', message: `${'x'.repeat(120)}\n    at wasm-func[866] (__wrap_abort)` });
    expect(text.startsWith('RuntimeError: ')).toBe(true);
    expect(text.length).toBeLessThanOrEqual('RuntimeError: '.length + 88);
    expect(text).not.toContain('wasm-func');
    expect(describeRetryCause({ name: 'ModelLoadError', message: 'Failed to load model: SmolLM2 at 12:00' })).toBe('ModelLoadError: Failed to load model: SmolLM2 at 12:00');
    expect(describeRetryCause({ name: 'Error', message: 'boom at run (engine.js:1)' })).toBe('Error: boom');
  });
});
