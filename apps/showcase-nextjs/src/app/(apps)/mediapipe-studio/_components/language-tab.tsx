/**
 * @file language-tab.tsx
 * @description Language detection tab
 */
'use client';

import { Languages } from 'lucide-react';
import { useLanguageDetector } from '../_hooks';
import { Spinner, Badge } from './ui';
import { ErrorAlert } from './error-boundary';
import { formatPercent } from '../_lib/utils';
import { LANGUAGE_MIN_LENGTH } from '../_lib/constants';

/** Language detection tab — identifies the language of input text. */
export function LanguageTab() {
  const { text, setText, languages, isDetecting, error, detectNow } = useLanguageDetector();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-3 bg-poster-surface p-5">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-poster-primary" />
          <h3 className="text-sm font-semibold text-poster-text-main">Text</h3>
        </div>
        <textarea
          className="textarea textarea-bordered min-h-[160px] w-full text-sm"
          placeholder="Type or paste text in any language… (e.g. Bonjour le monde)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-poster-text-sub">
          Detection runs automatically after {LANGUAGE_MIN_LENGTH} characters. Supports
          110 languages.
        </p>
        {error && <ErrorAlert message={error.message} onRetry={detectNow} />}
      </div>

      <div className="card bg-poster-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-poster-text-main">
          Detected Languages
        </h3>
        {isDetecting ? (
          <div className="flex items-center gap-2 text-sm text-poster-text-sub">
            <Spinner size="sm" />
            Detecting…
          </div>
        ) : languages.length === 0 ? (
          <p className="text-sm text-poster-text-sub">
            Enter some text to detect its language.
          </p>
        ) : (
          <div className="space-y-2">
            {languages.map((language, i) => (
              <div key={language.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-poster-text-main">
                    {i === 0 && <Badge variant="success">Top</Badge>}
                    {language.name}
                    <span className="text-xs text-poster-text-sub">({language.code})</span>
                  </span>
                  <span className="text-poster-text-sub">
                    {formatPercent(language.confidence)}
                  </span>
                </div>
                <progress
                  className="progress progress-primary h-1.5"
                  value={language.confidence}
                  max={1}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
