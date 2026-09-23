/**
 * @fileoverview Tests for document loaders (TextLoader, JSONLoader, CSVLoader, HTMLLoader)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadDocument,
  loadDocuments,
  createLoaderRegistry,
  TextLoader,
  createTextLoader,
  JSONLoader,
  createJSONLoader,
  CSVLoader,
  createCSVLoader,
  HTMLLoader,
  createHTMLLoader,
} from '../src/index.js';
import type { DocumentLoader, LoaderSource } from '../src/index.js';

describe('TextLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads plain text', async () => {
    const loader = new TextLoader();
    const content = 'Hello, world! This is a test document.';

    const docs = await loader.load(content);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe(content);
    expect(docs[0].metadata.source).toBe('text-string'); // source name from getSourceName()
  });

  it('loads from Blob', async () => {
    const loader = new TextLoader();
    const blob = new Blob(['  Blob body text  '], { type: 'text/plain' });

    const docs = await loader.load(blob);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe('Blob body text');
    expect(docs[0].metadata.source).toBe('text-blob');
    expect(docs[0].metadata.mimeType).toBe('text/plain');
  });

  it('loads from File and uses the file name as source', async () => {
    const loader = new TextLoader();
    const file = new File(['File body'], 'notes.txt', { type: 'text/plain' });

    const docs = await loader.load(file);

    expect(docs[0].text).toBe('File body');
    expect(docs[0].metadata.source).toBe('notes.txt');
  });

  it('decodes an ArrayBuffer', async () => {
    const loader = new TextLoader();
    const buffer = await new Blob(['Buffered text']).arrayBuffer();

    const docs = await loader.load(buffer);

    expect(docs[0].text).toBe('Buffered text');
  });

  it('fetches a URL source', async () => {
    const fetchMock = vi.fn(async () => new Response('Remote text', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const loader = new TextLoader();

    const docs = await loader.load({ type: 'url', url: 'https://example.test/a.txt' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/a.txt');
    expect(docs[0].text).toBe('Remote text');
    expect(docs[0].metadata.source).toBe('https://example.test/a.txt');
  });

  it('rejects a failed URL fetch with the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' })));
    const loader = new TextLoader();

    await expect(loader.load({ type: 'url', url: 'https://example.test/missing' })).rejects.toThrow(
      'Failed to fetch URL: 404 Not Found'
    );
  });

  it('enforces maxSize', async () => {
    const loader = new TextLoader();

    await expect(loader.load('0123456789', { maxSize: 5 })).rejects.toThrow(
      'Text exceeds maximum size: 10 > 5'
    );
  });

  it('rejects an already-aborted signal', async () => {
    const loader = new TextLoader();
    const controller = new AbortController();
    controller.abort();

    await expect(loader.load('text', { abortSignal: controller.signal })).rejects.toThrow();
  });

  it('returns no documents for whitespace-only text', async () => {
    const loader = new TextLoader();

    await expect(loader.load('   \n  ')).resolves.toEqual([]);
  });

  it('generates unique IDs', async () => {
    const loader = new TextLoader();
    const docs1 = await loader.load('Document 1');
    const docs2 = await loader.load('Document 2');

    expect(docs1[0].id).not.toBe(docs2[0].id);
  });

  it('respects custom id via generateId option', async () => {
    const loader = new TextLoader();
    const docs = await loader.load('Test content', {
      generateId: () => 'custom-id',
    });

    expect(docs[0].id).toBe('custom-id');
  });

  it('splits text by separator', async () => {
    const loader = new TextLoader();
    const content = 'Para 1\n\nPara 2\n\nPara 3';
    const docs = await loader.load(content, { separator: '\n\n' });

    expect(docs).toHaveLength(3);
    expect(docs[0].text).toBe('Para 1');
    expect(docs[1].text).toBe('Para 2');
    expect(docs[2].text).toBe('Para 3');
  });

  it('applies options given to the constructor and to createTextLoader()', async () => {
    const content = 'Para 1\n\nPara 2';

    const fromConstructor = await new TextLoader({ separator: '\n\n' }).load(content);
    const fromFactory = await createTextLoader({ separator: '\n\n' }).load(content);

    expect(fromConstructor.map((d) => d.text)).toEqual(['Para 1', 'Para 2']);
    expect(fromFactory.map((d) => d.text)).toEqual(['Para 1', 'Para 2']);
  });

  it('lets per-call options override constructor options', async () => {
    const loader = new TextLoader({ separator: '\n\n' });

    const docs = await loader.load('A\n\nB', { separator: '|' });

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe('A\n\nB');
  });
});

describe('JSONLoader', () => {
  it('uses the first common text field by default and copies short scalars into metadata', async () => {
    const loader = new JSONLoader();
    const data = {
      title: 'Test Title',
      content: 'Test content here',
      count: 42,
      nested: { description: 'Nested description' },
    };

    const docs = await loader.load(JSON.stringify(data));

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe('Test content here');
    expect(docs[0].metadata.mimeType).toBe('application/json');
    expect(docs[0].metadata.title).toBe('Test Title');
    expect(docs[0].metadata.count).toBe(42);
    expect(docs[0].metadata).not.toHaveProperty('content');
    expect(docs[0].metadata).not.toHaveProperty('nested');
  });

  it('respects textFields given per call', async () => {
    const loader = new JSONLoader();
    const data = {
      title: 'Ignored Title',
      content: 'Included content',
      description: 'Included description',
    };

    const docs = await loader.load(JSON.stringify(data), {
      textFields: ['content', 'description'],
    });

    expect(docs[0].text).toBe('Included content\nIncluded description');
  });

  it('respects textFields given to createJSONLoader()', async () => {
    const loader = createJSONLoader({ textFields: ['content', 'description'] });
    const data = {
      title: 'Ignored Title',
      content: 'Included content',
      description: 'Included description',
    };

    const docs = await loader.load(JSON.stringify(data));

    expect(docs[0].text).toBe('Included content\nIncluded description');
  });

  it('creates one document per array element and uses the id field', async () => {
    const loader = new JSONLoader();
    const data = [
      { id: 'a', text: 'First item' },
      { id: 'b', text: 'Second item' },
      { id: 'c', text: 'Third item' },
    ];

    const docs = await loader.load(JSON.stringify(data));

    expect(docs.map((d) => d.text)).toEqual(['First item', 'Second item', 'Third item']);
    expect(docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(docs.map((d) => d.metadata.recordIndex)).toEqual([0, 1, 2]);
  });

  it('navigates recordsPath and joins nested textFields', async () => {
    const loader = new JSONLoader();
    const data = {
      data: {
        items: [
          { body: { en: 'Hello' } },
          { body: { en: 'World' } },
        ],
      },
    };

    const docs = await loader.load(JSON.stringify(data), {
      recordsPath: 'data.items',
      textFields: ['body.en'],
    });

    expect(docs.map((d) => d.text)).toEqual(['Hello', 'World']);
  });

  it('extracts all nested strings with extractAllStrings', async () => {
    const loader = new JSONLoader();
    const data = { a: 'one', b: { c: 'two', d: ['three', 4] } };

    const docs = await loader.load(JSON.stringify(data), {
      extractAllStrings: true,
      fieldSeparator: ' | ',
    });

    expect(docs[0].text).toBe('one | two | three');
  });

  it('falls back to the serialized record when no text field exists', async () => {
    const loader = new JSONLoader();

    const docs = await loader.load('{"a":1}');

    expect(docs[0].text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('returns no documents for an empty array', async () => {
    const loader = new JSONLoader();

    await expect(loader.load('[]')).resolves.toEqual([]);
  });

  it('throws on invalid JSON', async () => {
    const loader = new JSONLoader();

    await expect(loader.load('not valid json')).rejects.toThrow(/^Invalid JSON:/);
  });

  it('loads a JSON Blob', async () => {
    const loader = new JSONLoader();
    const blob = new Blob([JSON.stringify({ text: 'From blob' })], { type: 'application/json' });

    const docs = await loader.load(blob);

    expect(docs[0].text).toBe('From blob');
    expect(docs[0].metadata.source).toBe('json-blob');
  });
});

describe('CSVLoader', () => {
  it('creates a document per row from the first column and keeps every column as metadata', async () => {
    const loader = new CSVLoader();
    const csv = `name,age,city
John,30,New York
Jane,25,Los Angeles
Bob,35,Chicago`;

    const docs = await loader.load(csv);

    expect(docs.map((d) => d.text)).toEqual(['John', 'Jane', 'Bob']);
    expect(docs[0].metadata).toMatchObject({
      name: 'John',
      age: '30',
      city: 'New York',
      rowIndex: 1,
      mimeType: 'text/csv',
    });
  });

  it('prefers a column named text/content/body/description/message', async () => {
    const loader = new CSVLoader();
    const csv = `id,content
1,The content column`;

    const docs = await loader.load(csv);

    expect(docs[0].text).toBe('The content column');
  });

  it('uses textColumn given per call', async () => {
    const loader = new CSVLoader();
    const csv = `id,description,category
1,This is the main text,category1
2,Another description,category2`;

    const docs = await loader.load(csv, { textColumn: 'category' });

    expect(docs.map((d) => d.text)).toEqual(['category1', 'category2']);
  });

  it('uses textColumn given to createCSVLoader()', async () => {
    const loader = createCSVLoader({ textColumn: 'category' });
    const csv = `id,description,category
1,This is the main text,category1
2,Another description,category2`;

    const docs = await loader.load(csv);

    expect(docs.map((d) => d.text)).toEqual(['category1', 'category2']);
  });

  it('combines textColumns with columnSeparator', async () => {
    const loader = new CSVLoader();
    const csv = `title,description
Widget,A small part`;

    const docs = await loader.load(csv, {
      textColumns: ['title', 'description'],
      columnSeparator: ' - ',
    });

    expect(docs[0].text).toBe('Widget - A small part');
  });

  it('handles a custom columnDelimiter', async () => {
    const loader = new CSVLoader();
    const csv = `name;value
test;123`;

    const docs = await loader.load(csv, { columnDelimiter: ';', textColumn: 'value' });

    expect(docs[0].text).toBe('123');
    expect(docs[0].metadata.name).toBe('test');
  });

  it('handles quoted values with delimiters and escaped quotes', async () => {
    const loader = new CSVLoader();
    const csv = `name,description
"Doe, John","He said ""hi"", then left"`;

    const docs = await loader.load(csv, { textColumn: 'description' });

    expect(docs[0].text).toBe('He said "hi", then left');
    expect(docs[0].metadata.name).toBe('Doe, John');
  });

  it('skips empty rows and handles CRLF line endings', async () => {
    const loader = new CSVLoader();
    const csv = 'name,value\r\nfirst,1\r\n\r\nsecond,2';

    const docs = await loader.load(csv);

    expect(docs.map((d) => d.text)).toEqual(['first', 'second']);
  });

  it('uses idColumn for the document id', async () => {
    const loader = new CSVLoader();
    const csv = `uuid,text
abc-123,Sample text`;

    const docs = await loader.load(csv, { idColumn: 'uuid' });

    expect(docs[0].id).toBe('abc-123');
    expect(docs[0].text).toBe('Sample text');
  });

  it('reads headerless CSV by column index', async () => {
    const loader = new CSVLoader();

    const docs = await loader.load('1,alpha\n2,beta', { hasHeader: false, textColumn: 1 });

    expect(docs.map((d) => d.text)).toEqual(['alpha', 'beta']);
    expect(docs.map((d) => d.metadata.rowIndex)).toEqual([0, 1]);
  });
});

describe('HTMLLoader', () => {
  it('strips HTML tags', async () => {
    const loader = new HTMLLoader();
    const html = '<html><body><p>Hello <strong>world</strong>!</p></body></html>';

    const docs = await loader.load(html);

    expect(docs[0].text).toBe('Hello world!');
    expect(docs[0].metadata.mimeType).toBe('text/html');
  });

  it('extracts text from a specific selector', async () => {
    const loader = new HTMLLoader();
    const html = `
      <html>
        <body>
          <nav>Navigation content</nav>
          <article>Main article content</article>
          <footer>Footer content</footer>
        </body>
      </html>
    `;

    const docs = await loader.load(html, { selector: 'article' });

    expect(docs[0].text).toBe('Main article content');
  });

  it('applies options given to createHTMLLoader()', async () => {
    const loader = createHTMLLoader({ selector: 'article' });
    const html = '<body><nav>Navigation content</nav><article>Main article content</article></body>';

    const docs = await loader.load(html);

    expect(docs[0].text).toBe('Main article content');
  });

  it('extracts the <title> into metadata and derives the id from it', async () => {
    const loader = new HTMLLoader();
    const html = '<html><head><title>Page Title</title></head><body>Content</body></html>';

    const docs = await loader.load(html);

    expect(docs[0].metadata.title).toBe('Page Title');
    expect(docs[0].id).toBe('page-title');
    expect(docs[0].text).toBe('Content');
  });

  it('removes script and style content', async () => {
    const loader = new HTMLLoader();
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
        </head>
        <body>
          Visible content
          <script>console.log('hidden');</script>
        </body>
      </html>
    `;

    const docs = await loader.load(html);

    expect(docs[0].text).toBe('Visible content');
  });

  it('separates adjacent block elements instead of merging their words', async () => {
    const loader = new HTMLLoader();
    const html = '<p>First paragraph</p><p>Second paragraph</p><ul><li>One</li><li>Two</li></ul>';

    const flat = await loader.load(html);
    const formatted = await loader.load(html, { preserveFormatting: true });

    expect(flat[0].text).toBe('First paragraph Second paragraph One Two');
    expect(formatted[0].text).toBe('First paragraph\nSecond paragraph\nOne\nTwo');
  });

  it('keeps inline elements joined', async () => {
    const loader = new HTMLLoader();

    const docs = await loader.load('<p>un<em>believ</em>able</p>');

    expect(docs[0].text).toBe('unbelievable');
  });

  it('handles malformed HTML', async () => {
    const loader = new HTMLLoader();
    const html = '<p>Unclosed paragraph<div>Nested incorrectly</p></div>';

    const docs = await loader.load(html);

    expect(docs[0].text).toBe('Unclosed paragraph Nested incorrectly');
  });

  it('extracts meta description and keywords by default', async () => {
    const loader = new HTMLLoader();
    const html = `
      <html>
        <head>
          <meta name="description" content="Page description here">
          <meta name="keywords" content="test, html, loader">
        </head>
        <body>Content</body>
      </html>
    `;

    const docs = await loader.load(html);

    expect(docs[0].metadata.description).toBe('Page description here');
    expect(docs[0].metadata.keywords).toBe('test, html, loader');
  });

  it('omits meta fields when extractMetadata is false', async () => {
    const loader = new HTMLLoader();
    const html = '<head><meta name="description" content="Hidden"></head><body>Content</body>';

    const docs = await loader.load(html, { extractMetadata: false });

    expect(docs[0].metadata).not.toHaveProperty('description');
  });

  it('returns no documents when the page has no text', async () => {
    const loader = new HTMLLoader();

    await expect(loader.load('<html><body><script>x()</script></body></html>')).resolves.toEqual([]);
  });
});

describe('loadDocument()', () => {
  it('uses the loader named in options', async () => {
    const textContent = 'Plain text content';

    const docs = await loadDocument(textContent, { loader: 'text' });

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe(textContent);
    expect(docs[0].metadata.mimeType).toBe('text/plain');
  });

  it('passes loader-specific options through to the named loader', async () => {
    const csv = 'id,content,tag\n1,Row text,x';

    const docs = await loadDocument(csv, { loader: 'csv', textColumn: 'tag' });

    expect(docs[0].text).toBe('x');
  });

  it('auto-detects the loader from a Blob content type', async () => {
    const blob = new Blob([JSON.stringify({ text: 'JSON content' })], { type: 'application/json' });

    const docs = await loadDocument(blob);

    expect(docs[0].text).toBe('JSON content');
    expect(docs[0].metadata.mimeType).toBe('application/json');
  });

  it('auto-detects the loader from a File name', async () => {
    const file = new File(['title,body\nA,First\nB,Second'], 'rows.csv');

    const docs = await loadDocument(file);

    expect(docs.map((d) => d.text)).toEqual(['First', 'Second']);
    expect(docs[0].metadata.source).toBe('rows.csv');
  });

  it('auto-detects JSON string content', async () => {
    const docs = await loadDocument('{"text":"JSON string content"}');

    expect(docs[0].text).toBe('JSON string content');
    expect(docs[0].metadata.mimeType).toBe('application/json');
  });

  it('auto-detects HTML string content', async () => {
    const docs = await loadDocument('<!doctype html><html><body><p>Hello</p><p>page</p></body></html>');

    expect(docs[0].text).toBe('Hello page');
    expect(docs[0].metadata.mimeType).toBe('text/html');
  });

  it('auto-detects CSV string content', async () => {
    const docs = await loadDocument('name,city\nJohn,Paris\nJane,Rome');

    expect(docs.map((d) => d.text)).toEqual(['John', 'Jane']);
    expect(docs[0].metadata.mimeType).toBe('text/csv');
  });

  it('treats prose with brackets and commas as plain text', async () => {
    const bracketed = '[Note] this is not JSON';
    const prose = 'Hello, world.\nThis line has no comma';

    const [bracketDoc] = await loadDocument(bracketed);
    const [proseDoc] = await loadDocument(prose);

    expect(bracketDoc.text).toBe(bracketed);
    expect(bracketDoc.metadata.mimeType).toBe('text/plain');
    expect(proseDoc.text).toBe(prose);
    expect(proseDoc.metadata.mimeType).toBe('text/plain');
  });
});

describe('loadDocuments()', () => {
  it('loads multiple documents in source order', async () => {
    const sources = ['First document', 'Second document', 'Third document'];

    const docs = await loadDocuments(sources, { loader: 'text' });

    expect(docs.map((d) => d.text)).toEqual(['First document', 'Second document', 'Third document']);
  });

  it('flattens documents from array sources', async () => {
    const jsonArrays = [
      JSON.stringify([{ text: 'Item 1' }, { text: 'Item 2' }]),
      JSON.stringify([{ text: 'Item 3' }]),
    ];

    const docs = await loadDocuments(jsonArrays, { loader: 'json' });

    expect(docs.map((d) => d.text)).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });
});

describe('createLoaderRegistry()', () => {
  const customLoader: DocumentLoader = {
    supports: ['.custom'],
    canLoad: (source: LoaderSource) => typeof source === 'string' && source.startsWith('custom:'),
    load: async (source) => [
      {
        id: 'custom-id',
        text: `Custom: ${String(source).slice('custom:'.length)}`,
        metadata: { source: 'custom' },
      },
    ],
  };

  it('routes a source to the first loader whose canLoad accepts it', async () => {
    const registry = createLoaderRegistry([customLoader, new TextLoader()]);

    const docs = await registry.load('custom:payload');

    expect(registry.getLoader('custom:payload')).toBe(customLoader);
    expect(docs).toEqual([{ id: 'custom-id', text: 'Custom: payload', metadata: { source: 'custom' } }]);
  });

  it('exposes the configured loaders', () => {
    const text = new TextLoader();
    const registry = createLoaderRegistry([customLoader, text]);

    expect(registry.loaders).toEqual([customLoader, text]);
  });

  it('loads many sources and flattens the result', async () => {
    const registry = createLoaderRegistry([customLoader, new TextLoader()]);

    const docs = await registry.loadMany(['custom:a', 'plain text']);

    expect(docs.map((d) => d.text)).toEqual(['Custom: a', 'plain text']);
  });

  it('throws when no loader accepts the source', async () => {
    const registry = createLoaderRegistry([customLoader]);

    await expect(registry.load('not custom')).rejects.toThrow('No loader found for source');
  });
});
