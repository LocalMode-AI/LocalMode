/**
 * Schema Utilities for Structured Output
 *
 * Zero-dependency utilities for converting Zod schemas to JSON Schema,
 * constructing schema-aware prompts, and extracting/parsing JSON from LLM output.
 *
 * @packageDocumentation
 */

import type { ObjectSchema, ObjectOutputMode } from './types.js';

// ═══════════════════════════════════════════════════════════════
// SCHEMA ADAPTER
// ═══════════════════════════════════════════════════════════════

/**
 * Duck-typed Zod-like schema interface.
 * Reads internal Zod structure without importing Zod.
 */
interface ZodLike<T = unknown> {
  parse: (value: unknown) => T;
  _def?: {
    typeName?: string;
    description?: string;
    shape?: () => Record<string, ZodLike>;
    type?: ZodLike;
    innerType?: ZodLike;
    options?: ZodLike[];
    values?: readonly string[];
    value?: unknown;
    checks?: Array<{ kind: string; value?: unknown }>;
  };
  shape?: Record<string, ZodLike>;
  description?: string;
}

/**
 * Convert a Zod schema to an ObjectSchema for structured output.
 *
 * Uses duck-typing to read Zod's internal structure — no Zod import needed.
 * Core stays zero-dependency; users bring their own Zod.
 *
 * @param zodSchema - A Zod schema object (z.object(), z.array(), etc.)
 * @returns An ObjectSchema with parse() and jsonSchema properties
 *
 * @example
 * ```ts
 * import { jsonSchema } from '@localmode/core';
 * import { z } from 'zod';
 *
 * const schema = jsonSchema(z.object({
 *   name: z.string(),
 *   age: z.number(),
 *   tags: z.array(z.string()),
 * }));
 *
 * const result = await generateObject({ model, schema, prompt: '...' });
 * ```
 *
 * @throws {Error} If the schema type is not recognized
 */
export function jsonSchema<T, S extends { parse: (v: unknown) => T }>(zodSchema: S): ObjectSchema<T> {
  const zod = zodSchema as ZodLike<T>;

  return {
    parse: (value: unknown) => zod.parse(value),
    jsonSchema: zodToJsonSchema(zod),
    description: zod.description ?? zod._def?.description,
  };
}

/**
 * Convert a Zod schema to JSON Schema representation.
 */
function zodToJsonSchema(schema: ZodLike): Record<string, unknown> {
  const def = schema._def;
  if (!def?.typeName) {
    // Fallback: try reading .shape directly (Zod 4 compat)
    if (schema.shape && typeof schema.shape === 'object') {
      return zodObjectToJsonSchema(schema);
    }
    return { type: 'object' };
  }

  const result = zodTypeToJsonSchema(def.typeName, schema);

  // Add description if present
  const description = schema.description ?? def.description;
  if (description) {
    result.description = description;
  }

  return result;
}

/**
 * Map a Zod type name to JSON Schema.
 */
function zodTypeToJsonSchema(typeName: string, schema: ZodLike): Record<string, unknown> {
  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };

    case 'ZodNumber':
      return { type: 'number' };

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodArray':
      return {
        type: 'array',
        items: schema._def?.type ? zodToJsonSchema(schema._def.type) : {},
      };

    case 'ZodObject':
      return zodObjectToJsonSchema(schema);

    case 'ZodEnum':
      return {
        type: 'string',
        enum: schema._def?.values ? [...schema._def.values] : [],
      };

    case 'ZodLiteral':
      return {
        const: schema._def?.value,
      };

    case 'ZodUnion':
      return {
        anyOf: (schema._def?.options ?? []).map((opt: ZodLike) => zodToJsonSchema(opt)),
      };

    case 'ZodOptional':
      return schema._def?.innerType ? zodToJsonSchema(schema._def.innerType) : {};

    case 'ZodNullable': {
      const inner = schema._def?.innerType ? zodToJsonSchema(schema._def.innerType) : {};
      return { anyOf: [inner, { type: 'null' }] };
    }

    case 'ZodDefault':
      return schema._def?.innerType ? zodToJsonSchema(schema._def.innerType) : {};

    default:
      return {};
  }
}

/**
 * Convert a Zod object schema to JSON Schema with properties and required.
 */
function zodObjectToJsonSchema(schema: ZodLike): Record<string, unknown> {
  const shapeObj =
    typeof schema._def?.shape === 'function'
      ? schema._def.shape()
      : schema.shape ?? {};

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shapeObj)) {
    properties[key] = zodToJsonSchema(fieldSchema as ZodLike);

    // Check if field is optional
    const fieldTypeName = (fieldSchema as ZodLike)._def?.typeName;
    if (fieldTypeName !== 'ZodOptional' && fieldTypeName !== 'ZodDefault') {
      required.push(key);
    }
  }

  const result: Record<string, unknown> = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Build a system prompt that instructs the model to output JSON.
 *
 * @param schema - The ObjectSchema with jsonSchema property
 * @param mode - Output mode (json, array, enum)
 * @param userSystemPrompt - Optional user system prompt to prepend
 * @returns Combined system prompt string
 */
