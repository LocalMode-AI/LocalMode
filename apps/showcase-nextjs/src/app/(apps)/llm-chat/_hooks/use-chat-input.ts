/**
 * @file use-chat-input.ts
 * @description Hook for managing chat input state and behavior
 */
'use client';

import { useRef, useEffect } from 'react';
import { useUIStore } from '../_store/ui.store';
import { useChatStore } from '../_store/chat.store';
import { useModelStore } from '../_store/model.store';

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
  const { input, isSending, setInput, setSending, clearInput } = useUIStore();
  const { isStreaming, selectedModel } = useChatStore();
  const { loadingModelId } = useModelStore();
  // Model is ready when a model is selected and not loading
  const isModelReady = Boolean(selectedModel) && !loadingModelId;

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
    if (!input.trim() || isSending || !isModelReady) return;

    const message = input.trim();
    clearInput();
    setSending(true);

    try {
      await onSendMessage(message);
    } finally {
      setSending(false);
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
  const isDisabled = !isModelReady || isSending || isStreaming;
  const canSubmit = input.trim().length > 0 && !isDisabled;

  return {
    textareaRef,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    isDisabled,
    canSubmit,
  };
}
