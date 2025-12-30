/**
 * @file pdf.store.ts
 * @description Zustand store for PDF document management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PDFDocument, AppError } from '../_lib/types';
import { STORAGE_KEYS } from '../_lib/constants';

/** PDF store state and actions */
interface PDFState {
  // State
  /** All uploaded documents */
  documents: PDFDocument[];
  /** Currently active document ID */
  activeDocumentId: string | null;
  /** Whether a document is being processed */
  isProcessing: boolean;
  /** Current processing stage */
  processingStage: string;
  /** Processing progress (0-100) */
  processingProgress: number;
  /** Current error state */
  error: AppError | null;

  // Actions
  /** Add a new document */
  addDocument: (document: PDFDocument) => void;
  /** Remove a document by ID */
  removeDocument: (documentId: string) => void;
  /** Set the active document */
  setActiveDocument: (documentId: string | null) => void;
  /** Clear all documents */
  clearDocuments: () => void;
  /** Set processing state */
  setProcessing: (processing: boolean) => void;
  /** Set processing progress */
  setProcessingProgress: (stage: string, progress: number) => void;
  /** Set error state */
  setError: (error: AppError | null) => void;
  /** Clear error */
  clearError: () => void;

  // Derived state getters
  /** Get total chunk count across all documents */
  getTotalChunks: () => number;
  /** Get the active document */
  getActiveDocument: () => PDFDocument | null;
}

/** PDF store with persistence */
export const usePDFStore = create<PDFState>()(
  persist(
    (set, get) => ({
      // Initial state
      documents: [],
      activeDocumentId: null,
      isProcessing: false,
      processingStage: '',
      processingProgress: 0,
      error: null,

      // Actions
      addDocument: (document) =>
        set((state) => ({
          documents: [...state.documents, document],
          activeDocumentId: document.id,
        })),

      removeDocument: (documentId) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== documentId),
          activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
        })),

      setActiveDocument: (documentId) => set({ activeDocumentId: documentId }),

      clearDocuments: () => set({ documents: [], activeDocumentId: null }),

      setProcessing: (isProcessing) =>
        set({
          isProcessing,
          processingStage: isProcessing ? 'Starting...' : '',
          processingProgress: 0,
        }),

      setProcessingProgress: (processingStage, processingProgress) =>
        set({ processingStage, processingProgress }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),

      // Derived state getters
      getTotalChunks: () => {
        const { documents } = get();
        return documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
      },

      getActiveDocument: () => {
        const { documents, activeDocumentId } = get();
        return documents.find((d) => d.id === activeDocumentId) ?? null;
      },
    }),
    {
      name: STORAGE_KEYS.pdf,
      partialize: (state) => ({
        // Only persist document metadata, not full chunks (those are in IndexedDB)
        documents: state.documents.map((d) => ({
          ...d,
          chunks: [], // Don't persist chunks in localStorage
        })),
      }),
    }
  )
);
