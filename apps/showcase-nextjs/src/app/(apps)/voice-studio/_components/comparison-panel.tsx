/**
 * @file comparison-panel.tsx
 * @description Side-by-side voice comparison with independent playback
 */
'use client';

import { Volume2 } from 'lucide-react';
import { useVoiceComparison } from '../_hooks/use-voice-comparison';
import { getVoices } from '../_services/tts.service';
import { cn } from '../_lib/utils';
import { Spinner } from './ui';
import { ErrorAlert } from './error-boundary';

/** Side-by-side voice comparison panel */
export function ComparisonPanel() {
  const voices = getVoices();
  const {
    voiceA, setVoiceA, voiceB, setVoiceB,
    comparisonText, setComparisonText,
    audioUrlA, audioUrlB,
    isComparing, error,
    compare,
  } = useVoiceComparison();

  return (
    <div className="space-y-5">
      {error && <ErrorAlert message={error.message} />}

      {/* Voice selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-poster-surface border border-poster-border/20 shadow-lg">
          <div className="card-body p-4 space-y-2">
            <label className="text-xs font-semibold text-poster-accent-teal">Voice A</label>
            <select
              value={voiceA}
              onChange={(e) => setVoiceA(e.target.value)}
              disabled={isComparing}
              className="select select-bordered w-full bg-black/20 border-poster-border/20 text-sm"
            >
              {voices.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.languageLabel}, {v.gender === 'female' ? '♀' : '♂'})</option>
              ))}
            </select>
            {audioUrlA && (
              <audio controls src={audioUrlA} className="w-full h-10 mt-2" preload="auto" />
            )}
          </div>
        </div>

        <div className="card bg-poster-surface border border-poster-border/20 shadow-lg">
          <div className="card-body p-4 space-y-2">
            <label className="text-xs font-semibold text-poster-accent-purple">Voice B</label>
            <select
              value={voiceB}
              onChange={(e) => setVoiceB(e.target.value)}
              disabled={isComparing}
              className="select select-bordered w-full bg-black/20 border-poster-border/20 text-sm"
            >
              {voices.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.languageLabel}, {v.gender === 'female' ? '♀' : '♂'})</option>
              ))}
            </select>
            {audioUrlB && (
              <audio controls src={audioUrlB} className="w-full h-10 mt-2" preload="auto" />
            )}
          </div>
        </div>
      </div>

      {/* Comparison text */}
      <div className="card bg-poster-surface border border-poster-border/20 shadow-lg">
        <div className="card-body p-4">
          <textarea
            value={comparisonText}
            onChange={(e) => setComparisonText(e.target.value)}
            placeholder="Enter text to compare..."
            disabled={isComparing}
            className="textarea textarea-bordered w-full min-h-[80px] bg-black/20 border-poster-border/20 text-sm resize-y"
          />
        </div>
      </div>

      {/* Compare button */}
      <div className="flex justify-center">
        <button
          onClick={compare}
          disabled={!comparisonText.trim() || isComparing}
          className={cn(
            'btn btn-md px-10 gap-2 text-white font-semibold shadow-lg transition-all',
            'bg-gradient-to-r from-poster-accent-teal to-poster-accent-purple',
            'hover:shadow-xl hover:scale-[1.02]',
            'disabled:opacity-40 active:scale-[0.98]'
          )}
        >
          {isComparing ? <Spinner size="sm" /> : <Volume2 className="w-4 h-4" />}
          {isComparing ? 'Comparing...' : 'Compare Voices'}
        </button>
      </div>
    </div>
  );
}
