/**
 * @file document-sidebar.tsx
 * @description Sidebar component for document list and upload
 */
'use client';

import { useState } from 'react';
import { FileText, HardDrive, Loader2, Trash2 } from 'lucide-react';
import { FileUpload, Badge, Spinner, Progress } from './ui';
import { ErrorAlert } from './error-boundary';
import { usePDFStore } from '../_store/pdf.store';
import { useUIStore } from '../_store/ui.store';
import { usePDFUpload } from '../_hooks';
import { formatFileSize } from '../_lib/utils';
import { deleteDocumentVectors } from '../_services/pdf.service';
import { DemoButton } from '../_demo';

/** Sidebar component for document management */
export function DocumentSidebar() {
  // Get state from stores
  const {
    documents,
    isProcessing,
    processingStage,
    processingProgress,
    error,
    clearError,
    removeDocument,
  } = usePDFStore();
  const { modelsReady, loadingModelName, loadingProgress } = useUIStore();
  const { uploadMultiplePDFs } = usePDFUpload();

  // Handle document deletion
  const handleDeleteDocument = async (documentId: string) => {
    try {
      // Delete vectors from IndexedDB
      await deleteDocumentVectors(documentId);
      // Remove from store
      removeDocument(documentId);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  // Calculate total stats
  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunks.length, 0);

  // Upload is disabled when processing or models not ready
  const isUploadDisabled = isProcessing || !modelsReady;

  return (
    <div className="h-full flex flex-col bg-poster-surface/50 border-r border-poster-border/30">
      {/* Header */}
      <div className="p-4 border-b border-poster-border/30">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm text-poster-text-main">Documents</h2>
          <Badge variant="ghost" size="sm" className="bg-white/5 text-poster-text-sub">
            {documents.length}
          </Badge>
        </div>
        {documents.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-poster-accent-teal">{totalChunks} chunks</span>
            <span className="text-poster-text-sub/60">indexed</span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-2">
          <ErrorAlert message={error.message} onDismiss={clearError} />
        </div>
      )}

      {/* Model loading indicator */}
      {!modelsReady && loadingModelName && (
        <div className="p-4 border-b border-poster-border/30 bg-poster-accent-teal/5">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 text-poster-accent-teal animate-spin" />
            <span className="text-sm text-poster-text-main font-medium">
              Loading {loadingModelName}
            </span>
          </div>
          <Progress value={loadingProgress} max={100} className="h-1" />
          <p className="text-xs text-poster-text-sub/50 mt-2">
            Please wait for models to load before uploading
          </p>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="p-4 border-b border-poster-border/30 bg-poster-primary/5">
          <div className="flex items-center gap-3 mb-2">
            <Spinner size="sm" className="text-poster-primary" />
            <span className="text-sm text-poster-text-main font-medium">{processingStage}</span>
          </div>
          <Progress value={processingProgress} max={100} className="h-1" />
        </div>
      )}

      {/* Upload area */}
      <div className="p-4 border-b border-poster-border/30">
        <FileUpload
          onUpload={uploadMultiplePDFs}
          accept={['.pdf', 'application/pdf']}
          maxSize={10 * 1024 * 1024}
          multiple={true}
          disabled={isUploadDisabled}
          isProcessing={isProcessing}
        />
        {!modelsReady && !loadingModelName && (
          <p className="text-xs text-poster-text-sub/50 mt-2 text-center">
            Waiting for models to initialize...
          </p>
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-2">
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-poster-text-sub/40 text-sm italic mb-4">No documents yet</p>
            <DemoButton />
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                id={doc.id}
                filename={doc.filename}
                pageCount={doc.metadata.pageCount}
                chunkCount={doc.chunks.length}
                fileSize={doc.metadata.fileSize}
                onDelete={handleDeleteDocument}
              />
            ))}
          </div>
        )}
      </div>

      {/* Storage info footer */}
      {documents.length > 0 && (
        <div className="p-4 border-t border-poster-border/30 bg-poster-surface/30">
          <div className="flex items-center gap-2 text-xs text-poster-text-sub/60">
            <HardDrive className="w-3 h-3" />
            <span>Embeddings stored locally in IndexedDB</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Props for the DocumentCard component */
interface DocumentCardProps {
  /** Document ID */
  id: string;
  /** Document filename */
  filename: string;
  /** Number of pages */
  pageCount: number;
  /** Number of chunks */
  chunkCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Delete handler */
  onDelete: (id: string) => void;
}

/** Card component for displaying a single document */
function DocumentCard({
  id,
  filename,
  pageCount,
  chunkCount,
  fileSize,
  onDelete,
}: DocumentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="card bg-white/5 border border-white/5 hover:border-poster-primary/50 transition-colors group">
      <div className="card-body p-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/5 rounded-lg text-poster-text-sub group-hover:text-poster-primary transition-colors">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-medium text-sm truncate leading-tight mb-1 text-poster-text-main"
              title={filename}
            >
              {filename}
            </p>
            <div className="flex items-center gap-2 text-xs text-poster-text-sub/50">
              <span>
                {pageCount} page{pageCount !== 1 ? 's' : ''}
              </span>
              <span>•</span>
              <span>{chunkCount} chunks</span>
              <span>•</span>
              <span>{formatFileSize(fileSize)}</span>
            </div>
          </div>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-error/20 text-poster-text-sub hover:text-error transition-all disabled:opacity-50"
            title="Delete document"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
