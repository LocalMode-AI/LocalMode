/**
 * @file use-pdf-upload.ts
 * @description Hook for managing PDF file uploads and processing
 */
'use client';

import { usePDFStore } from '../_store/pdf.store';
import { useChatStore } from '../_store/chat.store';
import { processPDF } from '../_services/pdf.service';
import { createMessage, isPDFFile, formatFileSize } from '../_lib/utils';
import { PDF_CONFIG } from '../_lib/constants';

/** Hook for PDF upload and processing */
export function usePDFUpload() {
  const pdfStore = usePDFStore();
  const chatStore = useChatStore();

  /**
   * Upload and process a PDF file
   * @param file - PDF file to process
   */
  const uploadPDF = async (file: File) => {
    // Validate file type
    if (!isPDFFile(file)) {
      pdfStore.setError({
        message: 'Invalid file type. Please upload a PDF file.',
        code: 'INVALID_FILE_TYPE',
        recoverable: true,
      });
      return;
    }

    // Validate file size
    if (file.size > PDF_CONFIG.maxFileSize) {
      pdfStore.setError({
        message: `File too large. Maximum size is ${formatFileSize(PDF_CONFIG.maxFileSize)}.`,
        code: 'FILE_TOO_LARGE',
        recoverable: true,
      });
      return;
    }

    pdfStore.setProcessing(true);
    pdfStore.clearError();

    try {
      // Process PDF with progress updates
      const document = await processPDF(file, (stage, progress) => {
        pdfStore.setProcessingProgress(stage, progress);
      });

      // Add document to store
      pdfStore.addDocument(document);

      // Add system message about successful upload
      const successMessage = createMessage(
        'system',
        `✓ Processed "${file.name}" - ${document.chunks.length} chunks created from ${document.metadata.pageCount} pages`
      );
      chatStore.addMessage(successMessage);
    } catch (error) {
      console.error('PDF processing error:', error);
      pdfStore.setError({
        message: `Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'PROCESSING_FAILED',
        recoverable: true,
      });

      // Add error message to chat
      const errorMessage = createMessage(
        'system',
        `✗ Failed to process "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      chatStore.addMessage(errorMessage);
    } finally {
      pdfStore.setProcessing(false);
    }
  };

  /**
   * Upload multiple PDF files
   * @param files - Array of PDF files
   */
  const uploadMultiplePDFs = async (files: File[]) => {
    for (const file of files) {
      await uploadPDF(file);
    }
  };

  return {
    uploadPDF,
    uploadMultiplePDFs,
    isProcessing: pdfStore.isProcessing,
    processingStage: pdfStore.processingStage,
    processingProgress: pdfStore.processingProgress,
    error: pdfStore.error,
  };
}
