/**
 * @file voice-grid.tsx
 * @description Browsable grid of Kokoro voices with preview buttons
 */
'use client';

import { Play, Square, Volume2 } from 'lucide-react';
import { getVoices, getLanguageGroups } from '../_services/tts.service';
import { useVoicePreview } from '../_hooks/use-voice-preview';
import { cn } from '../_lib/utils';
import { Spinner } from './ui';
import { ErrorAlert } from './error-boundary';

/** Browsable voice grid grouped by language */
export function VoiceGrid() {
  const voices = getVoices();
  const groups = getLanguageGroups();
  const { previewingVoice, isLoading, error, preview, stopPreview } = useVoicePreview();

  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error.message} onDismiss={stopPreview} />}

      <div className="flex items-center gap-2 text-sm text-poster-text-sub">
        <Volume2 className="w-4 h-4 text-poster-accent-teal" />
        <span>{voices.length} voices across {groups.size} languages</span>
      </div>

      {Array.from(groups.entries()).map(([language, langVoices]) => (
        <div key={language}>
          <h3 className="text-sm font-semibold text-poster-text-main mb-3 flex items-center gap-2">
            {language}
            <span className="text-xs text-poster-text-sub/50 font-normal">({langVoices.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {langVoices.map(voice => {
              const isPreviewing = previewingVoice === voice.id;
              return (
                <div
                  key={voice.id}
                  className={cn(
                    'card bg-poster-surface border shadow-sm transition-all hover:shadow-md cursor-pointer group',
                    isPreviewing ? 'border-poster-accent-teal/40 bg-poster-accent-teal/5' : 'border-poster-border/20 hover:border-poster-accent-teal/20'
                  )}
                >
                  <div className="card-body p-4 flex-row items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{voice.name}</span>
                        <span className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0',
                          voice.gender === 'female'
                            ? 'bg-pink-500/20 text-pink-400'
                            : 'bg-blue-500/20 text-blue-400'
                        )}>
                          {voice.gender === 'female' ? '♀' : '♂'}
                        </span>
                      </div>
                      <p className="text-[11px] text-poster-text-sub/50 font-mono">{voice.id}</p>
                    </div>
                    <button
                      onClick={() => isPreviewing ? stopPreview() : preview(voice.id)}
                      disabled={isLoading && !isPreviewing}
                      className={cn(
                        'btn btn-circle btn-sm transition-all',
                        isPreviewing
                          ? 'btn-accent'
                          : 'btn-ghost group-hover:bg-poster-accent-teal/10 group-hover:text-poster-accent-teal'
                      )}
                    >
                      {isPreviewing && isLoading ? (
                        <Spinner size="xs" />
                      ) : isPreviewing ? (
                        <Square className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
