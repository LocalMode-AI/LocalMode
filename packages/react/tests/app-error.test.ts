import { describe, it, expect } from 'vitest';
import { LocalModeError } from '@localmode/core';
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

  it('populates code and appends hint for LocalModeError', () => {
    const error = new LocalModeError('Model failed to load', 'MODEL_LOAD_ERROR', {
      hint: 'Check your network connection and try again',
    });
    expect(toAppError(error)).toEqual({
      message: 'Model failed to load — Check your network connection and try again',
      code: 'MODEL_LOAD_ERROR',
      recoverable: true,
    });
  });

  it('populates code without altering the message when hint is absent', () => {
    const error = new LocalModeError('Quota exceeded', 'QUOTA_EXCEEDED');
    expect(toAppError(error)).toEqual({
      message: 'Quota exceeded',
      code: 'QUOTA_EXCEEDED',
      recoverable: true,
    });
  });

  it('respects recoverable=false for LocalModeError', () => {
    const error = new LocalModeError('Fatal', 'FATAL_ERROR', { hint: 'Reload the page' });
    expect(toAppError(error, false)).toEqual({
      message: 'Fatal — Reload the page',
      code: 'FATAL_ERROR',
      recoverable: false,
    });
  });

  it('leaves plain Error without a code', () => {
    const result = toAppError(new Error('plain failure'));
    expect(result?.code).toBeUndefined();
    expect(result?.message).toBe('plain failure');
  });
});
