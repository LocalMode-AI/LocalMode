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
 * Reads internal Zod structure without importing Zod. The shape of `_def`
 * differs between Zod 3 and Zod 4, so both layouts are declared here:
 * - Zod 3 tags the kind in `typeName` ('ZodString'); an array's element sits in
 *   `type`, an enum's members in `values`, a literal's value in `value`.
 * - Zod 4 tags the kind in `type` ('string'); an array's element sits in
 *   `element`, an enum's members in `entries`, a literal's value in `values`.
 */
interface ZodLike<T = unknown> {
  parse: (value: unknown) => T;
  _def?: {
    /** Zod 3 discriminant, e.g. 'ZodString'. Absent in Zod 4. */
    typeName?: string;
    /**
     * Zod 4 discriminant, e.g. 'string' | 'array' | 'object'. In Zod 3 this
     * field instead holds an array's element schema, so it is read as a kind
     * only when it is a string.
     */
    type?: string | ZodLike;
    description?: string;
    shape?: (() => Record<string, ZodLike>) | Record<string, ZodLike>;
    /** Zod 4 array element schema. */
    element?: ZodLike;
    innerType?: ZodLike;
    options?: ZodLike[];
    /** Zod 3 enum members. */
    values?: readonly unknown[];
    /** Zod 4 enum members (value map). */
    entries?: Record<string, unknown>;
    /** Zod 3 literal value. */
    value?: unknown;
    checks?: Array<{ kind: string; value?: unknown }>;
  };
  shape?: Record<string, ZodLike>;
  description?: string;
}

/**
 * Normalize the Zod type discriminant across Zod 3 (`_def.typeName`, e.g.
 * 'ZodString') and Zod 4 (`_def.type`, e.g. 'string') to a lowercase kind
 * ('string' | 'number' | 'array' | 'object' | 'optional' | …), or `undefined`.
 */
