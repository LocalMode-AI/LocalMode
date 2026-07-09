'use client';

import { useState } from 'react';
import { useSummarize } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { TextProcessingPanel } from './text-processing-panel';
import { SegmentedModePicker } from '@/registry/localmode/input-controls/segmented-mode-picker/segmented-mode-picker';

const LENGTHS = {
  short: { maxLength: 60 },
  medium: { maxLength: 130 },
  long: { maxLength: 250 },
} as const;

const SAMPLE =
  'LocalMode is a privacy-first toolkit for running machine-learning models entirely in the browser. ' +
  'Everything from embeddings and vector search to LLM chat and image processing works offline after the ' +
  'initial model download. No servers, no API keys, and your data never leaves the device.';

/**
 * Demo for TextProcessingPanel, used by the docs live preview. The shell drives
 * a real `useSummarize` flow; a SegmentedModePicker header slot selects the
 * summary length. The model downloads on the first run (Run-gated), then
 * spinner → result → copy works end to end, plus cancel and clear.
 */
export default function TextProcessingPanelDemo() {
  const [text, setText] = useState(SAMPLE);
  const [length, setLength] = useState<keyof typeof LENGTHS>('medium');

  const { data, isLoading, error, execute, cancel, reset } = useSummarize({
    model: transformers.summarizer('Xenova/distilbart-cnn-6-6'),
  });

  return (
    <TextProcessingPanel
      value={text}
      onChange={setText}
      result={data?.summary}
      isProcessing={isLoading}
      error={error?.message}
      onRun={() => execute({ text, maxLength: LENGTHS[length].maxLength })}
      onCancel={cancel}
      onClear={reset}
      inputLabel="Article"
      resultLabel="Summary"
      runLabel="Summarize"
      header={
        <SegmentedModePicker
          aria-label="Summary length"
          items={[
            { id: 'short', label: 'Short' },
            { id: 'medium', label: 'Medium' },
            { id: 'long', label: 'Long' },
          ]}
          selectedId={length}
          onSelect={setLength}
        />
      }
    />
  );
}
