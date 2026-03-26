/**
 * @file voice-view.tsx
 * @description Main view for the voice notes application with recording and notes list
 */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Mic, MicOff, Trash2, AudioLines, FileText, ArrowLeft, Play, Upload } from 'lucide-react';
import { Button, IconBox, Spinner, Badge, StatusDot } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useVoiceRecorder } from '../_hooks/use-voice-recorder';
import { useTranscriber } from '../_hooks/use-transcriber';
import { cn, formatTimestamp, formatRelativeTime } from '../_lib/utils';
import { MODEL_CONFIG } from '../_lib/constants';

/** Main voice notes view with recording button and notes list */
export function VoiceView() {
  const { isRecording, error: recordingError, startRecording, stopRecording, clearError: clearRecordingError } = useVoiceRecorder();
  const { notes, isTranscribing, error: transcribeError, transcribeAndAddNote, cancelTranscription, deleteNote, clearError: clearTranscribeError } = useTranscriber();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge errors: recording error takes precedence if both present
  const error = recordingError || transcribeError;

  /** Handle audio file upload for transcription */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      transcribeAndAddNote(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Handle record button press - toggle recording */
  const handleRecordToggle = async () => {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (audioBlob) {
        transcribeAndAddNote(audioBlob);
      }
    } else {
      startRecording();
    }
  };

  /** Delete a note by ID */
  const handleDeleteNote = (id: string) => {
    // Revoke the blob URL to free memory
    const note = notes.find((n) => n.id === id);
    if (note) {
      URL.revokeObjectURL(note.audioUrl);
    }
    deleteNote(id);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <IconBox size="sm" variant="primary" className="bg-poster-accent-purple/10 text-poster-accent-purple ring-1 ring-poster-accent-purple/30">
              <AudioLines className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Voice Notes</h1>
              <p className="text-xs text-poster-text-sub">Record, transcribe, and manage notes</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              Whisper Tiny
              <span className="text-poster-accent-purple">&middot;</span>
              {MODEL_CONFIG.modelSize}
            </span>
          </div>
          {notes.length > 0 && (
            <span className="badge badge-sm bg-poster-accent-purple/10 text-poster-accent-purple border-poster-accent-purple/20">
              {notes.length} note{notes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-purple/40 to-transparent" />

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert
              message={error.message}
              onDismiss={() => { clearRecordingError(); clearTranscribeError(); }}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <ErrorBoundary>
              {/* Recording section */}
              <div className="flex flex-col items-center mb-10">
                {/* Record button with animated rings */}
                <div className="relative">
                  {/* Ping ring when recording */}
                  {isRecording && (
                    <span className="absolute inset-0 w-20 h-20 rounded-full bg-error/30 animate-ping" />
                  )}
                  {/* Outer decorative ring */}
                  <div className={cn(
                    'absolute -inset-3 rounded-full transition-all duration-500',
                    isRecording
                      ? 'border-2 border-error/30'
                      : 'border border-poster-border/10'
                  )} />
                  <button
                    onClick={handleRecordToggle}
                    disabled={isTranscribing}
                    className={cn(
                      'relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300',
                      'shadow-lg hover:shadow-xl focus:outline-none',
                      isRecording
                        ? 'bg-error hover:bg-error/90 shadow-error/30'
                        : 'bg-gradient-to-br from-poster-primary to-poster-accent-purple hover:brightness-110 shadow-poster-primary/20',
                      isTranscribing && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {isRecording ? (
                      <MicOff className="w-8 h-8 text-white" />
                    ) : (
                      <Mic className="w-8 h-8 text-white" />
                    )}
                  </button>
                </div>

                {/* Status text */}
                <div className="mt-6 flex items-center gap-2 min-h-[24px]">
                  {isRecording && (
                    <div className="flex items-center gap-2 animate-fadeIn">
                      <StatusDot color="error" pulse />
                      <span className="text-sm font-medium text-error">Recording...</span>
                    </div>
                  )}
                  {isTranscribing && (
                    <div className="flex items-center gap-3 animate-fadeIn">
                      {/* Waveform animation */}
                      <div className="flex items-end gap-0.5 h-4">
                        <span className="w-1 bg-poster-accent-purple rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '40%', animationDelay: '0ms' }} />
                        <span className="w-1 bg-poster-accent-purple rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '70%', animationDelay: '150ms' }} />
                        <span className="w-1 bg-poster-accent-purple rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '100%', animationDelay: '300ms' }} />
                        <span className="w-1 bg-poster-accent-purple rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: '450ms' }} />
                      </div>
                      <span className="text-sm text-poster-text-sub">Transcribing...</span>
                      <button
                        onClick={cancelTranscription}
                        className="text-xs text-poster-text-sub hover:text-poster-text-main underline underline-offset-2 transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {!isRecording && !isTranscribing && (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-sm text-poster-text-sub">
                        Tap to start recording
                      </span>
                      <div className="flex items-center gap-2 text-xs text-poster-text-sub/50">
                        <span>or</span>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-poster-surface border border-poster-border/20 text-poster-text-sub hover:text-poster-text-main hover:border-poster-border/40 transition-all duration-200"
                        >
                          <Upload className="w-3 h-3" />
                          Upload audio file
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*,.wav,.mp3,.webm,.m4a,.ogg"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 && !isTranscribing ? (
                /* Empty state */
                <div className="flex flex-col items-center py-16 animate-fadeIn">
                  {/* Concentric rings icon */}
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-poster-accent-purple/10 rounded-full blur-2xl scale-150" />
                    <div className="relative w-20 h-20 rounded-full bg-poster-surface border border-poster-border/20 flex items-center justify-center">
                      <div className="absolute w-28 h-28 rounded-full border border-poster-accent-purple/10" />
                      <div className="absolute w-36 h-36 rounded-full border border-poster-accent-purple/5" />
                      <Mic className="w-8 h-8 text-poster-accent-purple/60" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-poster-text-main mb-2">Voice Notes</h3>
                  <p className="text-sm text-poster-text-sub text-center max-w-xs">
                    Record, transcribe, and manage voice notes with Whisper AI. All processing happens on-device.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Transcribing card */}
                  {isTranscribing && (
                    <div className="p-5 rounded-2xl bg-poster-surface/80 border border-poster-accent-purple/20 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        {/* Waveform bars */}
                        <div className="flex items-end gap-0.5 h-5">
                          <span className="w-1 bg-poster-accent-purple/60 rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '30%', animationDelay: '0ms' }} />
                          <span className="w-1 bg-poster-accent-purple/60 rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: '100ms' }} />
                          <span className="w-1 bg-poster-accent-purple/60 rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '100%', animationDelay: '200ms' }} />
                          <span className="w-1 bg-poster-accent-purple/60 rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '80%', animationDelay: '300ms' }} />
                          <span className="w-1 bg-poster-accent-purple/60 rounded-full animate-[waveform_0.8s_ease-in-out_infinite]" style={{ height: '50%', animationDelay: '400ms' }} />
                        </div>
                        <span className="text-sm text-poster-accent-purple font-medium">Transcribing audio...</span>
                      </div>
                    </div>
                  )}

                  {/* Note cards */}
                  {notes.map((note, index) => (
                    <div
                      key={note.id}
                      className="group p-5 rounded-2xl bg-poster-surface/60 border border-poster-border/20 hover:border-poster-border/40 hover:bg-poster-surface/80 transition-all duration-200"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Note header with timestamp and delete */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-poster-text-sub" title={formatTimestamp(note.timestamp)}>
                          {formatRelativeTime(note.timestamp)}
                        </span>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-poster-text-sub hover:text-error hover:bg-error/10 transition-all duration-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Transcribed text */}
                      <p className="text-sm text-poster-text-main leading-relaxed mb-4 whitespace-pre-wrap">
                        {note.text}
                      </p>

                      {/* Audio player */}
                      <div className="flex items-center gap-3 pt-3 border-t border-poster-border/10">
                        <AudioLines className="w-3.5 h-3.5 text-poster-text-sub shrink-0" />
                        <audio
                          controls
                          src={note.audioUrl}
                          className="w-full h-8 opacity-70 hover:opacity-100 transition-opacity duration-200"
                          preload="metadata"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

    </div>
  );
}
