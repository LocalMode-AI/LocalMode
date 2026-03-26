import { describe, it, expect } from 'vitest';
import * as aiSdk from '../src/index.js';

describe('@localmode/ai-sdk exports', () => {
  it('exports createLocalMode', () => {
    expect(typeof aiSdk.createLocalMode).toBe('function');
  });

  it('exports LocalModeLanguageModel', () => {
    expect(typeof aiSdk.LocalModeLanguageModel).toBe('function');
  });

  it('exports LocalModeEmbeddingModel', () => {
    expect(typeof aiSdk.LocalModeEmbeddingModel).toBe('function');
  });

  it('exports mapFinishReason', () => {
    expect(typeof aiSdk.mapFinishReason).toBe('function');
  });

  it('exports convertPrompt', () => {
    expect(typeof aiSdk.convertPrompt).toBe('function');
  });

  it('does not export unexpected values', () => {
    const exportedKeys = Object.keys(aiSdk);
    expect(exportedKeys.sort()).toEqual([
      'LocalModeEmbeddingModel',
      'LocalModeLanguageModel',
      'convertPrompt',
      'createLocalMode',
      'mapFinishReason',
    ]);
  });
});
