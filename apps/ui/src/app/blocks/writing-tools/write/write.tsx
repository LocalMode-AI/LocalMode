'use client';

/**
 * @file write.tsx
 * @description Write block — a draft editor with live length feedback, preset + free-text edit instructions with prompt improvement, and an AI edit reviewed as a before/after diff with explicit Accept/Reject (Prompt API ⇄ Llama-3.2-1B fallback).
 */
import { useEffect, useState } from 'react';
import {
  useGenerateText,
  useProviderFallback,
  toAppError,
  providerName,
  type ResolvedModel,
} from '@localmode/react';
import type { LanguageModel } from '@localmode/core';
import { isWebGPUSupported } from '@localmode/core';

import { CharLimitIndicator } from '@/components/char-limit-indicator';
import { PromptEnhanceButton } from '@/components/prompt-enhance-button';
import { CodeDiffViewer } from '@/components/code-diff-viewer';
import { CapabilityGate } from '@/components/capability-gate';
import { ProviderBadge } from '@/components/provider-badge';
import { ChromeAIDownloadGate } from '@/components/chrome-ai-download-gate';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/** The Write AI-edit engine (a small, clean instruct model; ~380 MB q4). */
const EDIT_ENGINE_MODEL_ID = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
const EDIT_ENGINE_MODEL_SIZE = '~380 MB';

/** Preset edit instructions. */
const EDIT_PRESETS = [
  'Fix grammar and spelling',
  'Make it more concise',
  'Use a friendlier tone',
  'Make it more formal',
];

/** Default target length (characters) for the char-limit feedback. */
const WRITE_DEFAULT_TARGET = 280;

/** Draft sample (verbatim from the smart-writer showcase). */
const WRITE_SAMPLE =
  'Artificial intelligence has transformed how we interact with technology. From voice assistants to recommendation systems, AI is now embedded in everyday tools. Recent advances in on-device AI have made it possible to run sophisticated models directly in web browsers, eliminating the need for cloud APIs and ensuring user data never leaves the device. This shift toward local-first AI represents a fundamental change in how we build privacy-respecting applications.';

function buildEditPrompt(instruction: string, draft: string): string {
  return `You are a writing assistant. Rewrite the text below according to the instruction. Output only the rewritten text, with no preamble or explanation.\n\nInstruction: ${instruction}\n\nText:\n${draft}`;
}

function buildEnhancePrompt(instruction: string): string {
  return `Rewrite the following editing instruction so it is clearer and more specific. Output only the improved instruction, on a single line, with no preamble.\n\nInstruction: ${instruction}`;
}

