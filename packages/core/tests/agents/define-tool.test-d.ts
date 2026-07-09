/**
 * @fileoverview Type-level tests for defineTool() inference.
 *
 * Compiled by `tsc --noEmit` (not executed). Each @ts-expect-error line is a
 * REQUIRED failure — if the error disappears, the type contract regressed.
 */

import { defineTool, createToolRegistry, jsonSchema } from '../../src/index.js';
import type { ToolDefinition } from '../../src/index.js';

// Minimal zod-like schema stub (parse-based, matches jsonSchema()'s input shape)
function schemaOf<T>(): { parse: (v: unknown) => T } {
  return { parse: (v: unknown) => v as T };
}

// ── Inference: execute params are typed from the schema ────────────────
const calculator = defineTool({
  name: 'calculate',
  description: 'Evaluate a math expression',
  parameters: jsonSchema(schemaOf<{ expression: string }>()),
  execute: async ({ expression }) => expression.length,
});

// Result type flows through
const _resultCheck: ToolDefinition<{ expression: string }, number> = calculator;

const _badTool = defineTool({
  name: 'bad',
  description: 'Declares execute params the schema does not produce',
  // @ts-expect-error — schema type conflicts with execute's declared params
  parameters: jsonSchema(schemaOf<{ expression: string }>()),
  execute: async (params: { missing: boolean }) => params.missing,
});

// ── Mixed arrays: typed tools are usable where ToolDefinition[] is expected ──
const legacy: ToolDefinition = {
  name: 'legacy',
  description: 'Untyped legacy tool',
  parameters: jsonSchema(schemaOf<unknown>()),
  execute: async () => 'ok',
};

const registry = createToolRegistry([calculator, legacy]);
void registry;

const toolArray: ToolDefinition[] = [calculator, legacy];
void toolArray;
void _resultCheck;
void _badTool;
