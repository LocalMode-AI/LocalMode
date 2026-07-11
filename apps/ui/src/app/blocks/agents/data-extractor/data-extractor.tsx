'use client';

/**
 * @file data-extractor.tsx
 * @description Self-sufficient Data Extractor block — its own WebGPU-only WebLLM load plus schema-validated JSON extraction (5 zod templates, retry/self-correction) docked into the artifacts canvas (sortable table + chart).
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { jsonSchema, type LanguageModel, type ObjectSchema } from '@localmode/core';
import { useGenerateObject, useModelLoad } from '@localmode/react';
import { webllm, WEBLLM_MODELS, isModelCached as webllmIsModelCached } from '@localmode/webllm';
import { z } from 'zod';

import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { CapabilityGate } from '@/components/capability-gate';
import { StructuredOutputViewer } from '@/components/structured-output-viewer';
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
} from '@/components/artifact';
import { DataTableArtifact } from '@/components/data-table-artifact';
import { ChartArtifact } from '@/components/chart-artifact';
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

/** A template id (the picker key). */
export type TemplateId = 'contact' | 'event' | 'review' | 'recipe' | 'job';

/** One extraction template. */
export interface ExtractionTemplate {
  /** Picker key. */
  id: TemplateId;
  /** Display name. */
  name: string;
  /** Core-wrapped zod schema (the extraction contract). */
  schema: ObjectSchema<unknown>;
  /** Compact schema-preview string shown in the UI. */
  schemaDisplay: string;
  /** Sample text loaded by the "Load Sample" action. */
  sampleText: string;
}

/* ─────────────────────────── zod schemas ─────────────────────────── */

const contactSchema = z.object({
  name: z.string().describe('Full name'),
  email: z.string().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  company: z.string().optional().describe('Company name'),
});

const eventSchema = z.object({
  title: z.string().describe('Event title'),
  date: z.string().describe('Event date'),
  location: z.string().describe('Event location'),
  description: z.string().optional().describe('Brief description'),
});

const reviewSchema = z.object({
  product: z.string().describe('Product name'),
  rating: z.number().describe('Rating from 1 to 5'),
  pros: z.array(z.string()).describe('List of positive aspects'),
  cons: z.array(z.string()).describe('List of negative aspects'),
});

const recipeSchema = z.object({
  name: z.string().describe('Recipe name'),
  servings: z.number().describe('Number of servings'),
  ingredients: z
    .array(
      z.object({
        item: z.string().describe('Ingredient name'),
        amount: z.string().describe('Amount with unit'),
      }),
    )
    .describe('List of ingredients'),
  steps: z.array(z.string()).describe('Cooking steps'),
});

const jobSchema = z.object({
  title: z.string().describe('Job title'),
  company: z.string().describe('Company name'),
  salary: z.string().optional().describe('Salary range'),
  requirements: z.array(z.string()).describe('Job requirements'),
  location: z.string().describe('Job location'),
});

/** The default template. */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'contact';

/** All five templates, in picker order. */
export const TEMPLATES: readonly ExtractionTemplate[] = [
  {
    id: 'contact',
    name: 'Contact Info',
    schema: jsonSchema(contactSchema),
    schemaDisplay: '{ name, email, phone?, company? }',
    sampleText:
      'Hi, my name is Sarah Chen. You can reach me at sarah.chen@acme.co or call 555-0147. I work at Acme Corporation as a Senior Engineer.',
  },
  {
    id: 'event',
    name: 'Event Details',
    schema: jsonSchema(eventSchema),
    schemaDisplay: '{ title, date, location, description? }',
    sampleText:
      'Join us for the Annual Tech Summit on March 15, 2027 at the SF Convention Center. This year we focus on AI, privacy, and the future of local-first computing.',
  },
  {
    id: 'review',
    name: 'Product Review',
    schema: jsonSchema(reviewSchema),
    schemaDisplay: '{ product, rating, pros[], cons[] }',
    sampleText:
      "I bought the NovaPhone X200 last month. It's fantastic: the camera is incredible, battery lasts two days, and the display is gorgeous. However, it's quite heavy and the price is steep at $1200. I'd give it 4 out of 5 stars.",
  },
  {
    id: 'recipe',
    name: 'Recipe',
    schema: jsonSchema(recipeSchema),
    schemaDisplay: '{ name, servings, ingredients[{item,amount}], steps[] }',
    sampleText:
      'Classic Pancakes (serves 4): Mix 1.5 cups flour, 3.5 tsp baking powder, 1 tbsp sugar, and a pinch of salt. In another bowl, combine 1.25 cups milk, 1 egg, and 3 tbsp melted butter. Mix wet into dry until smooth. Pour 1/4 cup batter onto a hot griddle. Cook until bubbles form, flip, cook until golden. Serve with maple syrup.',
  },
  {
    id: 'job',
    name: 'Job Posting',
    schema: jsonSchema(jobSchema),
    schemaDisplay: '{ title, company, salary?, requirements[], location }',
    sampleText:
      'We are hiring a Senior Frontend Engineer at CloudTech Inc. The position is based in Austin, TX with a salary range of $150K-$190K. Requirements: 5+ years of React experience, TypeScript proficiency, experience with Next.js, and familiarity with CI/CD pipelines.',
  },
];

