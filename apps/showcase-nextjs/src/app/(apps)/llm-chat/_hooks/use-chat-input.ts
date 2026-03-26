/**
 * @file use-chat-input.ts
 * @description Hook for managing chat input state and behavior
 */
'use client';

import { useRef, useEffect } from 'react';
import { useUIStore } from '../_store/ui.store';
import { useChatStore } from '../_store/chat.store';
import { useModelStore } from '../_store/model.store';
import { useImageUpload } from './use-image-upload';
import type { ChatImageAttachment } from '../_lib/types';

/** Options for the useChatInput hook */
interface UseChatInputOptions {
  /** Callback when a message is sent */
  onSendMessage: (message: string, images?: ChatImageAttachment[]) => void | Promise<void>;
  /** Whether the model is currently streaming */
  isStreaming: boolean;
  /** Whether the selected model supports vision */
  supportsVision?: boolean;
}

/**
 * Hook for managing chat input state and behavior
 * @param options - Hook options
 */
export function useChatInput(options: UseChatInputOptions) {
  const { onSendMessage, isStreaming, supportsVision } = options;

  // Image upload state
  const imageUpload = useImageUpload();

  // Get state from stores
  const { input, isSending, setInput, setSending, clearInput } = useUIStore();
  const selectedModel = useChatStore((s) => s.selectedModel);
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
    const hasImages = supportsVision && imageUpload.images.length > 0;
    if ((!input.trim() && !hasImages) || isSending || !isModelReady) return;

    const message = input.trim();
    const imagesToSend = hasImages ? [...imageUpload.images] : undefined;
    clearInput();
    imageUpload.clearImages();
    setSending(true);

    try {
      await onSendMessage(message, imagesToSend);
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
  const hasImages = supportsVision && imageUpload.images.length > 0;
  const canSubmit = (input.trim().length > 0 || hasImages) && !isDisabled;

  return {
    textareaRef,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    isDisabled,
    canSubmit,
    // Image upload
    imageUpload,
    supportsVision: supportsVision ?? false,
  };
}
