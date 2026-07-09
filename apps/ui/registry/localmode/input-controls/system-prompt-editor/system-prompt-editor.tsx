'use client';

import { OptionList, type Option } from '@/components/option-list';

/** The default assistant system prompt. */
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

/** One selectable system-prompt preset. */
export interface SystemPromptPreset {
  /** Stable preset identifier. */
  id: string;
  /** Short visible label. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** The full system prompt applied on selection. */
  prompt: string;
}

/** Built-in presets — the default assistant prompt plus three focused modes. */
export const SYSTEM_PROMPT_PRESETS: readonly SystemPromptPreset[] = [
  {
    id: 'default',
    label: 'Helpful assistant',
    description: 'Balanced, general-purpose default',
    prompt: DEFAULT_SYSTEM_PROMPT,
  },
  {
    id: 'concise',
    label: 'Concise answers',
    description: 'Short, direct replies, no filler',
    prompt:
      'You are a helpful assistant. Keep every answer short and direct, at most three sentences unless the user explicitly asks for more detail.',
  },
  {
    id: 'coding',
    label: 'Coding assistant',
    description: 'Code-first answers with working examples',
    prompt:
      'You are an expert programming assistant. Answer with working, runnable code examples first, then a brief explanation. Prefer modern idioms and point out pitfalls.',
  },
  {
    id: 'teacher',
    label: 'Step-by-step teacher',
    description: 'Patient explanations that build up from basics',
    prompt:
      'You are a patient teacher. Explain concepts step by step, starting from first principles, using simple language and one concrete example per concept. Check understanding before moving on.',
  },
];

/** Props for {@link SystemPromptEditor}. */
export interface SystemPromptEditorProps {
  /** The current system prompt (controlled). */
  value: string;
  /** Fired with the new prompt on every edit or preset selection. */
  onChange: (value: string) => void;
  /**
   * Accessible name for the textarea, applied as its `aria-label` so the
   * control has a programmatic name independent of the visible heading.
   * @default "System prompt"
   */
  ariaLabel?: string;
}

/**
 * A controlled system-prompt editor with quick-pick presets. Selecting a preset
 * replaces the textarea value; free-form edits that match no preset simply
 * deselect all presets. The exported {@link SYSTEM_PROMPT_PRESETS} and
 * {@link DEFAULT_SYSTEM_PROMPT} are the built-in quick-picks.
 *
 * Purely presentational (value in, `onChange` out) — persistence and model
 * wiring stay in the consumer. Composes the `option-list` primitive and is
 * styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
 * <SystemPromptEditor value={prompt} onChange={setPrompt} />
 * ```
 */
export function SystemPromptEditor({
  value,
  onChange,
  ariaLabel = 'System prompt',
}: SystemPromptEditorProps) {
  const presetOptions: Option[] = SYSTEM_PROMPT_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
  }));

  // A preset is "active" only while the textarea matches it exactly.
  const selectedId = SYSTEM_PROMPT_PRESETS.find((preset) => preset.prompt === value)?.id;

  const handlePresetSelect = (option: Option) => {
    const preset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === option.id);
    if (preset) onChange(preset.prompt);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">System prompt</span>
        <textarea
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={DEFAULT_SYSTEM_PROMPT}
          spellCheck={false}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <OptionList
        prompt="Presets"
        options={presetOptions}
        selectedId={selectedId}
        onSelect={handlePresetSelect}
      />
    </div>
  );
}
