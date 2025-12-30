/**
 * @file _demo/demo-button.tsx
 * @description Self-contained demo button component
 */
'use client';

import { useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { loadDemoPDF } from './index';
import { usePDFUpload } from '../_hooks';
import { usePDFStore } from '../_store/pdf.store';
import { useUIStore } from '../_store/ui.store';
import { Button } from '../_components/ui';

/**
 * Self-contained button to load the demo PDF
 * Handles its own loading state and uses existing upload infrastructure
 */
export function DemoButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { uploadPDF } = usePDFUpload();
  const { isProcessing } = usePDFStore();
  const { modelsReady } = useUIStore();

  const isDisabled = isLoading || isProcessing || !modelsReady;

  const handleClick = async () => {
    if (isDisabled) return;

    setIsLoading(true);
    try {
      const demoFile = await loadDemoPDF();
      await uploadPDF(demoFile);
    } catch (err) {
      console.error('Failed to load demo:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={isDisabled}
        className="gap-2 bg-linear-to-r from-poster-primary/10 to-poster-accent-teal/10 border border-poster-primary/20 hover:border-poster-primary/40 text-poster-text-main"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <PlayCircle className="w-4 h-4 text-poster-primary" />
        )}
        <span>{isLoading ? 'Loading...' : 'Try Demo PDF'}</span>
      </Button>
      <p className="text-xs text-poster-text-sub/40 mt-2">Load a sample AI guide to explore</p>
    </>
  );
}