export function buildStructuredPrompt(
  schema: ObjectSchema<unknown>,
  mode: ObjectOutputMode,
  userSystemPrompt?: string
): string {
  const parts: string[] = [];

  if (userSystemPrompt) {
    parts.push(userSystemPrompt);
  }

  parts.push(
    '/no_think',
    'You MUST respond with valid JSON only. No markdown, no explanation, no code fences, no extra text. Do not use <think> tags.'
  );

  if (mode === 'enum') {
    const values = (schema.jsonSchema as { enum?: unknown[] }).enum ?? [];
    parts.push(
      `Output exactly one of these values (as a JSON string): ${JSON.stringify(values)}`
    );
  } else if (mode === 'array') {
    parts.push(
      'Output a JSON array where each element matches this schema:',
      JSON.stringify(schema.jsonSchema, null, 2)
    );
  } else {
    parts.push(
      'Output a JSON object matching this schema:',
      JSON.stringify(schema.jsonSchema, null, 2)
    );
  }

  if (schema.description) {
    parts.push(`Schema description: ${schema.description}`);
  }

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════
// JSON EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract JSON from model output that may contain surrounding text.
 *
 * Handles common LLM outputs:
 * - Direct JSON: `{"name": "John"}`
 * - Markdown code fences: ` ```json\n{...}\n``` `
 * - Text before/after JSON block
 *
 * @param text - Raw model output text
 * @returns Parsed JSON value
 *
 * @throws {Error} If no valid JSON is found in the text
 *
 * @example
 * ```ts
 * extractJSON('{"name": "John"}'); // { name: "John" }
 * extractJSON('```json\n{"name": "John"}\n```'); // { name: "John" }
 * extractJSON('Here is the result: {"name": "John"} Hope that helps!'); // { name: "John" }
 * ```
 */
export function extractJSON(text: string): unknown {
  // Strip <think>...</think> blocks (Qwen3 thinking mode)
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const trimmed = stripped.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to other strategies
  }

  // 2. Try extracting from markdown code fences
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // 3. Try finding first complete JSON structure ({ ... } or [ ... ])
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');

  // Try whichever appears first
  const starts: Array<{ pos: number; open: string; close: string }> = [];
  if (objectStart !== -1) starts.push({ pos: objectStart, open: '{', close: '}' });
  if (arrayStart !== -1) starts.push({ pos: arrayStart, open: '[', close: ']' });
  starts.sort((a, b) => a.pos - b.pos);

  for (const { pos, open, close } of starts) {
    const jsonStr = extractBalanced(trimmed, pos, open, close);
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr);
      } catch {
        // Continue to next candidate
      }
    }
  }

  // 5. Try finding a quoted string (for enum mode)
  const stringMatch = trimmed.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (stringMatch) {
    return stringMatch[1];
  }

  throw new Error(
    `No valid JSON found in model output. Raw text: "${trimmed.slice(0, 200)}${trimmed.length > 200 ? '...' : ''}"`
  );
}

/**
 * Extract a balanced substring from text starting at a given position.
 */
function extractBalanced(
  text: string,
  start: number,
  open: string,
  close: string
): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === open) depth++;
    if (char === close) depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// PARTIAL JSON PARSING (for streaming)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse partial/incomplete JSON by auto-closing open structures.
 *
 * Used during streaming to yield intermediate objects as tokens arrive.
 * Returns undefined if the accumulated text cannot form a meaningful partial object.
 *
 * @param text - Accumulated text that may be incomplete JSON
 * @returns Parsed partial value, or undefined if not parseable
 *
 * @example
 * ```ts
 * parsePartialJSON('{"name": "Jo');     // { name: "Jo" }
 * parsePartialJSON('{"name": "John",'); // { name: "John" }
 * parsePartialJSON('{');                // {}
 * parsePartialJSON('hello');            // undefined
 * ```
 */
export function parsePartialJSON(text: string): unknown | undefined {
  const trimmed = text.trim();

  // Try direct parse first (complete JSON)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to repair
  }

  // Strip any leading text before the first { or [
  let jsonStart = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{' || trimmed[i] === '[') {
      jsonStart = i;
      break;
    }
  }

  if (jsonStart === -1) return undefined;

  let partial = trimmed.slice(jsonStart);

  // Try to repair and parse
  const repaired = repairJSON(partial);
  if (repaired === null) return undefined;

  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

/**
 * Attempt to repair incomplete JSON by closing open structures.
 */
function repairJSON(text: string): string | null {
  let result = text;

  // Remove trailing comma
  result = result.replace(/,\s*$/, '');

  // Remove incomplete key-value pairs (trailing colon or key without value)
  result = result.replace(/,?\s*"[^"]*"\s*:\s*$/, '');

  // Close unterminated strings
  let inString = false;
  let escape = false;
  const openBrackets: string[] = [];

  for (let i = 0; i < result.length; i++) {
    const char = result[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') openBrackets.push('}');
    else if (char === '[') openBrackets.push(']');
    else if (char === '}' || char === ']') openBrackets.pop();
  }

  // If we're inside an unterminated string, close it
  if (inString) {
    result += '"';
  }

  // Remove trailing comma after closing string
  result = result.replace(/,\s*$/, '');

  // Close all open brackets
  while (openBrackets.length > 0) {
    result += openBrackets.pop();
  }

  return result;
}
