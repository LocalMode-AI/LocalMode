/**
 * @file use-transcriber.ts
 * @description Hook for managing audio transcription and note creation using useOperationList from @localmode/react
 */
'use client';

import { useOperationList, toAppError } from '@localmode/react';
import type { TranscribeResult } from '@localmode/core';
import { createTranscriptionModel } from '../_services/transcriber.service';
import type { VoiceNote } from '../_lib/types';

/** Input args for the transcription operation */
interface TranscribeInput {
  audio: Blob | ArrayBuffer;
  audioUrl: string;
}

/** Lazily-created singleton model instance */
let modelInstance: ReturnType<typeof createTranscriptionModel> | null = null;
function getModel() {
  if (!modelInstance) modelInstance = createTranscriptionModel();
  return modelInstance;
}

/** Hook for transcribing audio and adding notes */
export function useTranscriber() {
  const { items: notes, isLoading: isTranscribing, error: hookError, execute, cancel, reset, clearItems, removeItem } = useOperationList<
    [TranscribeInput], TranscribeResult, VoiceNote
  >({
    fn: async ({ audio }: TranscribeInput, signal: AbortSignal) => {
      const { transcribe } = await import('@localmode/core');
      return transcribe({ model: getModel(), audio, abortSignal: signal });
    },
    transform: (result, input) => ({
      id: crypto.randomUUID(),
      audioUrl: input.audioUrl,
      text: result.text.trim() || '[No speech detected]',
      timestamp: new Date(),
    }),
  });

  /** Transcribe an audio blob and add a new note */
  const transcribeAndAddNote = async (audioBlob: Blob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    await execute({ audio: audioBlob, audioUrl });
  };

  /** Delete a note by ID */
  const deleteNote = (id: string) => removeItem((n) => n.id === id);

  /** Clear all notes */
  const clearNotes = () => { clearItems(); };

  return {
    notes,
    isTranscribing,
    error: toAppError(hookError),
    transcribeAndAddNote,
    cancelTranscription: cancel,
    deleteNote,
    clearNotes,
    clearError: reset,
  };
}
