/**
 * @file generate-object.test.ts
 * @description Tests for structured output: generateObject, streamObject, jsonSchema, extractJSON, parsePartialJSON
 */

import { describe, it, expect } from 'vitest';
import {
  generateObject,
  streamObject,
  jsonSchema,
  createMockLanguageModel,
  StructuredOutputError,
} from '../src/index.js';
import { extractJSON, parsePartialJSON, buildStructuredPrompt } from '../src/generation/schema.js';

// ═══════════════════════════════════════════════════════════════
// MOCK ZOD SCHEMAS (duck-typed, no actual Zod import)
// ═══════════════════════════════════════════════════════════════

/** Create a mock Zod-like string schema */
function mockZodString(description?: string) {
  return {
    _def: { typeName: 'ZodString', description },
    parse: (v: unknown) => {
      if (typeof v !== 'string') throw new Error('Expected string');
      return v;
    },
    description,
  };
}

/** Create a mock Zod-like number schema */
function mockZodNumber() {
  return {
    _def: { typeName: 'ZodNumber' },
    parse: (v: unknown) => {
      if (typeof v !== 'number') throw new Error('Expected number');
      return v;
    },
  };
}

/** Create a mock Zod-like boolean schema */
function mockZodBoolean() {
  return {
    _def: { typeName: 'ZodBoolean' },
    parse: (v: unknown) => {
      if (typeof v !== 'boolean') throw new Error('Expected boolean');
      return v;
    },
  };
}

/** Create a mock Zod-like optional schema */
function mockZodOptional(inner: ReturnType<typeof mockZodString>) {
  return {
    _def: { typeName: 'ZodOptional', innerType: inner },
    parse: (v: unknown) => (v === undefined ? undefined : inner.parse(v)),
  };
}

/** Create a mock Zod-like array schema */
function mockZodArray(items: ReturnType<typeof mockZodString>) {
  return {
    _def: { typeName: 'ZodArray', type: items },
    parse: (v: unknown) => {
      if (!Array.isArray(v)) throw new Error('Expected array');
      return v.map((item) => items.parse(item));
    },
  };
}

/** Create a mock Zod-like enum schema */
function mockZodEnum(values: readonly string[]) {
  return {
    _def: { typeName: 'ZodEnum', values },
    parse: (v: unknown) => {
      if (!values.includes(v as string)) throw new Error(`Expected one of: ${values.join(', ')}`);
      return v as string;
    },
  };
}

