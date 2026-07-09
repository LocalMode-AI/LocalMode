'use client';

import { useState } from 'react';
import { useTranslate } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import {
  LanguagePairSelector,
  type LanguageOption,
} from './language-pair-selector';

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
];

/** Map a source/target code pair to an opus-mt model id (one model per pair). */
function modelIdFor(source: string, target: string) {
  return `Xenova/opus-mt-${source}-${target}`;
}

/**
 * Demo for LanguagePairSelector, used by the docs live preview. The selected
 * source/target codes pick an opus-mt model and drive a real `useTranslate`
 * call. The pair model downloads on the first run (Run-gated). Only pairs with
 * a published opus-mt model translate; others surface an error.
 */
export default function LanguagePairSelectorDemo() {
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('fr');
  const [text, setText] = useState('Local-first AI keeps your data on device.');

  const { data, isLoading, error, execute } = useTranslate({
    model: transformers.translator(modelIdFor(source, target)),
  });

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <LanguagePairSelector
        languages={LANGUAGES}
        sourceCode={source}
        targetCode={target}
        onSelectSource={setSource}
        onSelectTarget={setTarget}
        onSwap={swap}
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <button
        type="button"
        onClick={() => execute({ text, sourceLanguage: source, targetLanguage: target })}
        disabled={isLoading || source === target}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? 'Translating…' : 'Translate'}
      </button>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && !isLoading && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {data.translation}
        </p>
      )}
    </div>
  );
}