/** Look up a template by id (falls back to the default). */
export function getTemplate(id: TemplateId): ExtractionTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/* ─────────────────────────── artifacts mapping ─────────────────────────── */

/** A column for the derived data-table-artifact. */
export interface DerivedColumn {
  key: string;
  header: string;
}

/** A derived table: columns + rows straight from the validated extraction. */
export interface DerivedTable {
  columns: DerivedColumn[];
  rows: Record<string, unknown>[];
}

/** A derived chart-artifact spec built from the extraction's numeric data. */
export interface DerivedChart {
  type: 'gauge' | 'bar' | 'line' | 'area' | 'scatter' | 'radar';
  data: Array<{ x?: number; y?: number; label?: string; value?: number }>;
  max?: number;
  title: string;
}

/** The artifacts derived from one validated extraction. */
export interface DerivedArtifacts {
  table: DerivedTable;
  /** Non-null only when the extraction contained chartable numeric data. */
  chart: DerivedChart | null;
  /** When `chart` is null, why (drives the honest empty-chart state). */
  chartEmptyReason?: string;
}

/** Coerce an unknown value to a display string for a table cell. */
function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Parse salary figures like "$150K-$190K" / "$1,200" into numbers. */
function parseSalaries(text: string): number[] {
  const out: number[] = [];
  const re = /\$?\s?([\d,]+(?:\.\d+)?)\s?([kmKM])?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const base = Number.parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const suffix = (match[2] ?? '').toLowerCase();
    const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1;
    out.push(base * mult);
  }
  return out;
}

/**
 * Derive the table + chart artifacts for a validated extraction.
 *
 * Array-valued fields become table rows (recipe ingredients/steps, review
 * pros/cons, job requirements); scalar templates (contact, event) render
 * field/value rows. The chart visualizes ONLY numbers actually present in the
 * extraction — review rating on its 1–5 scale, recipe servings/ingredient/step
 * counts, parsed job salary. Templates whose current extraction has no numeric
 * data return `chart: null` with a `chartEmptyReason`.
 *
 * @param templateId - The active template
 * @param object - The validated extraction (schema.parse succeeded upstream)
 * @returns The derived table and (optional) chart
 */
