/**
 * @file agent.service.ts
 * @description Model factory and tool definitions for the research agent
 */
import { webllm } from '@localmode/webllm';
import { jsonSchema } from '@localmode/core';
import type { ToolDefinition } from '@localmode/core';
import { MODEL_ID, KNOWLEDGE_BASE } from '../_lib/constants';
import type { ResearchNote } from '../_lib/types';

/** Cached model instance */
let model: ReturnType<typeof webllm.languageModel> | null = null;

/** Get or create the language model instance */
export function getModel() {
  if (!model) {
    model = webllm.languageModel(MODEL_ID);
  }
  return model;
}

/**
 * Create tool definitions for the research agent.
 * Returns fresh tool instances with their own state (notes accumulator).
 */
export function createTools(): { tools: ToolDefinition[]; getNotes: () => ResearchNote[] } {
  const notes: ResearchNote[] = [];

  /** Search tool — finds relevant articles from the knowledge base */
  const searchTool: ToolDefinition = {
    name: 'search',
    description: 'Search the knowledge base for articles relevant to a query. Returns titles and content snippets.',
    parameters: createSearchSchema(),
    execute: async (params: unknown) => {
      const { query, maxResults } = params as { query: string; maxResults?: number };
      const limit = maxResults ?? 3;
      // Simple keyword matching for the showcase (real app would use embeddings)
      const queryWords = query.toLowerCase().split(/\s+/);
      const scored = KNOWLEDGE_BASE.map((article) => {
        const text = `${article.title} ${article.content}`.toLowerCase();
        const score = queryWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
        return { article, score };
      });

      const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
          title: s.article.title,
          content: s.article.content,
          category: s.article.category,
        }));

      if (results.length === 0) {
        return 'No relevant articles found. Try different search terms.';
      }

      return results.map((r) => `[${r.title}] (${r.category})\n${r.content}`).join('\n\n');
    },
  };

  /** Notes tool — accumulate research findings */
  const notesTool: ToolDefinition = {
    name: 'note',
    description: 'Save a research finding or key insight as a note. Use this to accumulate knowledge before writing the final answer.',
    parameters: createNoteSchema(),
    execute: async (params: unknown) => {
      const { text, source } = params as { text: string; source?: string };
      notes.push({
        text,
        source: source ?? 'research',
        timestamp: Date.now(),
      });
      return `Note saved (${notes.length} total notes).`;
    },
  };

  /** Calculate tool — evaluate simple math expressions */
  const calculateTool: ToolDefinition = {
    name: 'calculate',
    description: 'Evaluate a mathematical expression or perform a simple calculation. Returns the numeric result.',
    parameters: createCalculateSchema(),
    execute: async (params: unknown) => {
      const { expression } = params as { expression: string };
      try {
        // Safe evaluation: only allow numbers and basic math operators
        const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
        if (!sanitized.trim()) {
          return 'Invalid expression. Use numbers and operators: + - * / ()';
        }
        // Use Function constructor for basic math (no eval)
        const result = new Function(`return (${sanitized})`)() as number;
        return String(result);
      } catch {
        return `Could not evaluate: ${expression}`;
      }
    },
  };

  return {
    tools: [searchTool, notesTool, calculateTool],
    getNotes: () => [...notes],
  };
}

/**
 * Schema factories using duck-typed Zod-compatible schemas.
 * These produce ObjectSchema instances without importing Zod,
 * matching the jsonSchema() adapter pattern.
 */

function createSearchSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "query" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.query !== 'string' || !obj.query) {
        throw new Error('"query" must be a non-empty string');
      }
      return {
        query: obj.query as string,
        maxResults: typeof obj.maxResults === 'number' ? obj.maxResults : 3,
      };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 3)' },
      },
      required: ['query'],
    },
    description: 'Search parameters',
  };
}

function createNoteSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "text" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.text !== 'string' || !obj.text) {
        throw new Error('"text" must be a non-empty string');
      }
      return {
        text: obj.text as string,
        source: typeof obj.source === 'string' ? obj.source : undefined,
      };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The note content to save' },
        source: { type: 'string', description: 'Source of the information' },
      },
      required: ['text'],
    },
    description: 'Note parameters',
  };
}

function createCalculateSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "expression" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.expression !== 'string' || !obj.expression) {
        throw new Error('"expression" must be a non-empty string');
      }
      return { expression: obj.expression as string };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate' },
      },
      required: ['expression'],
    },
    description: 'Calculation parameters',
  };
}
