'use client';

/**
 * @file research-agent.tsx
 * @description Self-sufficient Research Agent block — its own WebGPU-only WebLLM load plus a tool-using ReAct loop with human-in-the-loop tool approval and a step timeline.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { defineTool, jsonSchema, type AgentStep, type LanguageModel, type ToolDefinition } from '@localmode/core';
import { useAgent, useModelLoad } from '@localmode/react';
import { webllm, WEBLLM_MODELS, isModelCached as webllmIsModelCached } from '@localmode/webllm';
import { z } from 'zod';

import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { CapabilityGate } from '@/components/capability-gate';
import { AgentStepTimeline } from '@/components/agent-step-timeline';
import { ToolView, type ToolCall } from '@/components/tool';
import { ToolApproval } from '@/components/tool-approval';
import { Task, TaskItem, type TaskStep } from '@/components/task';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/chain-of-thought';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/reasoning';
import { MultiStepPipelineTracker } from '@/components/pipeline-tracker';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/prompt-input';
import { Suggestion } from '@/components/suggestions';
import { InMessageError } from '@/components/in-message-error';
import { useCapabilities } from '@/lib/use-environment';
import { cn } from '@/lib/utils';

/** The default shared model. */
export const DEFAULT_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

/** Size tier for the model selector grouping. */
export type ModelTier = 'medium' | 'large';

/** One selectable WebLLM model entry. */
export interface AgentModelEntry {
  /** WebLLM-native model id. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Human-readable size (e.g. "1.1GB"). */
  size: string;
  /** Size in bytes (from the WebLLM catalog). */
  sizeBytes: number;
  /** Size tier — medium (1–2.2GB) / large (2.2GB+). */
  tier: ModelTier;
  /** Context window in tokens. */
  contextLength: number;
  /** Short description from the WebLLM catalog. */
  description?: string;
}

/** The curated model ids offered by the block, in tier order. */
const CURATED_MODEL_IDS: readonly string[] = [
  // Medium (1GB – 2.2GB)
  'Qwen3-1.7B-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  // Large (2.2GB+)
  'Phi-3-mini-4k-instruct-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
  'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC',
  'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
  'Llama-3.1-8B-Instruct-q4f16_1-MLC',
  'Qwen3-8B-q4f16_1-MLC',
];

/** Shape of a WebLLM catalog entry (no exported entry type upstream). */
interface WebLLMCatalogEntry {
  name: string;
  contextLength: number;
  sizeBytes: number;
  size: string;
  description: string;
}

const WEBLLM_ENTRIES = WEBLLM_MODELS as Record<string, WebLLMCatalogEntry>;

/** Tier threshold: entries ≥ 2.2GB are "large", else "medium". */
const LARGE_TIER_BYTES = 2.2 * 1024 * 1024 * 1024;

let cachedCatalog: AgentModelEntry[] | null = null;

/**
 * The curated block catalog: WebLLM language models in medium/large tiers.
 * Any curated id missing from the installed WebLLM catalog is skipped, so the
 * catalog stays valid even if the upstream list shifts.
 *
 * @returns A stable, memoized array in tier order.
 */
export function getAgentModelCatalog(): AgentModelEntry[] {
  if (cachedCatalog) return cachedCatalog;
  const entries: AgentModelEntry[] = [];
  for (const id of CURATED_MODEL_IDS) {
    const entry = WEBLLM_ENTRIES[id];
    if (!entry) continue;
    entries.push({
      id,
      name: entry.name,
      size: entry.size,
      sizeBytes: entry.sizeBytes,
      tier: entry.sizeBytes >= LARGE_TIER_BYTES ? 'large' : 'medium',
      contextLength: entry.contextLength,
      description: entry.description,
    });
  }
  cachedCatalog = entries;
  return entries;
}

