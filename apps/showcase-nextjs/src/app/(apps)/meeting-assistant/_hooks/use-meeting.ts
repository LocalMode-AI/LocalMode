/**
 * @file use-meeting.ts
 * @description Hook for managing meeting processing — transcription, summarization, and action extraction.
 * Composes useTranscribe and useSummarize from @localmode/react into a multi-step orchestration.
 */
'use client';

import { useState, useRef } from 'react';
import { useTranscribe, useSummarize, downloadBlob } from '@localmode/react';
import { getTranscriptionModel } from '../_services/transcriber.service';
import { getSummarizerModel } from '../_services/summarizer.service';
import { extractActionItems, buildExportContent } from '../_lib/utils';
import { ACCEPTED_AUDIO_TYPES } from '../_lib/constants';
import type { ActionItem, AppError } from '../_lib/types';

/** Active tab in the results view */
export type ActiveTab = 'transcript' | 'summary' | 'actions';

/** Hook for processing meeting audio files */
export function useMeeting() {
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('transcript');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Refs for latest state in async closures
  const stateRef = useRef({ transcript, summary, actionItems, audioUrl });
  stateRef.current = { transcript, summary, actionItems, audioUrl };

  const transcription = useTranscribe({ model: getTranscriptionModel() });
  const summarization = useSummarize({ model: getSummarizerModel() });

  /** Clear error state */
  const clearError = () => setError(null);

  /** Reset all state to initial values */
  const reset = () => {
    setTranscript('');
    setSummary('');
    setActionItems([]);
    setActiveTab('transcript');
    setAudioUrl(null);
    setError(null);
  };

  /** Toggle completion status of an action item */
  const toggleActionItem = (id: string) => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  /**
   * Process an uploaded audio file: transcribe, summarize, and extract action items
   * @param file - Audio file to process
   */
  const processMeeting = async (file: File) => {
    // Validate file type
    const isValidType = ACCEPTED_AUDIO_TYPES.some(
      (type) => file.type === type || file.type.startsWith('audio/')
    );
    if (!isValidType) {
      setError({
        message: `Unsupported file type "${file.type}". Please upload an audio file (MP3, WAV, WebM, M4A, or MP4).`,
        recoverable: true,
      });
      return;
    }

    // Cancel any existing processing
    transcription.cancel();
    summarization.cancel();
    transcription.reset();
    summarization.reset();

    // Reset state for new meeting
    reset();

    // Create audio URL for playback
    setAudioUrl(URL.createObjectURL(file));

    try {
      // Step 1: Transcribe
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      const transcribeResult = await transcription.execute(blob);

      if (!transcribeResult) return;

      const transcriptText = transcribeResult.text.trim() || '[No speech detected]';
      setTranscript(transcriptText);

      // Step 2: Summarize
      if (transcriptText !== '[No speech detected]') {
        const summarizeResult = await summarization.execute({
          text: transcriptText,
          maxLength: 200,
          minLength: 60,
        });

        if (!summarizeResult) return;

        setSummary(summarizeResult.summary.trim());

        // Step 3: Extract action items
        setActionItems(extractActionItems(transcriptText));
      }

      setActiveTab('transcript');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Meeting processing error:', err);
      setError({
        message: err instanceof Error ? err.message : 'Failed to process meeting audio',
        recoverable: true,
      });
    }
  };

  /** Cancel the current processing operation */
  const cancelProcessing = () => {
    transcription.cancel();
    summarization.cancel();
  };

  /** Export the transcript as a .txt file download */
  const exportTranscript = () => {
    const { transcript: t, summary: s, actionItems: items } = stateRef.current;
    if (!t) return;

    const content = buildExportContent(t, s, items);
    downloadBlob(content, `meeting-transcript-${new Date().toISOString().slice(0, 10)}.txt`);
  };

  // Derive loading from react hooks
  const isTranscribing = transcription.isLoading;
  const isSummarizing = summarization.isLoading;

  return {
    // State
    transcript,
    summary,
    actionItems,
    isTranscribing,
    isSummarizing,
    activeTab,
    audioUrl,
    error,
    // Actions
    processMeeting,
    cancelProcessing,
    exportTranscript,
    setActiveTab,
    toggleActionItem,
    clearError,
    reset,
  };
}
