/**
 * @file tools.test.ts
 * @description Unit tests for createToolRegistry()
 */
import { describe, it, expect } from 'vitest';
import { createToolRegistry } from '../../src/agents/tools.js';
import { createMockTool } from '../../src/testing/index.js';

function createSearchTool() {
  return {
    name: 'search',
    description: 'Search the knowledge base',
    parameters: {
      parse: (value: unknown) => {
        const obj = value as Record<string, unknown>;
        if (typeof obj?.query !== 'string') throw new Error('"query" must be a string');
        return { query: obj.query };
      },
      jsonSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
    execute: async ({ query }: { query: string }) => `Results for: ${query}`,
  };
}

function createNoteTool() {
  return {
    name: 'note',
    description: 'Save a note',
    parameters: {
      parse: (value: unknown) => {
        const obj = value as Record<string, unknown>;
        if (typeof obj?.text !== 'string') throw new Error('"text" must be a string');
        return { text: obj.text };
      },
      jsonSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    execute: async ({ text }: { text: string }) => `Saved: ${text}`,
  };
}

describe('createToolRegistry()', () => {
  it('creates a registry with valid tools', () => {
    const registry = createToolRegistry([createSearchTool(), createNoteTool()]);
    expect(registry.names()).toEqual(['search', 'note']);
  });

  it('rejects duplicate tool names', () => {
    const tool1 = createSearchTool();
    const tool2 = createSearchTool();
    expect(() => createToolRegistry([tool1, tool2])).toThrow('Duplicate tool name');
  });

  it('creates an empty registry', () => {
    const registry = createToolRegistry([]);
    expect(registry.names()).toEqual([]);
  });

  describe('get()', () => {
    it('returns tool by name', () => {
      const registry = createToolRegistry([createSearchTool()]);
      const tool = registry.get('search');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('search');
    });

    it('returns undefined for unknown tool', () => {
      const registry = createToolRegistry([createSearchTool()]);
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('returns true for registered tool', () => {
      const registry = createToolRegistry([createSearchTool()]);
      expect(registry.has('search')).toBe(true);
    });

    it('returns false for unknown tool', () => {
      const registry = createToolRegistry([createSearchTool()]);
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('names()', () => {
    it('lists all tool names', () => {
      const registry = createToolRegistry([createSearchTool(), createNoteTool()]);
      expect(registry.names()).toEqual(['search', 'note']);
    });
  });

  describe('descriptions()', () => {
    it('returns structured tool info for prompt construction', () => {
      const registry = createToolRegistry([createSearchTool()]);
      const descs = registry.descriptions();
      expect(descs).toHaveLength(1);
      expect(descs[0].name).toBe('search');
      expect(descs[0].description).toBe('Search the knowledge base');
      expect(descs[0].parameters).toHaveProperty('type', 'object');
    });
  });

  describe('validate()', () => {
    it('validates correct arguments', () => {
      const registry = createToolRegistry([createSearchTool()]);
      const result = registry.validate('search', { query: 'test' });
      expect(result).toEqual({ query: 'test' });
    });

    it('throws on invalid arguments', () => {
      const registry = createToolRegistry([createSearchTool()]);
      expect(() => registry.validate('search', { query: 123 })).toThrow();
    });

    it('throws on unknown tool with hint', () => {
      const registry = createToolRegistry([createSearchTool()]);
      try {
        registry.validate('nonexistent', {});
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Unknown tool');
        expect((error as Error).message).toContain('nonexistent');
      }
    });
  });

  describe('execute()', () => {
    it('validates and executes a tool with valid args', async () => {
      const registry = createToolRegistry([createSearchTool()]);
      const context = { abortSignal: new AbortController().signal, stepIndex: 0 };
      const result = await registry.execute('search', { query: 'quantum' }, context);
      expect(result).toBe('Results for: quantum');
    });

    it('throws on invalid args', async () => {
      const registry = createToolRegistry([createSearchTool()]);
      const context = { abortSignal: new AbortController().signal, stepIndex: 0 };
      await expect(registry.execute('search', { query: 123 }, context)).rejects.toThrow();
    });

    it('throws on unknown tool', async () => {
      const registry = createToolRegistry([createSearchTool()]);
      const context = { abortSignal: new AbortController().signal, stepIndex: 0 };
      await expect(registry.execute('nonexistent', {}, context)).rejects.toThrow('Unknown tool');
    });
  });

  describe('createMockTool()', () => {
    it('creates a working mock tool', async () => {
      const mock = createMockTool('test', 'mock result');
      expect(mock.name).toBe('test');
      const result = await mock.execute({}, { abortSignal: new AbortController().signal, stepIndex: 0 });
      expect(result).toBe('mock result');
    });
  });
});
