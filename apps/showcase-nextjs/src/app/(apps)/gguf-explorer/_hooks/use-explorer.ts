/**
 * @file use-explorer.ts
 * @description Orchestrating hook for the GGUF Explorer app.
 * Manages the browse -> inspect -> chat flow with state for each phase.
 * Owns all ML/async state via useState; no Zustand store needed.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@localmode/react';
import { inspectModel } from '../_services/gguf.service';
import { createChatModel } from '../_services/chat.service';
import { CHAT_CONFIG } from '../_lib/constants';
import type {
  ExplorerTab,
  ModelSelection,
  InspectionResult,
  DownloadProgress,
  AppError,
  ChatMessage,
} from '../_lib/types';
import type { WllamaModelEntry, WllamaLoadProgress } from '@localmode/wllama';

/** Hook for the full GGUF Explorer state machine */
export function useExplorer() {
  // ── Tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ExplorerTab>('browse');

  // ── Model selection ────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);

  // ── Inspection state ───────────────────────────────────────
  const [inspectionResult, setInspectionResult] = useState<InspectionResult | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<AppError | null>(null);
  const inspectAbortRef = useRef<AbortController | null>(null);

  // ── Chat / download state ──────────────────────────────────
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    status: 'idle',
    progress: 0,
    loaded: 0,
    total: 0,
  });
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [chatError, setChatError] = useState<AppError | null>(null);

  // Track the model ref for useChat — only create when user clicks download
  const modelRef = useRef<ReturnType<typeof createChatModel> | null>(null);
  const modelUrlRef = useRef<string>('');

  // ── useChat from @localmode/react ──────────────────────────
  // We pass the model ref so useChat always has the latest model
  const chat = useChat({
    model: modelRef.current!,
    systemPrompt: CHAT_CONFIG.systemPrompt,
    maxTokens: CHAT_CONFIG.maxTokens,
    temperature: CHAT_CONFIG.temperature,
    persist: false,
  });

  // ── Cleanup abort on unmount ───────────────────────────────
  useEffect(() => {
    return () => {
      inspectAbortRef.current?.abort();
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────

  /** Select a curated model from the catalog */
  const selectCuratedModel = (entry: WllamaModelEntry) => {
    // Abort any in-flight inspection
    inspectAbortRef.current?.abort();

    // Reset state for new model
    setInspectionResult(null);
    setInspectError(null);
    setIsModelLoaded(false);
    setDownloadProgress({ status: 'idle', progress: 0, loaded: 0, total: 0 });
    setChatError(null);
    modelRef.current = null;
    modelUrlRef.current = '';
    chat.clearMessages();

    const selection: ModelSelection = {
      url: entry.url,
      source: 'curated',
      entry,
    };
    setSelectedModel(selection);
    setActiveTab('inspect');

    // Start inspection automatically
    runInspection(selection.url);
  };

  /** Select a custom URL */
  const selectCustomUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Abort any in-flight inspection
    inspectAbortRef.current?.abort();

    // Reset state
    setInspectionResult(null);
    setInspectError(null);
    setIsModelLoaded(false);
    setDownloadProgress({ status: 'idle', progress: 0, loaded: 0, total: 0 });
    setChatError(null);
    modelRef.current = null;
    modelUrlRef.current = '';
    chat.clearMessages();

    const selection: ModelSelection = {
      url: trimmed,
      source: 'custom',
    };
    setSelectedModel(selection);
    setActiveTab('inspect');

    // Start inspection automatically
    runInspection(trimmed);
  };

  /** Run metadata + compat inspection */
  const runInspection = async (url: string) => {
    inspectAbortRef.current?.abort();
    const controller = new AbortController();
    inspectAbortRef.current = controller;

    setIsInspecting(true);
    setInspectError(null);
    setInspectionResult(null);

    try {
      const result = await inspectModel(url, {
        abortSignal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setInspectionResult({
        metadata: result.metadata,
        compat: result,
      });
      setIsInspecting(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof Error && error.name === 'AbortError') return;

      setIsInspecting(false);
      setInspectError({
        message: error instanceof Error ? error.message : 'Failed to inspect model',
        recoverable: true,
      });
    }
  };

  /** Retry the last inspection */
  const retryInspection = () => {
    if (selectedModel) {
      runInspection(selectedModel.url);
    }
  };

  /** Handle progress callback from wllama model loading */
  const handleProgress = (progress: WllamaLoadProgress) => {
    if (progress.status === 'progress' || progress.status === 'download') {
      setDownloadProgress({
        status: 'downloading',
        progress: progress.progress ?? 0,
        loaded: progress.loaded ?? 0,
        total: progress.total ?? 0,
        text: progress.text,
      });
    } else if (progress.status === 'ready' || progress.status === 'done') {
      setDownloadProgress({
        status: 'ready',
        progress: 100,
        loaded: progress.total ?? 0,
        total: progress.total ?? 0,
        text: progress.text,
      });
      setIsModelLoaded(true);
    } else if (progress.status === 'initiate') {
      setDownloadProgress({
        status: 'loading',
        progress: 0,
        loaded: 0,
        total: progress.total ?? 0,
        text: progress.text ?? 'Initializing...',
      });
    }
  };

  /** Download and load the model for chat */
  const downloadModel = async () => {
    if (!selectedModel) return;

    setChatError(null);
    setDownloadProgress({ status: 'loading', progress: 0, loaded: 0, total: 0, text: 'Downloading model...' });

    try {
      const model = createChatModel(selectedModel.url, {
        onProgress: handleProgress,
        temperature: CHAT_CONFIG.temperature,
        maxTokens: CHAT_CONFIG.maxTokens,
        systemPrompt: CHAT_CONFIG.systemPrompt,
      });
      modelRef.current = model;
      modelUrlRef.current = selectedModel.url;

      // Trigger actual model download + WASM init by calling doGenerate with a tiny prompt.
      // This forces wllama to download the GGUF file and compile the WASM binary.
      // The progress callback will fire during this process.
      await model.doGenerate({ prompt: 'Hi', maxTokens: 1 });

      // Model is now fully loaded and ready for chat
      setIsModelLoaded(true);
      setDownloadProgress({
        status: 'ready',
        progress: 100,
        loaded: 0,
        total: 0,
        text: 'Model ready',
      });
    } catch (error) {
      // If it's an abort, ignore
      if (error instanceof Error && error.name === 'AbortError') return;
      setChatError({
        message: error instanceof Error ? error.message : 'Failed to load model',
        recoverable: true,
      });
      setDownloadProgress({ status: 'error', progress: 0, loaded: 0, total: 0 });
    }
  };

  /** Send a chat message */
  const sendMessage = async (text: string) => {
    if (!modelRef.current || !isModelLoaded) return;
    setChatError(null);

    try {
      await chat.send(text);
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
        return;
      }
      setChatError({
        message: error instanceof Error ? error.message : 'Failed to generate response',
        recoverable: true,
      });
    }
  };

  /** Cancel streaming */
  const cancelStreaming = () => {
    chat.cancel();
  };

  /** Clear errors */
  const clearInspectError = () => setInspectError(null);
  const clearChatError = () => setChatError(null);

  // ── Derived state ──────────────────────────────────────────
  const canInspect = selectedModel !== null;
  const canChat = inspectionResult !== null;
  const isDownloading = downloadProgress.status === 'downloading' || downloadProgress.status === 'loading';

  return {
    // Tab
    activeTab,
    setActiveTab,

    // Model selection
    selectedModel,
    selectCuratedModel,
    selectCustomUrl,

    // Inspection
    inspectionResult,
    isInspecting,
    inspectError,
    clearInspectError,
    retryInspection,

    // Chat / download
    downloadProgress,
    isModelLoaded,
    isDownloading,
    chatError,
    clearChatError,
    downloadModel,
    sendMessage,
    cancelStreaming,
    messages: chat.messages as ChatMessage[],
    isStreaming: chat.isStreaming,

    // Derived
    canInspect,
    canChat,
  };
}