/** Look up a single catalog entry by id (falls back to a minimal record). */
export function getModelEntry(id: string): AgentModelEntry {
  const found = getAgentModelCatalog().find((m) => m.id === id);
  if (found) return found;
  const entry = WEBLLM_ENTRIES[id];
  return {
    id,
    name: entry?.name ?? id,
    size: entry?.size ?? '',
    sizeBytes: entry?.sizeBytes ?? 0,
    tier: (entry?.sizeBytes ?? 0) >= LARGE_TIER_BYTES ? 'large' : 'medium',
    contextLength: entry?.contextLength ?? 4096,
    description: entry?.description,
  };
}

/**
 * Create an (unloaded) WebLLM `LanguageModel`. No bytes are fetched here —
 * WebLLM downloads lazily on first generate/warmup, behind the block's
 * explicit Load action.
 *
 * @param modelId - WebLLM-native model id
 * @param onProgress - Load-progress callback (WebLLM emits `{ status, progress }`)
 * @returns An unloaded `LanguageModel`
 */
export function createAgentModel(
  modelId: string,
  onProgress?: (p: unknown) => void,
): LanguageModel {
  return webllm.languageModel(modelId, { onProgress });
}

/**
 * Whether the model's weights are already cached locally (WebLLM cache API).
 *
 * @param modelId - WebLLM-native model id
 * @returns `true` when the model can load without a network download
 */
export function isAgentModelCached(modelId: string): Promise<boolean> {
  return webllmIsModelCached(modelId);
}

/** One article in the bundled offline knowledge corpus. */
interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
}

/**
 * The bundled offline corpus (8 articles across multiple topics) the `search`
 * tool scores against. EXACTLY three articles cover quantum computing, so a
 * quantum question has a stable set of top hits.
 */
export const KNOWLEDGE_BASE: readonly KnowledgeArticle[] = [
  {
    id: 'qc-1',
    title: 'Introduction to Quantum Computing',
    category: 'quantum-computing',
    content:
      'Quantum computing uses quantum bits (qubits) that can exist in superposition, representing both 0 and 1 simultaneously. This enables quantum computers to solve certain problems exponentially faster than classical computers. Key concepts include entanglement, where qubits become correlated, and quantum gates that manipulate qubit states. Current quantum computers have 50-1000+ qubits but are error-prone.',
  },
  {
    id: 'qc-2',
    title: 'Quantum Computing Applications',
    category: 'quantum-computing',
    content:
      'Quantum computing has promising applications in cryptography (breaking and creating encryption), drug discovery (simulating molecular interactions), optimization problems (logistics, finance), and machine learning (quantum neural networks). Google demonstrated quantum supremacy in 2019, and IBM offers cloud quantum computing services. However, practical quantum advantage for real-world problems remains limited.',
  },
  {
    id: 'qc-3',
    title: 'Challenges in Quantum Computing',
    category: 'quantum-computing',
    content:
      'Major challenges include quantum decoherence (qubits losing their quantum state), high error rates requiring error correction, extreme cooling requirements (near absolute zero), and the difficulty of scaling up qubit counts while maintaining coherence. The threshold for useful fault-tolerant quantum computing is estimated at millions of physical qubits.',
  },
  {
    id: 'bio-1',
    title: 'Photosynthesis Process',
    category: 'biology',
    content:
      'Photosynthesis converts sunlight, water, and CO2 into glucose and oxygen. It occurs in chloroplasts using chlorophyll pigments. The light-dependent reactions in the thylakoid membranes capture light energy to produce ATP and NADPH. The Calvin cycle in the stroma uses these to fix CO2 into glucose. Photosynthesis is approximately 3-6% efficient at converting solar energy to chemical energy.',
  },
  {
    id: 'bio-2',
    title: 'Solar Panel Technology',
    category: 'energy',
    content:
      'Solar panels use photovoltaic cells made of semiconductor materials (typically silicon) to convert sunlight directly into electricity. Modern panels achieve 20-25% efficiency, with lab records exceeding 47%. Types include monocrystalline (most efficient), polycrystalline (cost-effective), and thin-film (flexible). Solar energy is the fastest-growing renewable energy source globally.',
  },
  {
    id: 'bio-3',
    title: 'CRISPR Gene Editing',
    category: 'genetics',
    content:
      "CRISPR-Cas9 is a gene editing tool adapted from bacterial immune systems. It uses a guide RNA to direct the Cas9 enzyme to a specific DNA sequence, where it makes a precise cut. The cell's repair mechanisms then modify the gene. Applications include treating genetic diseases (sickle cell, muscular dystrophy), creating disease-resistant crops, and studying gene function. Ethical concerns involve germline editing and designer babies.",
  },
  {
    id: 'bio-4',
    title: 'CRISPR Applications and Ethics',
    category: 'genetics',
    content:
      'Clinical trials are underway using CRISPR to treat sickle cell disease, certain cancers, and inherited blindness. In agriculture, CRISPR has created drought-resistant crops and disease-resistant livestock. The technology raises ethical questions about human germline editing (changes passed to future generations), equitable access, and potential misuse. The 2018 case of CRISPR-edited babies in China sparked global debate about regulation.',
  },
  {
    id: 'ai-1',
    title: 'Machine Learning Fundamentals',
    category: 'artificial-intelligence',
    content:
      'Machine learning enables computers to learn from data without explicit programming. Supervised learning uses labeled data to learn mappings (classification, regression). Unsupervised learning finds patterns in unlabeled data (clustering, dimensionality reduction). Reinforcement learning trains agents through rewards and penalties. Deep learning uses neural networks with many layers for complex pattern recognition.',
  },
];