export function deriveArtifacts(templateId: TemplateId, object: unknown): DerivedArtifacts {
  const obj = (object ?? {}) as Record<string, unknown>;

  switch (templateId) {
    case 'review': {
      const pros = Array.isArray(obj.pros) ? obj.pros : [];
      const cons = Array.isArray(obj.cons) ? obj.cons : [];
      const rows: Record<string, unknown>[] = [
        ...pros.map((p) => ({ aspect: asText(p), sentiment: 'pro' })),
        ...cons.map((c) => ({ aspect: asText(c), sentiment: 'con' })),
      ];
      const rating = typeof obj.rating === 'number' ? obj.rating : Number.NaN;
      const chart: DerivedChart | null = Number.isFinite(rating)
        ? { type: 'gauge', data: [{ value: rating }], max: 5, title: 'Rating (out of 5)' }
        : null;
      return {
        table: {
          columns: [
            { key: 'aspect', header: 'Aspect' },
            { key: 'sentiment', header: 'Sentiment' },
          ],
          rows,
        },
        chart,
        ...(chart ? {} : { chartEmptyReason: 'No numeric rating was extracted.' }),
      };
    }

    case 'recipe': {
      const ingredients = Array.isArray(obj.ingredients) ? obj.ingredients : [];
      const steps = Array.isArray(obj.steps) ? obj.steps : [];
      const rows: Record<string, unknown>[] = [
        ...ingredients.map((ing) => {
          const record = (ing ?? {}) as Record<string, unknown>;
          return { entry: asText(record.item), detail: asText(record.amount), kind: 'ingredient' };
        }),
        ...steps.map((s, i) => ({ entry: `Step ${i + 1}`, detail: asText(s), kind: 'step' })),
      ];
      const servings = typeof obj.servings === 'number' ? obj.servings : Number.NaN;
      const chart: DerivedChart = {
        type: 'bar',
        data: [
          { label: 'Servings', value: Number.isFinite(servings) ? servings : 0 },
          { label: 'Ingredients', value: ingredients.length },
          { label: 'Steps', value: steps.length },
        ],
        title: 'Recipe counts',
      };
      return {
        table: {
          columns: [
            { key: 'entry', header: 'Item / Step' },
            { key: 'detail', header: 'Detail' },
            { key: 'kind', header: 'Kind' },
          ],
          rows,
        },
        chart,
      };
    }

    case 'job': {
      const requirements = Array.isArray(obj.requirements) ? obj.requirements : [];
      const rows: Record<string, unknown>[] = requirements.map((r, i) => ({
        index: i + 1,
        requirement: asText(r),
      }));
      const salaries = typeof obj.salary === 'string' ? parseSalaries(obj.salary) : [];
      let chart: DerivedChart | null = null;
      if (salaries.length >= 2) {
        chart = {
          type: 'bar',
          data: [
            { label: 'Min', value: Math.min(...salaries) },
            { label: 'Max', value: Math.max(...salaries) },
          ],
          title: 'Salary range',
        };
      } else if (salaries.length === 1) {
        chart = { type: 'bar', data: [{ label: 'Salary', value: salaries[0] }], title: 'Salary' };
      }
      return {
        table: {
          columns: [
            { key: 'index', header: '#' },
            { key: 'requirement', header: 'Requirement' },
          ],
          rows,
        },
        chart,
        ...(chart ? {} : { chartEmptyReason: 'No parseable salary figure was extracted.' }),
      };
    }

    case 'contact':
    case 'event':
    default: {
      // Scalar templates → field/value rows; no numeric data to chart.
      const rows: Record<string, unknown>[] = Object.entries(obj).map(([field, value]) => ({
        field,
        value: asText(value),
      }));
      return {
        table: {
          columns: [
            { key: 'field', header: 'Field' },
            { key: 'value', header: 'Value' },
          ],
          rows,
        },
        chart: null,
        chartEmptyReason: 'This template extracts no numeric fields.',
      };
    }
  }
}

/** Read an optional `hint` string off an unknown error (StructuredOutputError). */
function errorHint(error: unknown): string | null {
  if (error && typeof error === 'object' && 'hint' in error) {
    const hint = (error as { hint?: unknown }).hint;
    if (typeof hint === 'string' && hint.length > 0) return hint;
  }
  return null;
}

/**
 * Self-sufficient Data Extractor block: owns its WebLLM model load AND the
 * template picker + `useGenerateObject` lifecycle; renders the validated result
 * through the structured-output-viewer and the artifacts family.
 */
