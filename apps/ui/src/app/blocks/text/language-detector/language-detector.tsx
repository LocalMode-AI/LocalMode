'use client';

/**
 * @file language-detector.tsx
 * @description Text — Language Detector: debounced 110-language auto-detection (up to 5 candidates) plus an on-device text-embedder cosine-similarity comparison, fully on-device via MediaPipe.
 */

import { useEffect, useRef, useState } from 'react';
import { useDetectLanguage } from '@localmode/react';
import {
  cosineSimilarity,
  embed,
  getLanguageName,
  type EmbeddingModel,
  type LanguageDetectionModel,
} from '@localmode/core';
import { mediapipe } from '@localmode/mediapipe';

import { CapabilityGate } from '@/components/capability-gate';
import { CosineSimilarityMeter } from '@/components/cosine-similarity-meter';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';

/** Auto-detect threshold + debounce (mediapipe-studio parity). */
const MIN_DETECT_LENGTH = 10;
const DETECT_DEBOUNCE_MS = 400;

/** Lazy MediaPipe singletons — created on first render, downloaded on first use. */
let languageModel: LanguageDetectionModel | null = null;
const getLanguageDetector = () => (languageModel ??= mediapipe.languageDetector());
let embedderModel: EmbeddingModel | null = null;
const getTextEmbedder = () => (embedderModel ??= mediapipe.textEmbedder());

export function LanguageDetectorBlock() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="sr-only">
        Language detector
      </p>
      <CapabilityGate requires="wasm">
        <div className="flex flex-col gap-3">
          <DetectionSection />
          <SimilaritySection />
        </div>
      </CapabilityGate>
    </div>
  );
}

/* ─────────────────────────── language detection ─────────────────────────── */

function DetectionSection() {
  const [text, setText] = useState('');
  const detect = useDetectLanguage({ model: getLanguageDetector(), maxResults: 5 });

  // execute/reset identities may change per render — route the debounce
  // through refs so the effect depends on `text` only.
  const executeRef = useRef(detect.execute);
  const resetRef = useRef(detect.reset);
  useEffect(() => {
    executeRef.current = detect.execute;
    resetRef.current = detect.reset;
  });

  // 400ms-debounced auto-detect once the text reaches 10 characters.
  useEffect(() => {
    if (text.trim().length < MIN_DETECT_LENGTH) {
      resetRef.current();
      return;
    }
    const id = window.setTimeout(() => void executeRef.current(text), DETECT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  const candidates = (detect.data?.languages ?? []).map((l) => ({
    code: l.languageCode,
    name: getLanguageName(l.languageCode),
    confidence: l.confidence,
  }));

  const status = detect.isLoading
    ? 'detecting'
    : detect.error
      ? 'error'
      : candidates.length > 0
        ? 'done'
        : 'idle';

  return (
    <section className="grid items-start gap-3 rounded-lg border border-border p-4 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Language detection</p>
        <textarea
          aria-label="Text to detect language"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Type or paste text in any language… e.g. Bonjour le monde"
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          Detection runs automatically after {MIN_DETECT_LENGTH} characters. Supports 110
          languages; the model downloads on first detection.
        </p>
        {detect.error && (
          <p className="text-xs text-destructive">
            {detect.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Detected languages</p>
        <p
          data-status={status}
          className="sr-only"
        >
          {status}
        </p>
        <span
          data-code={candidates[0]?.code ?? ''}
          className="sr-only"
        >
          {candidates[0]?.code ?? ''}
        </span>
        <div>
          <ScoredResultBarList
            results={candidates.map((c) => ({
              label: `${c.name} (${c.code})`,
              score: c.confidence,
            }))}
            isLoading={detect.isLoading}
            emptyState={`Type at least ${MIN_DETECT_LENGTH} characters to detect the language.`}
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── text similarity ─────────────────────────── */

function SimilaritySection() {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = async () => {
    if (!textA.trim() || !textB.trim() || isComparing) return;
    setIsComparing(true);
    setError(null);
    try {
      const model = getTextEmbedder();
      const [a, b] = await Promise.all([
        embed({ model, value: textA }),
        embed({ model, value: textB }),
      ]);
      setSimilarity(cosineSimilarity(a.embedding, b.embedding));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Text similarity</p>
        <p className="text-xs text-muted-foreground">
          Both texts are embedded with the MediaPipe text embedder (Universal Sentence Encoder);
          the meter shows their cosine similarity.
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <textarea
          aria-label="First text to compare"
          value={textA}
          onChange={(e) => setTextA(e.target.value)}
          rows={3}
          placeholder="Enter the first sentence…"
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <textarea
          aria-label="Second text to compare"
          value={textB}
          onChange={(e) => setTextB(e.target.value)}
          rows={3}
          placeholder="Enter the second sentence…"
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void compare()}
          disabled={!textA.trim() || !textB.trim() || isComparing}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {isComparing ? 'Comparing…' : 'Compare similarity'}
        </button>
        {(!textA.trim() || !textB.trim()) && !isComparing && (
          <span className="text-xs text-muted-foreground">
            Enter text in both boxes to compare.
          </span>
        )}
        {error && (
          <p className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {similarity != null && (
        <div data-score={similarity.toFixed(4)}>
          <CosineSimilarityMeter similarity={similarity} caption="text A ↔ text B" />
        </div>
      )}
    </section>
  );
}
