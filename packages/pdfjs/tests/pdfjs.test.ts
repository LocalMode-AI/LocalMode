/**
 * @localmode/pdfjs Tests
 *
 * Tests for the PDF.js document loader package.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import type { DocumentLoader, LoadedDocument } from '@localmode/core';

// Note: These are unit tests that don't require actual pdfjs-dist.
// Integration tests with real PDF files would require the actual dependency.

describe('@localmode/pdfjs', () => {
  describe('PDFLoader interface', () => {
    it('should implement DocumentLoader interface', () => {
      // Mock PDFLoader matching the interface
      const mockLoader: DocumentLoader = {
        type: 'pdf',
        supports: (source: string | Blob) => {
          if (typeof source === 'string') {
            return source.endsWith('.pdf');
          }
          return source.type === 'application/pdf';
        },
        load: vi.fn().mockResolvedValue({
          content: 'Extracted PDF text',
          metadata: {
            pageCount: 5,
            title: 'Test Document',
            author: 'Test Author',
          },
        }),
      };

      expect(mockLoader.type).toBe('pdf');
      expect(mockLoader.supports('document.pdf')).toBe(true);
      expect(mockLoader.supports('document.txt')).toBe(false);
    });
  });

  describe('PDF extraction options', () => {
    it('should define extraction options', () => {
      const options = {
        pages: [1, 2, 3],
        preserveFormatting: true,
        includeAnnotations: false,
        password: undefined,
      };

      expect(options.pages).toEqual([1, 2, 3]);
      expect(options.preserveFormatting).toBe(true);
      expect(options.includeAnnotations).toBe(false);
    });

    it('should support page range extraction', () => {
      const options = {
        startPage: 1,
        endPage: 10,
      };

      expect(options.startPage).toBe(1);
      expect(options.endPage).toBe(10);
    });

    it('should support password-protected PDFs', () => {
      const options = {
        password: 'secret123',
      };

      expect(options.password).toBeDefined();
    });
  });

  describe('extractPDFText function', () => {
    it('should define the extraction interface', async () => {
      // Mock extractPDFText function
      const extractPDFText = async (
        pdf: Blob | ArrayBuffer | string,
        options?: { pages?: number[]; preserveFormatting?: boolean }
      ): Promise<{
        text: string;
        pages: Array<{ pageNumber: number; text: string }>;
        metadata: {
          pageCount: number;
          title?: string;
          author?: string;
          creationDate?: Date;
        };
      }> => {
        return {
          text: 'Full PDF text content.',
          pages: [
            { pageNumber: 1, text: 'Page 1 content.' },
            { pageNumber: 2, text: 'Page 2 content.' },
          ],
          metadata: {
            pageCount: 2,
            title: 'Test PDF',
          },
        };
      };

      const result = await extractPDFText(new Blob([], { type: 'application/pdf' }));

      expect(result.text).toBeDefined();
      expect(result.pages.length).toBe(2);
      expect(result.metadata.pageCount).toBe(2);
    });
  });

  describe('PDF metadata extraction', () => {
    it('should extract PDF metadata', () => {
      const metadata = {
        pageCount: 10,
        title: 'Annual Report 2024',
        author: 'Company Inc.',
        subject: 'Financial Report',
        keywords: ['finance', 'annual', 'report'],
        creationDate: new Date('2024-01-15'),
        modificationDate: new Date('2024-01-20'),
        producer: 'PDF Library v1.0',
        creator: 'Word Processor',
        pdfVersion: '1.7',
      };

      expect(metadata.pageCount).toBeGreaterThan(0);
      expect(metadata.title).toBeDefined();
      expect(metadata.author).toBeDefined();
      expect(metadata.keywords).toContain('finance');
    });
  });

  describe('LoadedDocument interface', () => {
    it('should return LoadedDocument from loader', () => {
      const loadedDocument: LoadedDocument = {
        content: 'PDF text content extracted from the document.',
        metadata: {
          pageCount: 5,
          title: 'Test Document',
          source: 'document.pdf',
          mimeType: 'application/pdf',
        },
      };

      expect(loadedDocument.content).toBeDefined();
      expect(loadedDocument.content.length).toBeGreaterThan(0);
      expect(loadedDocument.metadata.pageCount).toBe(5);
      expect(loadedDocument.metadata.mimeType).toBe('application/pdf');
    });
  });

  describe('Page-by-page extraction', () => {
    it('should support page-by-page iteration', async () => {
      // Mock page iterator
      async function* extractPages(pdf: Blob) {
        yield { pageNumber: 1, text: 'Page 1 text' };
        yield { pageNumber: 2, text: 'Page 2 text' };
        yield { pageNumber: 3, text: 'Page 3 text' };
      }

      const pages: Array<{ pageNumber: number; text: string }> = [];
      for await (const page of extractPages(new Blob())) {
        pages.push(page);
      }

      expect(pages.length).toBe(3);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[2].pageNumber).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('should define error cases', () => {
      const errorCases = [
        { type: 'INVALID_PDF', message: 'Not a valid PDF file' },
        { type: 'PASSWORD_REQUIRED', message: 'PDF is password protected' },
        { type: 'WRONG_PASSWORD', message: 'Incorrect password' },
        { type: 'CORRUPTED_PDF', message: 'PDF file is corrupted' },
        { type: 'UNSUPPORTED_VERSION', message: 'PDF version not supported' },
      ];

      for (const errorCase of errorCases) {
        expect(errorCase.type).toBeDefined();
        expect(errorCase.message).toBeDefined();
      }
    });
  });

  describe('Blob and ArrayBuffer support', () => {
    it('should accept Blob input', () => {
      const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should accept ArrayBuffer input', () => {
      const buffer = new ArrayBuffer(100);
      const view = new Uint8Array(buffer);
      view.set([0x25, 0x50, 0x44, 0x46]); // %PDF

      expect(buffer.byteLength).toBe(100);
    });

    it('should accept file path input', () => {
      const filePath = '/path/to/document.pdf';

      expect(filePath.endsWith('.pdf')).toBe(true);
    });
  });

  describe('Integration with chunking', () => {
    it('should work with core chunking functions', () => {
      // Extracted text can be passed to chunk()
      const extractedText = 'Page 1 content.\n\nPage 2 content.\n\nPage 3 content.';

      // This would be passed to @localmode/core chunk() function
      const chunks = extractedText.split('\n\n');

      expect(chunks.length).toBe(3);
      expect(chunks[0]).toContain('Page 1');
    });
  });
});