export function DataExtractorBlock() {
  // ── model layer (own load; no shared instance, no mode switch) ──
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);

  const { capabilities } = useCapabilities();
  const hasWebGPU = Boolean(capabilities?.features.webgpu);
  // Detection RESOLVED with no WebGPU adapter (distinct from still-detecting) —
  // drives the gate-first layout so the notice isn't buried below the selector.
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

  // ── extractor (uses the block's own model directly) ──
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [input, setInput] = useState('');
  const template = getTemplate(templateId);

  const { data, error, isLoading, execute, cancel, reset } = useGenerateObject<unknown>({
    model: model as LanguageModel,
    schema: template.schema,
    mode: 'json',
    temperature: 0,
    maxRetries: 3,
    // Grammar-constrained JSON via WebLLM's XGrammar backend. Qwen3-1.7B cannot
    // reliably emit schema-conforming JSON from a prompt alone — unconstrained,
    // it invents its own keys or echoes the schema — so the extraction is forced
    // to follow the active template's schema. The `schema` string is WebLLM's
    // `response_format` contract (see @localmode/webllm doGenerate).
    providerOptions: {
      webllm: {
        response_format: {
          type: 'json_object',
          schema: JSON.stringify(template.schema.jsonSchema),
        },
      },
    },
  });

  const hasInput = input.trim().length > 0;
  const canExtract = hasInput && modelReady && !isLoading;

  const extract = () => {
    if (!canExtract) return;
    void execute(input);
  };

  /** Switch template: cancel any in-flight run and clear the prior result. */
  const switchTemplate = (id: TemplateId) => {
    if (id === templateId) return;
    cancel();
    reset();
    setTemplateId(id);
  };

  const loadSample = () => setInput(template.sampleText);

  const object = data?.object;
  const attempts = data?.attempts ?? 0;
  const usage = data?.usage;
  const derived = data ? deriveArtifacts(templateId, object) : null;
  const jsonText = data ? JSON.stringify(object, null, 2) : '';

  // First-class WebGPU capability gate: amber, icon-led, AA-contrast heading,
  // and a plain explanation of the requirement + what a supported device shows.
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

      {/* ── model layer ── gate-first on a no-WebGPU device so the notice leads
          instead of stacking below a disabled selector. */}
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

      {/* ── Extraction surface: always rendered. The template picker, schema
           preview and sample loader work without a model, so they must be
           visible before a load and on devices without WebGPU. Extract stays
           disabled until `modelReady`. ── */}
        <div className="min-h-48">
          <div className="flex flex-col gap-4">
            {/* ── template picker ──
                A labelled button group with `aria-pressed` (NOT the WAI-ARIA tab
                pattern, which needs aria-controls + a tabpanel + roving arrow-key
                nav this picker doesn't implement). */}
            <div className="flex flex-col gap-2">
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Extraction template"
                data-template={templateId}
              >
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={t.id === templateId}
                    onClick={() => switchTemplate(t.id)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      t.id === templateId
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Schema</span>
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {template.schemaDisplay}
                </code>
              </div>
            </div>

            {/* ── input + controls ── */}
            <div className="flex flex-col gap-2">
              <textarea
                aria-label="Text to extract from"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter submits.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canExtract) {
                    e.preventDefault();
                    extract();
                  }
                }}
                rows={5}
                placeholder={
                  modelReady
                    ? 'Paste free text to extract structured data from…'
                    : 'Load the model to start extracting…'
                }
                className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={loadSample}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Load Sample
                </button>
                {isLoading ? (
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={extract}
                    disabled={!canExtract}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Extract
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {isLoading ? 'Extracting…' : 'Cmd/Ctrl+Enter to extract'}
                </span>
              </div>
            </div>

            {/* ── machine-readable extract-state mirror (sr-only driver hooks;
                 aria-labelled so it's reachable by a role/label selector) ── */}
            <div className="sr-only">
              <div
                aria-label="Extraction state"
                data-loading={isLoading ? 'loading' : 'idle'}
                data-has-result={data ? 'true' : 'false'}
                data-attempts={attempts}
                data-template={templateId}
                data-object={jsonText}
              />
            </div>

            {/* ── idle / result ── */}
            {!data && !error && (
              <p
                role="status"
                className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
              >
                {isLoading
                  ? 'Extracting structured data…'
                  : 'Pick a template, load or paste text, and extract to see the validated JSON here.'}
              </p>
            )}

            {data && (
              <>
                {/* attempts badge */}
                <div className="flex items-center gap-2">
                  <span
                    data-attempts={attempts}
                    className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    Attempt {attempts}/3
                  </span>
                  {attempts > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Recovered via schema self-correction
                    </span>
                  )}
                </div>

                {/* structured output viewer (JSON + schema tree + stats) */}
                <div role="group" aria-label="Extracted data">
                  <StructuredOutputViewer
                    object={object}
                    usage={usage}
                    durationMs={usage?.durationMs}
                    attempts={attempts}
                  />
                </div>

                {/* artifacts home: docked canvas with table + chart */}
                {derived && (
                  <Artifact className="w-full">
                    <ArtifactHeader>
                      <div className="min-w-0">
                        <ArtifactTitle>{template.name}</ArtifactTitle>
                        <ArtifactDescription>
                          Extracted on-device • {derived.table.rows.length} row
                          {derived.table.rows.length === 1 ? '' : 's'}
                        </ArtifactDescription>
                      </div>
                      <ArtifactActions>
                        <ArtifactAction
                          label="Copy JSON"
                          content={jsonText}
                        />
                        <ArtifactAction
                          label="Download JSON"
                          content={jsonText}
                          fileName={`${templateId}.json`}
                        />
                      </ArtifactActions>
                    </ArtifactHeader>
                    <ArtifactContent>
                      <div className="flex flex-col gap-4">
                        <div
                          data-rows={derived.table.rows.length}
                        >
                          <DataTableArtifact
                            rows={derived.table.rows}
                            columns={derived.table.columns}
                          />
                        </div>
                        {derived.chart ? (
                          <div
                            data-chart-type={derived.chart.type}
                          >
                            <ChartArtifact
                              type={derived.chart.type}
                              data={derived.chart.data}
                              max={derived.chart.max}
                              title={derived.chart.title}
                            />
                          </div>
                        ) : (
                          <p
                            className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
                          >
                            No chart -{' '}
                            {derived.chartEmptyReason ?? 'this extraction has no numeric data.'}
                          </p>
                        )}
                      </div>
                    </ArtifactContent>
                  </Artifact>
                )}
              </>
            )}

            {/* ── extraction error (incl. attempts exhausted) ── */}
            {error && (
              <div className="flex flex-col gap-2">
                <InMessageError error={error} onRetry={hasInput ? extract : undefined} />
                {errorHint(error) && (
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                    <code>{errorHint(error)}</code>
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
