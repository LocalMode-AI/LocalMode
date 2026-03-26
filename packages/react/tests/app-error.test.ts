import { describe, it, expect } from 'vitest';
import { toAppError } from '../src/core/app-error';

describe('toAppError', () => {
  it('returns null for null input', () => {
    expect(toAppError(null)).toBeNull();
  });

  it('converts Error to AppError with default recoverable=true', () => {
    const result = toAppError(new Error('something failed'));
    expect(result).toEqual({ message: 'something failed', recoverable: true });
  });

  it('respects explicit recoverable=false', () => {
    const result = toAppError(new Error('fatal'), false);
    expect(result).toEqual({ message: 'fatal', recoverable: false });
  });

  it('preserves error message', () => {
    const result = toAppError(new Error('custom message'));
    expect(result?.message).toBe('custom message');
  });
});
