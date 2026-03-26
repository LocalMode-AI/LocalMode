import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFile } from '../src/helpers/validate-file.js';
import { readFileAsDataUrl } from '../src/helpers/read-file.js';
import { downloadBlob } from '../src/helpers/download.js';

describe('validateFile', () => {
  const createFile = (type: string, size: number): File => {
    const content = new ArrayBuffer(size);
    return new File([content], 'test.bin', { type });
  };

  it('returns null for valid file', () => {
    const file = createFile('image/png', 1000);
    const result = validateFile({
      file,
      accept: ['image/png', 'image/jpeg'],
      maxSize: 10_000_000,
    });
    expect(result).toBeNull();
  });

  it('returns error for invalid file type', () => {
    const file = createFile('text/plain', 100);
    const result = validateFile({
      file,
      accept: ['image/png'],
    });
    expect(result).not.toBeNull();
    expect(result!.message).toContain('text/plain');
    expect(result!.recoverable).toBe(true);
  });

  it('returns error for file exceeding max size', () => {
    const file = createFile('image/png', 5_000_000);
    const result = validateFile({
      file,
      maxSize: 1_000_000,
    });
    expect(result).not.toBeNull();
    expect(result!.message).toContain('too large');
    expect(result!.recoverable).toBe(true);
  });

  it('returns null when no constraints provided', () => {
    const file = createFile('application/octet-stream', 999_999_999);
    const result = validateFile({ file });
    expect(result).toBeNull();
  });

  it('checks only type when maxSize is not provided', () => {
    const file = createFile('image/jpeg', 999_999_999);
    const result = validateFile({
      file,
      accept: ['image/jpeg'],
    });
    expect(result).toBeNull();
  });

  it('checks only size when accept is not provided', () => {
    const file = createFile('application/pdf', 500);
    const result = validateFile({
      file,
      maxSize: 1000,
    });
    expect(result).toBeNull();
  });
});

describe('readFileAsDataUrl', () => {
  it('reads a file as data URL', async () => {
    const content = 'hello world';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const result = await readFileAsDataUrl(file);
    expect(result).toMatch(/^data:text\/plain;base64,/);
  });

  it('rejects when FileReader encounters an error', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    // Mock FileReader to simulate error
    const OriginalFileReader = globalThis.FileReader;
    const mockError = new DOMException('Read failed', 'NotReadableError');
    globalThis.FileReader = class extends OriginalFileReader {
      readAsDataURL() {
        setTimeout(() => {
          Object.defineProperty(this, 'error', { value: mockError });
          this.onerror?.(new ProgressEvent('error'));
        }, 0);
      }
    } as unknown as typeof FileReader;

    await expect(readFileAsDataUrl(file)).rejects.toBe(mockError);

    globalThis.FileReader = OriginalFileReader;
  });
});

describe('downloadBlob', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAnchor = { href: '', download: '', click: vi.fn() };
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('downloads string content', () => {
    downloadBlob('hello', 'test.txt');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(mockAnchor.download).toBe('test.txt');
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('downloads blob content', () => {
    const blob = new Blob(['data'], { type: 'audio/webm' });
    downloadBlob(blob, 'recording.webm', 'audio/webm');

    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    expect(mockAnchor.download).toBe('recording.webm');
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
  });
});