/** The research-assistant system prompt. */
export const RESEARCH_SYSTEM_PROMPT =
  'You are a thorough research assistant. Search for information, take notes on key findings, and provide a comprehensive final answer. Always search before answering.';

/** Bounded ReAct iterations. */
export const RESEARCH_MAX_STEPS = 8;

/** Sample research questions surfaced as one-click chips. */
export const SAMPLE_QUESTIONS: readonly string[] = [
  'What are the main benefits and challenges of quantum computing?',
  'Compare photosynthesis and solar panels for energy conversion.',
  'How does CRISPR gene editing work and what are its applications?',
];

/** Stable per-tool badge colors for the timeline (`toolColorMap`). */
export const TOOL_COLOR_MAP: Record<string, string> = {
  search: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  note: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  calculate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

/** A saved research note (per-run accumulator entry). */
interface ResearchNote {
  text: string;
  source: string;
  timestamp: number;
}

/** The tool set plus a `reset()` that clears the per-run note accumulator. */
export interface ResearchToolset {
  /** The three ReAct tools, in a stable order. */
  tools: ToolDefinition[];
  /** Clears the running note count at the start of a new run. */
  reset: () => void;
  /** Snapshot of the notes accumulated so far (copy). */
  getNotes: () => ResearchNote[];
}

/**
 * Build the three research tools with a fresh note accumulator.
 *
 * The `note` tool closes over a private `notes` array; `reset()` empties it in
 * place so the same tool objects can be reused across runs (keeping their
 * identity stable for the approval-flag mapping) while the running count still
 * restarts each run.
 *
 * @returns The tools plus `reset()`/`getNotes()` helpers
 */
export function createResearchTools(): ResearchToolset {
  const notes: ResearchNote[] = [];

  const searchTool = defineTool({
    name: 'search',
    description:
      'Search the knowledge base for articles relevant to a query. Returns titles and content snippets.',
    parameters: jsonSchema(
      z.object({
        query: z.string().describe('The search query'),
        maxResults: z.number().default(3).describe('Maximum results to return (default: 3)'),
      }),
    ),
    execute: async ({ query, maxResults }) => {
      const limit = maxResults > 0 ? maxResults : 3;
      // Keyword-overlap scoring: each query word that appears in an article's
      // title+content adds one point; keep score>0, rank desc, take `limit`.
      const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = KNOWLEDGE_BASE.map((article) => {
        const text = `${article.title} ${article.content}`.toLowerCase();
        const score = queryWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
        return { article, score };
      });
      const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
          title: s.article.title,
          content: s.article.content,
          category: s.article.category,
        }));
      if (results.length === 0) {
        return 'No relevant articles found. Try different search terms.';
      }
      return results.map((r) => `[${r.title}] (${r.category})\n${r.content}`).join('\n\n');
    },
  });

  const noteTool = defineTool({
    name: 'note',
    description:
      'Save a research finding or key insight as a note. Use this to accumulate knowledge before writing the final answer.',
    parameters: jsonSchema(
      z.object({
        text: z.string().describe('The note content to save'),
        source: z.string().optional().describe('Source of the information'),
      }),
    ),
    execute: async ({ text, source }) => {
      notes.push({ text, source: source ?? 'research', timestamp: Date.now() });
      return `Note saved (${notes.length} total notes).`;
    },
  });

  const calculateTool = defineTool({
    name: 'calculate',
    description:
      'Evaluate a mathematical expression or perform a simple calculation. Returns the numeric result.',
    parameters: jsonSchema(
      z.object({
        expression: z.string().describe('Mathematical expression to evaluate'),
      }),
    ),
    execute: async ({ expression }) => {
      try {
        // Sanitize to digits/operators only — never eval arbitrary strings.
        const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
        if (!sanitized.trim()) {
          return 'Invalid expression. Use numbers and operators: + - * / ()';
        }
        const result = new Function(`return (${sanitized})`)() as number;
        return String(result);
      } catch {
        return `Could not evaluate: ${expression}`;
      }
    },
  });

  return {
    tools: [searchTool, noteTool, calculateTool],
    reset: () => {
      notes.length = 0;
    },
    getNotes: () => [...notes],
  };
}

