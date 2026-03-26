import { describe, it, expect } from 'vitest';
import { mapFinishReason, convertPrompt } from '../src/utils.js';

describe('mapFinishReason', () => {
  it('maps "stop" to { unified: "stop", raw: "stop" }', () => {
    expect(mapFinishReason('stop')).toEqual({ unified: 'stop', raw: 'stop' });
  });

  it('maps "length" to { unified: "length", raw: "length" }', () => {
    expect(mapFinishReason('length')).toEqual({ unified: 'length', raw: 'length' });
  });

  it('maps "content_filter" to { unified: "content-filter", raw: "content_filter" }', () => {
    expect(mapFinishReason('content_filter')).toEqual({ unified: 'content-filter', raw: 'content_filter' });
  });

  it('maps "error" to { unified: "error", raw: "error" }', () => {
    expect(mapFinishReason('error')).toEqual({ unified: 'error', raw: 'error' });
  });

  it('maps unknown reasons to { unified: "other", raw: <original> }', () => {
    const result = mapFinishReason('something_new' as any);
    expect(result.unified).toBe('other');
    expect(result.raw).toBe('something_new');
  });

  it('always preserves the raw value', () => {
    expect(mapFinishReason('stop').raw).toBe('stop');
    expect(mapFinishReason('length').raw).toBe('length');
  });
});

describe('convertPrompt', () => {
  it('extracts system message as systemPrompt', () => {
    const result = convertPrompt([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
    expect(result.systemPrompt).toBe('You are helpful');
  });

  it('returns undefined systemPrompt when no system message', () => {
    const result = convertPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
    expect(result.systemPrompt).toBeUndefined();
  });

  it('extracts user messages', () => {
    const result = convertPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('extracts assistant messages', () => {
    const result = convertPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
    ]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('joins multiple text parts in a single message with newline', () => {
    const result = convertPrompt([
      { role: 'user', content: [
        { type: 'text', text: 'Line one' },
        { type: 'text', text: 'Line two' },
      ]},
    ]);
    expect(result.messages[0].content).toBe('Line one\nLine two');
  });

  it('filters out non-text parts (file parts) from user messages', () => {
    const result = convertPrompt([
      { role: 'user', content: [
        { type: 'text', text: 'Check this' },
        { type: 'file', mimeType: 'image/png', data: new Uint8Array() } as any,
      ]},
    ]);
    expect(result.messages[0].content).toBe('Check this');
  });

  it('skips user messages with only non-text parts', () => {
    const result = convertPrompt([
      { role: 'user', content: [
        { type: 'file', mimeType: 'image/png', data: new Uint8Array() } as any,
      ]},
    ]);
    expect(result.messages).toHaveLength(0);
  });

  it('ignores tool role messages', () => {
    const result = convertPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'x', toolName: 'y', output: {} }] } as any,
    ]);
    expect(result.messages).toHaveLength(1);
  });

  it('builds prompt string from last user message', () => {
    const result = convertPrompt([
      { role: 'user', content: [{ type: 'text', text: 'First' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
      { role: 'user', content: [{ type: 'text', text: 'Second' }] },
    ]);
    expect(result.prompt).toBe('Second');
  });

  it('returns empty prompt string when no user messages', () => {
    const result = convertPrompt([
      { role: 'system', content: 'Be helpful' },
    ]);
    expect(result.prompt).toBe('');
  });

  it('handles empty prompt array', () => {
    const result = convertPrompt([]);
    expect(result.systemPrompt).toBeUndefined();
    expect(result.messages).toEqual([]);
    expect(result.prompt).toBe('');
  });

  it('handles multi-turn conversation', () => {
    const result = convertPrompt([
      { role: 'system', content: 'You are a bot' },
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Good!' }] },
    ]);
    expect(result.systemPrompt).toBe('You are a bot');
    expect(result.messages).toHaveLength(4);
    expect(result.prompt).toBe('How are you?');
  });
});
