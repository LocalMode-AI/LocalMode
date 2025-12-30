/**
 * @file use-chat-input.ts
 * @description Hook for managing chat input state and behavior
 */
'use client';

import { useRef, useEffect } from 'react';
import { useUIStore } from '../_store/ui.store';
import { useChatStore } from '../_store/chat.store';
import { usePDFStore } from '../_store/pdf.store';

/** Options for the useChatInput hook */
interface UseChatInputOptions {
  /** Callback when a message is sent */
  onSendMessage: (message: string) => void | Promise<void>;
}

/**
 * Hook for managing chat input state and behavior
 * @param options - Hook options
 */
export function useChatInput(options: UseChatInputOptions) {
  const { onSendMessage } = options;

  // Get state from stores
  const { input, setInput, clearInput, modelsReady } = useUIStore();
  const { isSearching } = useChatStore();
  const { documents, isProcessing } = usePDFStore();

  // Ref for textarea auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  /**
   * Submit the current message
   */
  const submitMessage = async () => {
    if (!input.trim() || isSearching || !modelsReady || documents.length === 0) return;

    const message = input.trim();
    clearInput();

    try {
      await onSendMessage(message);
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage();
  };

  /**
   * Handle keyboard events (Enter to send)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  /**
   * Handle input changes
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Derive state
  const isDisabled = !modelsReady || isSearching || isProcessing || documents.length === 0;
  const canSubmit = input.trim().length > 0 && !isDisabled;
  const placeholder =
    documents.length === 0
      ? 'Upload a PDF first...'
      : !modelsReady
        ? 'Loading models...'
        : 'Ask a question about your documents...';

  return {
    textareaRef,
    input,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    isDisabled,
    canSubmit,
    placeholder,
  };
}
