/**
 * Document QA Domain Tests
 *
 * Tests for askDocument() and askTable() functions.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  askDocument,
  askTable,
  setGlobalDocumentQAProvider,
  setGlobalTableQAProvider,
} from '../src/document/index.js';
import { createMockDocumentQAModel } from '../src/testing/index.js';

describe('askDocument()', () => {
  afterEach(() => {
    setGlobalDocumentQAProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should answer questions about document text', async () => {
    const model = createMockDocumentQAModel();

    const result = await askDocument({
      model,
      question: 'What is the total amount?',
      document: 'Invoice Total: $500.00',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should answer questions about document image', async () => {
    const model = createMockDocumentQAModel();

    const result = await askDocument({
      model,
      question: 'What is the date?',
      document: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.answer).toBeDefined();
  });

  it('should handle different document types', async () => {
    const model = createMockDocumentQAModel();

    const result = await askDocument({
      model,
      question: 'Test?',
      document: new Blob(['Document content'], { type: 'image/png' }),
    });

    expect(result.answer).toBeDefined();
  });

  it('should support abort signal', async () => {
    const model = createMockDocumentQAModel({ delay: 100 });
    const controller = new AbortController();

    const promise = askDocument({
      model,
      question: 'Test?',
      document: 'Content.',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalDocumentQAProvider(() => createMockDocumentQAModel());

    const result = await askDocument({
      model: 'test-model' as any,
      question: 'What is this?',
      document: 'A document.',
    });

    expect(result.answer).toBeDefined();
  });
});

describe('askTable()', () => {
  afterEach(() => {
    setGlobalTableQAProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should answer questions about table data (CSV)', async () => {
    const model = createMockDocumentQAModel();

    const result = await askTable({
      model,
      question: 'What is the price of Widget?',
      table: 'Name,Price\nWidget,10\nGadget,20',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('should answer questions about table object', async () => {
    const model = createMockDocumentQAModel();

    const result = await askTable({
      model,
      question: 'What is the total?',
      table: {
        headers: ['Item', 'Price'],
        rows: [
          ['Widget', '10'],
          ['Gadget', '20'],
        ],
      },
    });

    expect(result.answer).toBeDefined();
  });

  it('should handle various table formats', async () => {
    const model = createMockDocumentQAModel();

    const result = await askTable({
      model,
      question: 'What is in column A?',
      table: 'A,B,C\n1,2,3\n4,5,6',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockDocumentQAModel({ delay: 100 });
    const controller = new AbortController();

    const promise = askTable({
      model,
      question: 'Test?',
      table: 'A,B\n1,2',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalTableQAProvider(() => createMockDocumentQAModel());

    const result = await askTable({
      model: 'test-model' as any,
      question: 'Sum?',
      table: 'A,B\n1,2',
    });

    expect(result.answer).toBeDefined();
  });
});