/** Strip a common model preamble / wrapping quotes from a proposed edit. */
function cleanProposal(text: string): string {
  let out = text.trim();
  out = out.replace(/^(here('| i)s|sure[,!]?|rewritten text|revised text)[^\n:]*:\s*/i, '');
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith('“') && out.endsWith('”'))) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

export function WriteBlock() {
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(WRITE_DEFAULT_TARGET);
  const [instruction, setInstruction] = useState(EDIT_PRESETS[0]);
  const [proposal, setProposal] = useState<string | null>(null);
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  const [resolved, setResolved] = useState<ResolvedModel<LanguageModel> | null>(null);
  // Inject bundler-visible provider loaders: the hook's default loader hides the
  // import behind a Function() (for published-package safety) which the browser
  // cannot resolve as a bare specifier — the app supplies static imports instead.
  const {
    resolveEditEngine,
    chromeAvailability,
    refreshChromeAvailability,
    requestChromeDownload,
    chromeDownloadProgress,
    downloadingCapability,
    error: providerError,
  } = useProviderFallback({
    loadChromeAI: () => import('@localmode/chrome-ai'),
    loadTransformers: () => import('@localmode/transformers'),
  });

  // Probe the compute device once (no model bytes). The transformers instruct
  // model auto-picks WebGPU on `navigator.gpu` PRESENCE and would fail in
  // adapterless browsers, so we pin an explicit device (chat/audio pattern).
  useEffect(() => {
    let alive = true;
    void isWebGPUSupported().then((ok) => {
      if (alive) setDevice(ok ? 'webgpu' : 'wasm');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Probe the Prompt API's model state. Reading availability() downloads nothing.
  const editAvailability = chromeAvailability.edit ?? 'unsupported';
  useEffect(() => {
    void refreshChromeAvailability('edit');
  }, [refreshChromeAvailability]);

  // Resolve the edit engine once the device is known (no download until run).
  // Re-runs when Chrome's availability flips so a completed Gemini Nano download
  // promotes this block from the Transformers.js fallback to Chrome AI.
  useEffect(() => {
    if (!device) return;
    let alive = true;
    void resolveEditEngine({ fallbackModelId: EDIT_ENGINE_MODEL_ID, device }).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, [device, resolveEditEngine, editAvailability]);

  const { data, error, isLoading, execute, cancel, reset } = useGenerateText({
    model: resolved?.model as LanguageModel,
    maxTokens: 220,
    temperature: 0.4,
  });

  const ready = !!resolved;
  const appErr = toAppError(error);
  const modelId = data?.response.modelId ?? resolved?.modelId ?? null;

  const runEdit = async () => {
    if (!draft.trim() || !instruction.trim() || !ready || isLoading) return;
    setProposal(null);
    const r = await execute(buildEditPrompt(instruction, draft));
    if (r) setProposal(cleanProposal(r.text));
  };

  const accept = () => {
    if (proposal === null) return;
    setDraft(proposal); // exactly the "after" text shown in the diff
    setProposal(null);
    reset();
  };
  const reject = () => {
    setProposal(null);
    reset();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Write - AI-edit draft editor. Models load only behind an explicit action.
      </p>

      <ChromeAIDownloadGate
        availability={editAvailability}
        label="Chrome Prompt API (Gemini Nano)"
        size="~1.5 GB, shared across every site"
        isDownloading={downloadingCapability === 'edit'}
        progress={chromeDownloadProgress?.progress}
        error={providerError?.message ?? null}
        fallbackLabel={`Transformers.js (Llama 3.2 1B, ${EDIT_ENGINE_MODEL_SIZE})`}
        onDownload={() => {
          void requestChromeDownload('edit');
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span data-provider={resolved?.provider ?? 'resolving'}>
          <ProviderBadge
            providerName={resolved ? providerName(resolved.provider) : null}
            tier={resolved?.tier ?? 'download'}
            modelId={modelId}
            note={resolved?.provider === 'transformers' ? `Llama 3.2 1B · ${EDIT_ENGINE_MODEL_SIZE}` : undefined}
          />
        </span>
        <span data-model-id={modelId ?? ''} className="sr-only">
          {modelId ?? ''}
        </span>
        <CapabilityGate
          requires="webgpu"
          fallback={
            <span className="text-[10px] text-muted-foreground">
              WebGPU unavailable - the edit engine runs on WASM (slower).
            </span>
          }
          pending={<span className="text-[10px] text-muted-foreground">Checking WebGPU…</span>}
        >
          <span className="text-[10px] text-emerald-600 dark:text-emerald-500">
            WebGPU detected - the edit engine is GPU-accelerated.
          </span>
        </CapabilityGate>
      </div>

      {/* Draft editor + writing-length feedback */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Draft</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              Target
              <input
                type="number"
                min={40}
                max={2000}
                step={20}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded border border-border bg-background px-1 py-0.5 text-right tabular-nums"
              />
              chars
            </label>
            <span>
              <CharLimitIndicator charCount={draft.length} maxLength={target} />
            </span>
          </div>
        </div>
        <textarea
          aria-label="Draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Write or paste a draft, then ask the AI to edit it…"
          className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => setDraft(WRITE_SAMPLE)}
          className="self-start rounded text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Load sample
        </button>
      </div>

      {/* Edit instruction + presets + prompt improvement */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Edit instruction</span>
        <div className="flex flex-wrap gap-1.5">
          {EDIT_PRESETS.map((preset, i) => (
            <button
              key={preset}
              type="button"
              onClick={() => setInstruction(preset)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                instruction === preset
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Edit instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Describe the edit…"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>
            <PromptEnhanceButton
              draft={instruction}
              onApply={setInstruction}
              disabled={!ready}
              onEnhance={async (draftInstruction: string) => {
                if (!resolved) return null;
                const { generateText } = await import('@localmode/core');
                const r = await generateText({
                  model: resolved.model,
                  prompt: buildEnhancePrompt(draftInstruction),
                  maxTokens: 120,
                  temperature: 0.5,
                });
                return cleanProposal(r.text);
              }}
            />
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={isLoading ? cancel : runEdit}
          disabled={!ready || (!draft.trim() && !isLoading) || (!instruction.trim() && !isLoading)}
          className={cn(
            'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            isLoading
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isLoading ? 'Stop' : ready ? 'AI edit' : 'Preparing…'}
        </button>
        {isLoading && <span className="text-xs text-muted-foreground">Generating edit…</span>}
      </div>

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={runEdit} onDismiss={reset} />
        </span>
      )}

      {/* AI-edit review: before/after diff with explicit Accept / Reject. */}
      {proposal !== null && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Review the proposed edit</span>
          <div>
            <CodeDiffViewer
              original={draft}
              modified={proposal}
              mode="split"
              originalLabel="Current draft"
              modifiedLabel="Proposed edit"
              showLineNumbers={false}
            />
          </div>
          {/* Proposal witness (named status region) so the E2E can assert
              Accept applies exactly it. */}
          <span
            role="status"
            aria-label="Proposed edit"
            className="sr-only"
          >
            {proposal}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={accept}
              className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={reject}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