/** Create a mock Zod-like object schema */
function mockZodObject<T extends Record<string, { parse: (v: unknown) => unknown; _def?: unknown }>>(
  shape: T
) {
  return {
    _def: {
      typeName: 'ZodObject',
      shape: () => shape,
    },
    shape,
    parse: (v: unknown) => {
      if (typeof v !== 'object' || v === null) throw new Error('Expected object');
      const result: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        result[key] = schema.parse((v as Record<string, unknown>)[key]);
      }
      return result;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// extractJSON()
// ═══════════════════════════════════════════════════════════════

describe('extractJSON()', () => {
  it('parses direct JSON object', () => {
    expect(extractJSON('{"name": "John"}')).toEqual({ name: 'John' });
  });

  it('parses direct JSON array', () => {
    expect(extractJSON('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('extracts JSON from markdown code fences', () => {
    const text = '```json\n{"name": "John"}\n```';
    expect(extractJSON(text)).toEqual({ name: 'John' });
  });

  it('extracts JSON from code fences without language tag', () => {
    const text = '```\n{"age": 30}\n```';
    expect(extractJSON(text)).toEqual({ age: 30 });
  });

  it('extracts JSON with surrounding text', () => {
    const text = 'Here is the result: {"name": "John"} Hope that helps!';
    expect(extractJSON(text)).toEqual({ name: 'John' });
  });

  it('extracts nested JSON objects', () => {
    const text = 'Result: {"user": {"name": "John", "age": 30}}';
    expect(extractJSON(text)).toEqual({ user: { name: 'John', age: 30 } });
  });

  it('extracts JSON array with surrounding text', () => {
    const text = 'Items: [{"a": 1}, {"a": 2}] done.';
    expect(extractJSON(text)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('throws on no valid JSON', () => {
    expect(() => extractJSON('no json here')).toThrow('No valid JSON found');
  });

  it('extracts quoted string for enum mode', () => {
    const text = 'The answer is "positive"';
    expect(extractJSON(text)).toBe('positive');
  });

  it('strips Qwen3 think blocks before extraction', () => {
    const text = '<think>Let me analyze this text...</think>{"name": "John"}';
    expect(extractJSON(text)).toEqual({ name: 'John' });
  });

  it('strips multiple think blocks', () => {
    const text = '<think>first</think>Some text <think>second</think>{"age": 30}';
    expect(extractJSON(text)).toEqual({ age: 30 });
  });
});

// ═══════════════════════════════════════════════════════════════
// parsePartialJSON()
// ═══════════════════════════════════════════════════════════════

describe('parsePartialJSON()', () => {
  it('parses complete JSON', () => {
    expect(parsePartialJSON('{"name": "John"}')).toEqual({ name: 'John' });
  });

  it('parses partial object with unterminated string', () => {
    const result = parsePartialJSON('{"name": "Jo');
    expect(result).toEqual({ name: 'Jo' });
  });

  it('parses partial object with trailing comma', () => {
    const result = parsePartialJSON('{"name": "John",');
    expect(result).toEqual({ name: 'John' });
  });

  it('parses empty opening brace', () => {
    expect(parsePartialJSON('{')).toEqual({});
  });

  it('returns undefined for non-JSON text', () => {
    expect(parsePartialJSON('hello world')).toBeUndefined();
  });

  it('handles partial array', () => {
    const result = parsePartialJSON('[1, 2,');
    expect(result).toEqual([1, 2]);
  });

  it('handles nested partial objects', () => {
    const result = parsePartialJSON('{"user": {"name": "Jo');
    expect(result).toBeDefined();
  });

  it('strips leading text before JSON', () => {
    const result = parsePartialJSON('Result: {"name": "John"}');
    expect(result).toEqual({ name: 'John' });
  });
});

// ═══════════════════════════════════════════════════════════════
// jsonSchema()
// ═══════════════════════════════════════════════════════════════

describe('jsonSchema()', () => {
  it('converts object schema with properties and required', () => {
    const schema = jsonSchema(
      mockZodObject({
        name: mockZodString(),
        age: mockZodNumber(),
      })
    );

    expect(schema.jsonSchema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    });
  });

  it('handles optional fields', () => {
    const schema = jsonSchema(
      mockZodObject({
        name: mockZodString(),
        phone: mockZodOptional(mockZodString()),
      })
    );

    expect(schema.jsonSchema.required).toEqual(['name']);
  });

  it('handles array fields', () => {
    const schema = jsonSchema(
      mockZodObject({
        tags: mockZodArray(mockZodString()),
      })
    );

    const props = schema.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('handles enum schema', () => {
    const schema = jsonSchema(mockZodEnum(['positive', 'negative', 'neutral']));
    expect(schema.jsonSchema).toEqual({
      type: 'string',
      enum: ['positive', 'negative', 'neutral'],
    });
  });

  it('preserves description', () => {
    const schema = jsonSchema(mockZodString('A user name'));
    expect(schema.description).toBe('A user name');
    expect(schema.jsonSchema.description).toBe('A user name');
  });

  it('parse delegates to underlying schema', () => {
    const schema = jsonSchema(
      mockZodObject({
        name: mockZodString(),
      })
    );

    expect(schema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(() => schema.parse({ name: 123 })).toThrow();
  });

  it('handles boolean fields', () => {
    const schema = jsonSchema(
      mockZodObject({
        active: mockZodBoolean(),
      })
    );

    const props = schema.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props.active).toEqual({ type: 'boolean' });
  });
});

// ═══════════════════════════════════════════════════════════════
// buildStructuredPrompt()
// ═══════════════════════════════════════════════════════════════

describe('buildStructuredPrompt()', () => {
  const schema = jsonSchema(mockZodObject({ name: mockZodString() }));

  it('builds JSON mode prompt', () => {
    const prompt = buildStructuredPrompt(schema, 'json');
    expect(prompt).toContain('valid JSON only');
    expect(prompt).toContain('JSON object matching this schema');
  });

  it('builds array mode prompt', () => {
    const prompt = buildStructuredPrompt(schema, 'array');
    expect(prompt).toContain('JSON array');
  });

  it('builds enum mode prompt', () => {
    const enumSchema = jsonSchema(mockZodEnum(['a', 'b']));
    const prompt = buildStructuredPrompt(enumSchema, 'enum');
    expect(prompt).toContain('exactly one of these values');
  });

  it('prepends user system prompt', () => {
    const prompt = buildStructuredPrompt(schema, 'json', 'Be concise.');
    expect(prompt).toMatch(/^Be concise\./);
  });
});

// ═══════════════════════════════════════════════════════════════
// generateObject()
// ═══════════════════════════════════════════════════════════════

describe('generateObject()', () => {
  const objectSchema = jsonSchema(
    mockZodObject({
      name: mockZodString(),
      age: mockZodNumber(),
    })
  );

  it('returns { object, rawText, usage, response, attempts }', async () => {
    const model = createMockLanguageModel({
      responses: ['{"name": "John", "age": 30}'],
    });

    const result = await generateObject({
      model,
      schema: objectSchema,
      prompt: 'Extract: John is 30',
    });

    expect(result.object).toEqual({ name: 'John', age: 30 });
    expect(result.rawText).toContain('John');
    expect(result.attempts).toBe(1);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('mock:llm');
    expect(result.finishReason).toBe('stop');
  });

  it('retries on validation failure with self-correction', async () => {
    const model = createMockLanguageModel({
      responses: [
        'invalid json here', // attempt 1 fails
        '{"name": "John", "age": 30}', // attempt 2 succeeds
      ],
    });

    const result = await generateObject({
      model,
      schema: objectSchema,
      prompt: 'Extract: John is 30',
    });

    expect(result.object).toEqual({ name: 'John', age: 30 });
    expect(result.attempts).toBe(2);
  });

  it('throws StructuredOutputError after all retries', async () => {
    const model = createMockLanguageModel({
      mockResponse: 'not json at all',
    });

    await expect(
      generateObject({
        model,
        schema: objectSchema,
        prompt: 'Extract something',
        maxRetries: 2,
      })
    ).rejects.toThrow(StructuredOutputError);
  });

  it('handles JSON in code fences', async () => {
    const model = createMockLanguageModel({
      responses: ['```json\n{"name": "John", "age": 30}\n```'],
    });

    const result = await generateObject({
      model,
      schema: objectSchema,
      prompt: 'Extract data',
    });

    expect(result.object).toEqual({ name: 'John', age: 30 });
  });

  it('supports AbortSignal', async () => {
    const model = createMockLanguageModel({ delay: 100 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateObject({
        model,
        schema: objectSchema,
        prompt: 'Extract',
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('defaults temperature to 0', async () => {
    let capturedTemp: number | undefined;
    const model = {
      modelId: 'test',
      provider: 'test',
      contextLength: 4096,
      async doGenerate(opts: { temperature?: number }) {
        capturedTemp = opts.temperature;
        return {
          text: '{"name": "A", "age": 1}',
          finishReason: 'stop' as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 1 },
        };
      },
    };

    await generateObject({ model, schema: objectSchema, prompt: 'test' });
    expect(capturedTemp).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// streamObject()
// ═══════════════════════════════════════════════════════════════

describe('streamObject()', () => {
  const objectSchema = jsonSchema(
    mockZodObject({
      name: mockZodString(),
      age: mockZodNumber(),
    })
  );

  it('streams partial objects and resolves final object', async () => {
    const model = createMockLanguageModel({
      responses: ['{"name": "John", "age": 30}'],
    });

    const result = await streamObject({
      model,
      schema: objectSchema,
      prompt: 'Extract data',
    });

    const partials: unknown[] = [];
    for await (const partial of result.partialObjectStream) {
      partials.push(partial);
    }

    expect(partials.length).toBeGreaterThan(0);

    const final = await result.object;
    expect(final).toEqual({ name: 'John', age: 30 });
  });

  it('calls onPartialObject callback', async () => {
    const model = createMockLanguageModel({
      responses: ['{"name": "John", "age": 30}'],
    });

    const callbacks: unknown[] = [];
    const result = await streamObject({
      model,
      schema: objectSchema,
      prompt: 'Extract',
      onPartialObject: (partial) => callbacks.push(partial),
    });

    for await (const _ of result.partialObjectStream) {
      // consume stream
    }

    expect(callbacks.length).toBeGreaterThan(0);
  });

  it('rejects object promise on validation failure', async () => {
    const model = createMockLanguageModel({
      responses: ['{"name": 123, "age": "not a number"}'],
    });

    const result = await streamObject({
      model,
      schema: objectSchema,
      prompt: 'Extract',
    });

    for await (const _ of result.partialObjectStream) {
      // consume stream
    }

    await expect(result.object).rejects.toThrow();
  });
});