/** Human-readable finish-reason treatment (parity with the showcase). */
const FINISH_TREATMENT: Record<
  string,
  { label: string; tone: 'warning' | 'error' } | undefined
> = {
  max_steps: { label: 'Reached maximum steps', tone: 'warning' },
  timeout: { label: 'Timed out', tone: 'warning' },
  loop_detected: { label: 'Loop detected - agent was repeating actions', tone: 'error' },
  error: { label: 'Agent encountered an error', tone: 'error' },
  aborted: { label: 'Stopped', tone: 'warning' },
};

/** Compact label for a tool call, e.g. `search("quantum")`. */
function toolLabel(step: AgentStep): string {
  if (step.type === 'finish') return 'Final answer';
  const primaryArg = step.toolArgs
    ? Object.values(step.toolArgs).find((v) => typeof v === 'string')
    : undefined;
  const arg = typeof primaryArg === 'string' ? `"${primaryArg.slice(0, 40)}"` : '';
  return `${step.toolName ?? 'tool'}(${arg})`;
}

/**
 * Self-sufficient Research Agent block: owns its WebLLM model load AND the
 * `useAgent` ReAct run lifecycle + approval toggle; renders all mandated
 * conversation primitives from real step data.
 */
export function ResearchAgentBlock() {
  // ── model layer (own load; no shared instance, no mode switch) ──
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);

  const { capabilities } = useCapabilities();
  const hasWebGPU = Boolean(capabilities?.features.webgpu);
  // Detection has RESOLVED and reports no WebGPU adapter — distinct from the
  // still-detecting state (capabilities == null) so the degraded gate does not
  // flash during detection.
  const webgpuUnsupported = capabilities != null && !hasWebGPU;

  const modelEntry = getModelEntry(modelId);
  const catalog = getAgentModelCatalog();

  // Own model lifecycle — keyed by model id.
  const {
    model,
    status,
    progressValue,
    cached,
    error: modelError,
    load,
  } = useModelLoad<LanguageModel>({
    key: `webllm:${modelId}`,
    create: (onProgress) => createAgentModel(modelId, (p) => onProgress(p as never)),
    isCached: () => isAgentModelCached(modelId),
  });

  const modelReady = status === 'ready';

  const selectorModels: SelectableModel[] = catalog.map((m) => ({
    id: m.id,
    name: m.name,
    backend: 'webgpu',
    category: m.tier === 'large' ? 'Large (2.2GB+)' : 'Medium (1-2.2GB)',
    size: m.size,
    cached: m.id === modelId ? cached : undefined,
  }));

  // Switch model → new useModelLoad key (cancels in-flight work). No-op while a
  // load is in flight.
  const selectModel = (id: string) => {
    if (id === modelId || status === 'loading') return;
    setModelId(id);
  };

  const statusText =
    status === 'ready'
      ? `ready - ${modelEntry.name}`
      : status === 'loading'
        ? `loading ${modelEntry.name}… ${Math.round(progressValue.percent * 100)}%`
        : status === 'error'
          ? 'error'
          : webgpuUnsupported
            ? 'WebGPU required - this device cannot run these models'
            : 'idle - select a model and click Load';

  // ── ReAct loop (uses the block's own model directly) ──
  // Stable toolset with a resettable per-run note accumulator. The lazy
  // initializer runs once, so the identity survives every re-render.
  const [toolset] = useState<ResearchToolset>(createResearchTools);

  const [requireApproval, setRequireApproval] = useState(true);
  const [question, setQuestion] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  // Flag every tool for approval when the gate is ON; ungated otherwise.
  const tools: ToolDefinition[] = requireApproval
    ? toolset.tools.map((t) => ({ ...t, requiresApproval: true }))
    : toolset.tools;

  const { steps, result, isRunning, error, pendingApproval, approve, deny, run, cancel, reset } =
    useAgent({
      model: model as LanguageModel,
      tools,
      maxSteps: RESEARCH_MAX_STEPS,
      temperature: 0,
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
    });

  const startRun = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || !modelReady || isRunning) return;
    toolset.reset(); // restart the running note count for the new run
    setLastPrompt(trimmed);
    setQuestion('');
    void run(trimmed);
  };

  const finishReason = result?.finishReason;
  const finishTreatment = finishReason ? FINISH_TREATMENT[finishReason] : undefined;
  const toolSteps = steps.filter((s) => s.type === 'tool_call');
  const gatedSteps = steps.filter((s) => s.approval); // decided approval receipts

  // Derived surfaces (all from real step data).
  const taskSteps: TaskStep[] = [
    ...steps.map((s) => ({ ...s, status: 'completed' as const })),
    ...(isRunning && !pendingApproval
      ? [
          {
            index: steps.length,
            type: 'tool_call' as const,
            toolName: 'thinking',
            status: 'running' as const,
          },
        ]
      : []),
  ];
  const toolCalls: ToolCall[] = toolSteps.map((s) => ({
    name: s.toolName ?? 'tool',
    input: s.toolArgs,
    output: s.observation,
    status: 'completed' as const,
  }));
  const latestObservation =
    [...steps].reverse().find((s) => s.observation)?.observation ??
    'Waiting for the model to choose the first tool…';

  // Meaningful, still-unique per-node labels: an executed node names the tool it
  // ran (or "answer" for the final step); a not-yet-reached node keeps its
  // ordinal. The leading `${i + 1}` keeps every label unique (the tracker keys on
  // the label), so repeated tools never collide.
  const pipelineLabels = Array.from({ length: RESEARCH_MAX_STEPS }, (_, i) => {
    const step = steps[i];
    if (step?.type === 'finish') return `${i + 1} · answer`;
    if (step?.toolName) return `${i + 1} · ${step.toolName}`;
    return `${i + 1}`;
  });
  const currentActivity = pendingApproval
    ? `Awaiting approval: ${pendingApproval.toolName}`
    : isRunning
      ? 'Thinking…'
      : finishReason
        ? finishReason === 'finish'
          ? 'Done'
          : (finishTreatment?.label ?? finishReason)
        : undefined;

  // The WebGPU capability gate is a first-class UX surface: an amber, icon-led
  // notice that states the requirement, why this device fails it, and what would
  // change on a supported device. AA-contrast heading (amber-700 on light).
  const webgpuGate = (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <span className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        WebGPU required
      </span>
      <span className="text-muted-foreground">
        This block runs WebLLM models, which need WebGPU - a modern GPU plus a
        recent Chrome or Edge build. This browser or device exposes no WebGPU
        adapter, so these models cannot load here. On a supported device, a model
        selector and a Load button appear in this spot.
      </span>
    </div>
  );

  const loadArea = (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{modelEntry.name}</span>
        {modelEntry.size ? ` (${modelEntry.size})` : ''} - not loaded. It downloads only when you
        click Load.
      </p>
      <button
        type="button"
        onClick={() => void load()}
        className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Load model
      </button>
    </div>
  );

  const modelStatusGroup = (
    <div
      role="group"
      aria-label="Model status"
      data-status={status}
      data-model-id={modelId}
      className="flex flex-col gap-2"
    >
      {status === 'idle' ? (
        <CapabilityGate requires="webgpu" fallback={webgpuGate}>
          {loadArea}
        </CapabilityGate>
      ) : (
        <ModelDownloader
          name={modelEntry.name}
          size={modelEntry.size || undefined}
          contextLength={modelEntry.contextLength}
          category="Chat"
          progress={progressValue}
          cached={cached}
          ready={modelReady}
          className="max-w-md"
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {/* ── status line — live status region for assistive tech ── */}
      <p
        role="status"
        aria-live="polite"
        data-state={status}
        className="text-xs text-muted-foreground"
      >
        {statusText}
      </p>
      {modelError && (
        <p role="status" className="text-xs text-destructive">
          {modelError.message}
        </p>
      )}

      {/* ── model layer ──
          On a no-WebGPU device the gate is the primary message, rendered on its
          own (gate-first) instead of below a two-screen disabled model list. */}
      {status === 'idle' && webgpuUnsupported ? (
        modelStatusGroup
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="flex flex-col gap-3">
            <ModelSelector
              models={selectorModels}
              selectedId={modelId}
              hasWebGPU={hasWebGPU}
              onSelect={selectModel}
            />
          </div>
          {modelStatusGroup}
        </div>
      )}

      {/* ── ReAct experience: always rendered. The approval gate and the
           step timeline are the block's showcase, so they must be visible
           before a model loads and on devices without WebGPU. Every
           model-driven control is disabled until `modelReady`. ── */}
        <div className="min-h-48">
          <div className="flex flex-col gap-4">
            {/* ── composer + sample chips + approval toggle ── */}
            <div className="flex flex-col gap-3">
              <PromptInput
                value={question}
                onValueChange={setQuestion}
                onSubmit={(text) => startRun(text)}
                streaming={isRunning}
                onStop={cancel}
                disabled={!modelReady}
              >
                <PromptInputTextarea
                  aria-label="Research question"
                  placeholder={
                    modelReady
                      ? 'Ask a research question…'
                      : 'Load the model to start researching…'
                  }
                />
                <PromptInputTools>
                  <PromptInputSubmit
                    disabled={!modelReady || !question.trim()}
                  />
                </PromptInputTools>
              </PromptInput>

              {/* Example prompts: a wrapping chip group so no suggestion is
                  clipped at any width (never a single silently-scrolling row). */}
              <div role="group" aria-label="Example research questions" className="flex flex-wrap gap-2">
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <Suggestion
                    key={q}
                    suggestion={q}
                    onSelect={startRun}
                    disabled={!modelReady || isRunning}
                    className="h-auto min-w-0 max-w-none shrink whitespace-normal py-1.5 text-left"
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={requireApproval}
                  aria-label="Require tool approval"
                  data-enabled={requireApproval ? 'on' : 'off'}
                  onClick={() => setRequireApproval((v) => !v)}
                  className={cn(
                    'inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    requireApproval
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      requireApproval ? 'bg-primary' : 'bg-muted-foreground/50',
                    )}
                  />
                  Require tool approval: {requireApproval ? 'On' : 'Off'}
                </button>

                {isRunning ? (
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-7 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Stop
                  </button>
                ) : (
                  (steps.length > 0 || result || error) && (
                    <button
                      type="button"
                      onClick={() => {
                        reset();
                        toolset.reset();
                      }}
                      className="inline-flex h-7 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      New Research
                    </button>
                  )
                )}
              </div>
            </div>

            {/* ── machine-readable run-state mirror (sr-only driver hooks;
                 aria-labelled so assistive tech + role/label selectors can
                 reference the run state without a test-only attribute) ── */}
            <div className="sr-only">
              <div
                aria-label="Agent run state"
                data-running={isRunning ? 'running' : 'idle'}
                data-finish={finishReason ?? ''}
                data-step-count={steps.length}
                data-tool-step-count={toolSteps.length}
                data-pending-tool={pendingApproval?.toolName ?? ''}
              />
              {toolSteps.map((s) => (
                <span
                  key={s.index}
                  aria-label="Executed tool step"
                  data-tool={s.toolName ?? ''}
                  data-observation={s.observation ?? ''}
                />
              ))}
            </div>

            {/* ── pipeline progress ── */}
            {(isRunning || steps.length > 0) && (
              <MultiStepPipelineTracker
                steps={pipelineLabels}
                completed={Math.min(steps.length, RESEARCH_MAX_STEPS)}
                currentStep={currentActivity}
              />
            )}

            {/* ── pending approval gate ── */}
            {pendingApproval && (
              <div
                role="group"
                aria-label="Pending tool approval"
                data-tool={pendingApproval.toolName}
              >
                <ToolApproval
                  toolName={pendingApproval.toolName}
                  args={pendingApproval.args}
                  onApprove={() => approve()}
                  onReject={() => deny('Denied by user')}
                />
              </div>
            )}

            {/* ── live-thinking region ── */}
            {(isRunning || steps.length > 0) && (
              <Reasoning streaming={isRunning && !pendingApproval}>
                <ReasoningTrigger />
                <ReasoningContent>{latestObservation}</ReasoningContent>
              </Reasoning>
            )}

            {/* ── two-column: timeline (primary) + run summary ── */}
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <div className="min-w-0">
                <AgentStepTimeline
                  steps={steps}
                  isRunning={isRunning}
                  finishReason={finishReason}
                  toolColorMap={TOOL_COLOR_MAP}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                {/* chain-of-thought progression */}
                {steps.length > 0 && (
                  <ChainOfThought done={Boolean(result)}>
                    <ChainOfThoughtHeader />
                    <ChainOfThoughtContent>
                      {steps.map((s) => (
                        <ChainOfThoughtStep key={s.index} label={toolLabel(s)} status="complete" />
                      ))}
                      {isRunning && !pendingApproval && (
                        <ChainOfThoughtStep label="Deciding next action…" status="active" />
                      )}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
                )}

                {/* compact ordered run summary */}
                {taskSteps.length > 0 && (
                  <Task>
                    {taskSteps.map((s) => (
                      <TaskItem key={s.index} step={s} />
                    ))}
                  </Task>
                )}

                {/* per-tool input/output cards */}
                {toolCalls.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {toolCalls.map((call, i) => (
                      <ToolView key={`${call.name}-${i}`} call={call} />
                    ))}
                  </div>
                )}

                {/* immutable approval receipts */}
                {gatedSteps.length > 0 && (
                  <div
                    className="flex flex-col gap-2"
                    role="group"
                    aria-label="Tool approval receipts"
                  >
                    {gatedSteps.map((s) => (
                      <ToolApproval
                        key={s.index}
                        toolName={s.toolName ?? 'tool'}
                        args={s.toolArgs}
                        decision={s.approval?.decision === 'approved' ? 'approved' : 'rejected'}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── final answer + finish reason ── */}
            {result && result.result && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Final answer
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {result.result}
                </p>
              </div>
            )}
            {finishTreatment && (
              <p
                data-reason={finishReason}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium',
                  finishTreatment.tone === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive',
                )}
              >
                {finishTreatment.label}
              </p>
            )}

            {/* ── run error ── */}
            {error && (
              <div>
                <InMessageError
                  error={error}
                  onRetry={lastPrompt ? () => startRun(lastPrompt) : undefined}
                />
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