function zodKind(def: ZodLike['_def']): string | undefined {
  if (!def) return undefined;
  // Zod 4: `type` is a string kind. (In Zod 3 `type` is a schema, not a string.)
  if (typeof def.type === 'string') return def.type;
  // Zod 3: strip the `Zod` prefix and lowercase — 'ZodString' → 'string'.
  if (typeof def.typeName === 'string') return def.typeName.replace(/^Zod/, '').toLowerCase();
  return undefined;
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
export function jsonSchema<T>(zodSchema: { parse: (v: unknown) => T }): ObjectSchema<T> {
  const zod = zodSchema as ZodLike<T>;

  return {
    parse: (value: unknown) => zod.parse(value),
    jsonSchema: zodToJsonSchema(zod),
    description: zod.description ?? zod._def?.description,
  };
}

/**
 * Convert a Zod schema to JSON Schema representation. Version-agnostic:
 * `zodKind()` resolves the discriminant for both Zod 3 and Zod 4.
 */
function zodToJsonSchema(schema: ZodLike): Record<string, unknown> {
  const def = schema._def;
  const kind = zodKind(def);
  if (!kind) {
    // No recognizable discriminant: fall back to reading `.shape` directly.
    if (schema.shape && typeof schema.shape === 'object') {
      return zodObjectToJsonSchema(schema);
    }
    return { type: 'object' };
  }

  const result = zodTypeToJsonSchema(kind, schema);

  // Add description if present
  const description = schema.description ?? def?.description;
  if (description) {
    result.description = description;
  }

  return result;
}

/** The Zod 4 array element schema, else the Zod 3 element (held in `_def.type`). */
function arrayElement(def: ZodLike['_def']): ZodLike | undefined {
  if (def?.element) return def.element;
  // Zod 3 stores the element schema in `type` (an object, not a string kind).
  if (def?.type && typeof def.type !== 'string') return def.type;
  return undefined;
}

/**
 * Map a normalized (lowercase) Zod kind to JSON Schema. Reads whichever inner
 * fields the installed Zod major populates (see the ZodLike doc comment).
 */
function zodTypeToJsonSchema(kind: string, schema: ZodLike): Record<string, unknown> {
  const def = schema._def;
  switch (kind) {
    case 'string':
      return { type: 'string' };

    case 'number':
    case 'bigint':
      return { type: 'number' };

    case 'boolean':
      return { type: 'boolean' };

    case 'array': {
      const element = arrayElement(def);
      return { type: 'array', items: element ? zodToJsonSchema(element) : {} };
    }

    case 'object':
      return zodObjectToJsonSchema(schema);

    case 'enum': {
      // Zod 4 keeps members in `entries` (a value map); Zod 3 in `values`.
      const values = def?.entries ? Object.values(def.entries) : def?.values ? [...def.values] : [];
      return { type: 'string', enum: values };
    }

    case 'literal':
      // Zod 4 keeps the value in `values` (array); Zod 3 in `value`.
      return { const: def?.values ? def.values[0] : def?.value };

    case 'union':
      return { anyOf: (def?.options ?? []).map((opt: ZodLike) => zodToJsonSchema(opt)) };

    case 'optional':
      return def?.innerType ? zodToJsonSchema(def.innerType) : {};

    case 'nullable': {
      const inner = def?.innerType ? zodToJsonSchema(def.innerType) : {};
      return { anyOf: [inner, { type: 'null' }] };
    }

    case 'default':
      return def?.innerType ? zodToJsonSchema(def.innerType) : {};

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
      : schema._def?.shape ?? schema.shape ?? {};

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shapeObj)) {
    properties[key] = zodToJsonSchema(fieldSchema as ZodLike);

    // A field is optional when its kind is optional/default (either Zod major).
    const fieldKind = zodKind((fieldSchema as ZodLike)._def);
    if (fieldKind !== 'optional' && fieldKind !== 'default') {
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

/** A minimal JSON-Schema node shape (only the fields this module reads). */
interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  enum?: unknown[];
  const?: unknown;
}

/** The declared top-level property names of an object schema (empty if none). */
function topLevelKeys(jsonSchema: unknown): string[] {
  const node = jsonSchema as JsonSchemaNode;
  return node && node.properties ? Object.keys(node.properties) : [];
}

/**
 * Build a concrete EXAMPLE INSTANCE of a JSON Schema — a value of the right
 * shape with placeholder contents (`"text"`, `0`, `true`, `[…]`, `{…}`). This
 * is shown to the model as the target so it emits data, not the schema.
 * Returns `undefined` for schemas with no usable structure (the caller then
 * falls back to the raw-schema instruction alone). Depth-capped against
 * pathological/recursive schemas.
 */
function exampleFromSchema(jsonSchema: unknown, depth = 0): unknown {
  const node = jsonSchema as JsonSchemaNode;
  if (!node || depth > 5) return undefined;

  if (node.const !== undefined) return node.const;
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];

  const type = Array.isArray(node.type) ? node.type[0] : node.type;

  switch (type) {
    case 'string':
      return 'text';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'array': {
      const item = node.items ? exampleFromSchema(node.items, depth + 1) : 'text';
      return item === undefined ? [] : [item];
    }
    case 'object':
    default: {
      if (!node.properties) return type === 'object' ? {} : undefined;
      const obj: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node.properties)) {
        const value = exampleFromSchema(child, depth + 1);
        obj[key] = value === undefined ? 'text' : value;
      }
      return obj;
    }
  }
}

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
    const example = exampleFromSchema(schema.jsonSchema);
    if (example !== undefined) {
      parts.push(
        'Return the actual extracted DATA VALUES — never the schema itself. Fill an ' +
          'array of objects shaped like this example (use real values from the input, ' +
          'not the placeholders):',
        JSON.stringify([example])
      );
    }
  } else {
    parts.push(
      'Output a JSON object matching this schema:',
      JSON.stringify(schema.jsonSchema, null, 2)
    );
    // Small models frequently echo the JSON Schema back verbatim
    // (`{"type":"object","properties":{…}}`) instead of an instance of it.
    // A concrete key list + a filled example anchors them to the target shape.
    const keys = topLevelKeys(schema.jsonSchema);
    const example = exampleFromSchema(schema.jsonSchema);
    if (keys.length > 0) {
      parts.push(
        `Your JSON object must have exactly these top-level keys: ${keys.join(', ')}.`
      );
    }
    if (example !== undefined) {
      parts.push(
        'Return the actual extracted DATA VALUES — never the schema itself. Produce a ' +
          'JSON object shaped like this example (replace the placeholders with real ' +
          'values from the input):',
        JSON.stringify(example)
      );
    }
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

  const partial = trimmed.slice(jsonStart);

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
