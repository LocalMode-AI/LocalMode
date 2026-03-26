/**
 * @file use-image-upload.ts
 * @description Hook for managing image attachments for vision model chat
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { readFileAsDataUrl } from '@localmode/react';
import type { ChatImageAttachment, AppError } from '../_lib/types';
import { validateImageFile } from '../_lib/utils';
import { IMAGE_CONFIG } from '../_lib/constants';

/**
 * Hook for managing image attachments in the chat input.
 *
 * Handles file validation, base64 conversion, preview URLs, and cleanup.
 */
export function useImageUpload() {
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  /** Add images from File objects (validates, converts to base64, creates previews) */
  const addImages = async (files: File[]) => {
    setError(null);

    const remaining = IMAGE_CONFIG.maxCount - images.length;
    if (remaining <= 0) {
      setError({ message: `Maximum ${IMAGE_CONFIG.maxCount} images per message`, recoverable: true });
      return;
    }

    const filesToAdd = files.slice(0, remaining);
    if (filesToAdd.length < files.length) {
      setError({ message: `Only ${remaining} more image${remaining > 1 ? 's' : ''} allowed (max ${IMAGE_CONFIG.maxCount})`, recoverable: true });
    }

    const newAttachments: ChatImageAttachment[] = [];

    for (const file of filesToAdd) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError({ message: validationError, recoverable: true });
        continue;
      }

      const dataUrl = await readFileAsDataUrl(file);
      // Extract base64 data from data URL (remove "data:image/...;base64," prefix)
      const base64Data = dataUrl.split(',')[1];
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(previewUrl);

      newAttachments.push({
        data: base64Data,
        mimeType: file.type,
        name: file.name,
        previewUrl,
      });
    }

    if (newAttachments.length > 0) {
      setImages((prev) => [...prev, ...newAttachments]);
    }
  };

  /** Remove an image by index */
  const removeImage = (index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        objectUrlsRef.current = objectUrlsRef.current.filter((url) => url !== removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  /** Clear all images and revoke preview URLs */
  const clearImages = () => {
    for (const img of images) {
      URL.revokeObjectURL(img.previewUrl);
    }
    objectUrlsRef.current = [];
    setImages([]);
  };

  /** Handle paste events — extract images from clipboard */
  const pasteHandler = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      event.preventDefault();
      addImages(imageFiles);
    }
  };

  const clearError = () => setError(null);

  return {
    images,
    addImages,
    removeImage,
    clearImages,
    pasteHandler,
    error,
    clearError,
  };
}
