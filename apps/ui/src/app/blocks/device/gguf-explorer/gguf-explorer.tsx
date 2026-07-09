'use client';

/**
 * @file gguf-explorer.tsx
 * @description Self-sufficient block: HF GGUF search + curated wllama browse + ~4KB Range-read metadata inspection + browser-compat verdict + chat handoff, consuming the promoted `@localmode/wllama` discovery utils (searchGGUFModels/listGGUFFiles).
 * @constraint GGUF inspection is a user-initiated ~4KB HTTP Range metadata read — never a model download.
 */

import { useEffect, useRef, useState } from 'react';
import {
  checkGGUFBrowserCompatFromURL,
  deleteModelCache,
  getModelCategory,
  HFApiError,
  isModelCached,
  listGGUFFiles,
  preloadModel,
  searchGGUFModels,
  WLLAMA_MODELS,
  type GGUFBrowserCompat,
  type GGUFMetadata,
  type HFModelFile,
  type HFModelSearchResult,
  type HFSort,
  type WllamaModelEntry,
  type WllamaModelId,
} from '@localmode/wllama';
import {
  AlertTriangle,
  CloudDownload,
  Globe,
  Loader2,
  MessageSquare,
  RotateCw,
  X,
} from 'lucide-react';

import {
  ModelSearchBrowser,
  type ModelRepoFile,
  type ModelSearchResult,
  type ModelSearchSort,
} from '@/components/model-search-browser';
import { ModelCatalogCard, type CatalogEntry } from '@/components/model-catalog-card';
import { GGUFMetadataCard } from '@/components/model-metadata-card';
import { BrowserCompatCard } from '@/components/browser-compat-card';
import { CapabilityGate } from '@/components/capability-gate';
import { ModelDownloader } from '@/components/model-downloader';

/**
 * Build the `/blocks/chat` handoff URL for a GGUF model.
 *
 * @param model Full `.gguf` URL or `repo/name:file.gguf` shorthand.
 * @param opts.mmproj Optional multimodal projector URL, appended as `mmproj`
 * when the curated catalog entry carries one.
 * @returns A relative URL of the form `/blocks/chat?model=<encoded>` (plus
 * `&mmproj=<encoded>` when provided).
 *
 * @example
 * ```ts
 * buildChatHandoffUrl('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
 * // → '/blocks/chat?model=bartowski%2FLlama-3.2-1B-Instruct-GGUF%3ALlama-3.2-1B-Instruct-Q4_K_M.gguf'
 * ```
 */
function buildChatHandoffUrl(model: string, opts?: { mmproj?: string }): string {
  let url = `/blocks/chat?model=${encodeURIComponent(model)}`;
  if (opts?.mmproj) {
    url += `&mmproj=${encodeURIComponent(opts.mmproj)}`;
  }
  return url;
}

// ═══════════════════════════════════════════════════════════════
// STATIC DATA (no network — derived from the imported catalog constant)
// ═══════════════════════════════════════════════════════════════

const GIB = 1024 * 1024 * 1024;

/** Example shorthand shown as the custom-input hint (also the E2E pin). */
const SHORTHAND_EXAMPLE =
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf';

/** One curated catalog entry keyed by its WLLAMA_MODELS id. */
interface CuratedModel {
  id: WllamaModelId;
  entry: WllamaModelEntry;
}

const ALL_CURATED: CuratedModel[] = Object.entries(WLLAMA_MODELS).map(([id, entry]) => ({
  id: id as WllamaModelId,
  entry: entry as WllamaModelEntry,
}));

const GROUP_META: { category: ReturnType<typeof getModelCategory>; title: string }[] = [
  { category: 'tiny', title: 'Tiny - under 500 MB' },
  { category: 'small', title: 'Small - 500 MB to 1 GB' },
  { category: 'medium', title: 'Medium - 1 to 2 GB' },
  { category: 'large', title: 'Large - 2 GB and up' },
];

/** Curated catalog grouped by wllama's size categories (G2). */
const CURATED_GROUPS = GROUP_META.map((group) => ({
  ...group,
  models: ALL_CURATED.filter((m) => getModelCategory(m.entry.sizeBytes) === group.category),
})).filter((group) => group.models.length > 0);

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Format a parameter count to a human label (1236000000 → "1.24B"). */
function formatParams(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(2)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(0)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

/** Format bytes to a human-readable size string. */
function formatBytes(bytes: number): string {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(2)} GB`;
  const mib = 1024 * 1024;
  if (bytes >= mib) return `${(bytes / mib).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Bytes → GB with two decimals (for the compat card's ratio bar). */
function toGB(bytes: number): number {
  return Math.round((bytes / GIB) * 100) / 100;
}

/** Resolve an HF repo + filename to the canonical download URL. */
function hfFileUrl(repoId: string, filename: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${filename}`;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

/** Typed HF error display info (G5: rate-limit vs network vs not-found). */
interface SearchErrorInfo {
  kind: 'rate-limit' | 'network' | 'not-found' | 'unknown';
  message: string;
}

function describeHFError(err: unknown): SearchErrorInfo {
  if (err instanceof HFApiError) {
    if (err.kind === 'rate-limit') {
      return {
        kind: 'rate-limit',
        message: `HuggingFace rate limit reached - wait a moment and retry. (${err.message})`,
      };
    }
    if (err.kind === 'not-found') {
      return { kind: 'not-found', message: `Not found on HuggingFace. (${err.message})` };
    }
    return {
      kind: 'network',
      message: `Network error reaching HuggingFace - check your connection and retry. (${err.message})`,
    };
  }
  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** Map an hf-api search row to the primitive's row shape (identical fields). */
function toSearchRow(r: HFModelSearchResult): ModelSearchResult {
  return {
    repoId: r.repoId,
    author: r.author,
    downloads: r.downloads,
    likes: r.likes,
    lastModified: r.lastModified,
    tags: r.tags,
  };
}

/** Map an hf-api file to the primitive's file shape (identical fields). */
function toRepoFile(f: HFModelFile): ModelRepoFile {
  return { filename: f.filename, sizeBytes: f.sizeBytes, quantLabel: f.quantLabel };
}

/** Map a curated WLLAMA_MODELS entry to the catalog card's shape (G3–G4). */
function toCatalogEntry(id: WllamaModelId, entry: WllamaModelEntry): CatalogEntry {
  return {
    id,
    name: entry.name,
    size: entry.size,
    description: entry.description,
    architecture: entry.architecture,
    parameters: formatParams(entry.parameterCount),
    quantization: entry.quantization,
    contextLength: entry.contextLength,
    tools: entry.supportsToolCalling,
    vision: entry.vision,
    embedding: entry.isEmbeddingModel,
    reranking: entry.isRerankerModel,
    reasoning: entry.supportsReasoning,
  };
}

// ═══════════════════════════════════════════════════════════════
// STATE SHAPES
// ═══════════════════════════════════════════════════════════════

/** What the user selected for inspection (any of the three entry points). */
interface InspectTarget {
  /** URL or `repo/name:file.gguf` shorthand — handed verbatim to wllama and the handoff. */
  input: string;
  /** Display label for the inspector header and downloader. */
  label: string;
  /** Which surface produced the selection. */
  source: 'curated' | 'custom' | 'huggingface';
  /** Curated catalog entry when applicable (mmproj, dimensions, GPU layers). */
  entry?: WllamaModelEntry;
}

type Inspection =
  | { status: 'idle' }
  | { status: 'inspecting' }
  | { status: 'done'; result: GGUFBrowserCompat & { metadata: GGUFMetadata } }
  | { status: 'error'; message: string };

type Prefetch =
  | { status: 'idle' }
  | { status: 'downloading'; phase: 'model' | 'mmproj'; loaded: number; total: number }
  | { status: 'done' }
  | { status: 'error'; message: string };

// ═══════════════════════════════════════════════════════════════
// BLOCK
// ═══════════════════════════════════════════════════════════════

/**
 * GGUF Explorer block — HF browse + curated catalog + custom input feeding a
 * Range-read inspector with compat verdict, chat handoff, and prefetch-to-cache.
 */
export function GgufExplorerBlock() {
  // ── HF browse state (G5) ─────────────────────────────────────
  const [hfActivated, setHfActivated] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HFSort>('downloads');
  const [results, setResults] = useState<ModelSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<SearchErrorInfo | null>(null);
  const [expandedRepoId, setExpandedRepoId] = useState<string | undefined>(undefined);
  const [files, setFiles] = useState<ModelRepoFile[] | undefined>(undefined);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | undefined>(undefined);
  const searchAbort = useRef<AbortController | null>(null);
  const searchSeq = useRef(0);
  const filesAbort = useRef<AbortController | null>(null);

  // ── Custom input state (G1) ──────────────────────────────────
  const [customInput, setCustomInput] = useState('');

  // ── Inspector state (G6–G7) ──────────────────────────────────
  const [target, setTarget] = useState<InspectTarget | null>(null);
  const [inspection, setInspection] = useState<Inspection>({ status: 'idle' });
  const inspectAbort = useRef<AbortController | null>(null);

  // ── Handoff + prefetch state (G8) ────────────────────────────
  const [tryAnyway, setTryAnyway] = useState(false);
  const [cached, setCached] = useState<boolean | null>(null);
  const [prefetch, setPrefetch] = useState<Prefetch>({ status: 'idle' });
  const prefetchSeq = useRef(0);

  // ── HF search execution ──────────────────────────────────────

  const executeSearch = async (opts: { append?: boolean; cursor?: string } = {}) => {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const seq = ++searchSeq.current;
    setIsSearching(true);
    setSearchError(null);
    if (!opts.append) {
      // A fresh result set invalidates any expanded repo.
      setExpandedRepoId(undefined);
      setFiles(undefined);
      setFilesError(undefined);
    }
    try {
      const page = await searchGGUFModels({
        query: query.trim(),
        sort,
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        abortSignal: controller.signal,
      });
      if (seq !== searchSeq.current || controller.signal.aborted) return;
      setResults((prev) =>
        opts.append ? [...prev, ...page.results.map(toSearchRow)] : page.results.map(toSearchRow),
      );
      setNextCursor(page.nextCursor);
      setIsSearching(false);
    } catch (err) {
      if (seq !== searchSeq.current || isAbortError(err)) return;
      setIsSearching(false);
      setSearchError(describeHFError(err));
    }
  };

  // Debounced search: fires ONLY once the surface has been user-activated
  // (browse button, typing, or sort change) — never on mount (zero-network guarantee).
  useEffect(() => {
    if (!hfActivated) return;
    const timer = setTimeout(() => {
      void executeSearch();
    }, 300);
    return () => clearTimeout(timer);
    // executeSearch closes over the query/sort of this render — exactly the values
    // this debounce tick should search with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, hfActivated]);

  // Abort every in-flight request and orphan any prefetch on unmount.
  useEffect(() => {
    return () => {
      searchAbort.current?.abort();
      filesAbort.current?.abort();
      inspectAbort.current?.abort();
      prefetchSeq.current += 1;
    };
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setHfActivated(true);
  };

  const handleSortChange = (s: ModelSearchSort) => {
    setSort(s);
    setHfActivated(true);
  };

  const handleSelectRepo = (repoId: string | null) => {
    if (repoId === null || expandedRepoId === repoId) {
      filesAbort.current?.abort();
      setExpandedRepoId(undefined);
      setFiles(undefined);
      setFilesError(undefined);
      setFilesLoading(false);
      return;
    }
    filesAbort.current?.abort();
    const controller = new AbortController();
    filesAbort.current = controller;
    setExpandedRepoId(repoId);
    setFiles(undefined);
    setFilesError(undefined);
    setFilesLoading(true);
    listGGUFFiles(repoId, { abortSignal: controller.signal })
      .then((fs) => {
        if (controller.signal.aborted) return;
        setFiles(fs.map(toRepoFile));
        setFilesLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setFilesLoading(false);
        setFilesError(describeHFError(err).message);
      });
  };

  const handleSelectFile = (repoId: string, file: ModelRepoFile) => {
    inspect({
      input: hfFileUrl(repoId, file.filename),
      label: `${repoId} · ${file.filename}`,
      source: 'huggingface',
    });
  };

  // ── Inspection (G6–G7): user-initiated ~4KB Range read ───────

  const inspect = (nextTarget: InspectTarget) => {
    inspectAbort.current?.abort();
    const controller = new AbortController();
    inspectAbort.current = controller;
    // Orphan any prefetch of the previous model and reset per-model gates.
    prefetchSeq.current += 1;
    setPrefetch({ status: 'idle' });
    setTryAnyway(false);
    setCached(null);
    setTarget(nextTarget);
    setInspection({ status: 'inspecting' });
    void (async () => {
      try {
        const result = await checkGGUFBrowserCompatFromURL(nextTarget.input, {
          abortSignal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setInspection({ status: 'done', result });
        // OPFS-local cache lookup (no network) so the prefetch surface can
        // show "already cached" honestly.
        const alreadyCached = await isModelCached(nextTarget.input).catch(() => false);
        if (!controller.signal.aborted) setCached(alreadyCached);
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) return;
        // wllama's error messages carry the Range-request / not-a-GGUF hints —
        // surface them verbatim (spec: inspection errors with actionable message).
        setInspection({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  };

  const handleCuratedClick = (modelId: string) => {
    const curated = ALL_CURATED.find((m) => m.id === modelId);
    if (!curated) return;
    inspect({
      input: curated.entry.url,
      label: curated.entry.name,
      source: 'curated',
      entry: curated.entry,
    });
  };

  const handleCustomInspect = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    inspect({ input: trimmed, label: trimmed, source: 'custom' });
  };

  // ── Prefetch-to-cache (G8, explicit + cooperative cancel) ────

  const startPrefetch = () => {
    if (!target || inspection.status !== 'done' || prefetch.status === 'downloading') return;
    const model = target;
    const seq = ++prefetchSeq.current;
    setPrefetch({
      status: 'downloading',
      phase: 'model',
      loaded: 0,
      total: inspection.result.metadata.fileSize,
    });
    void (async () => {
      try {
        await preloadModel(model.input, {
          onProgress: (p) => {
            if (seq !== prefetchSeq.current) return;
            setPrefetch({
              status: 'downloading',
              phase: 'model',
              loaded: p.loaded ?? 0,
              total: p.total ?? 0,
            });
          },
        });
        if (seq !== prefetchSeq.current) {
          // Cancelled while downloading: preloadModel has no AbortSignal, so the
          // transfer ran to settle — remove the now-unwanted cache entry.
          await deleteModelCache(model.input).catch(() => {});
          return;
        }
        const mmproj = model.entry?.mmprojUrl;
        if (mmproj) {
          setPrefetch({ status: 'downloading', phase: 'mmproj', loaded: 0, total: 0 });
          await preloadModel(mmproj, {
            onProgress: (p) => {
              if (seq !== prefetchSeq.current) return;
              setPrefetch({
                status: 'downloading',
                phase: 'mmproj',
                loaded: p.loaded ?? 0,
                total: p.total ?? 0,
              });
            },
          });
          if (seq !== prefetchSeq.current) {
            await deleteModelCache(mmproj).catch(() => {});
            return;
          }
        }
        setPrefetch({ status: 'done' });
        setCached(true);
      } catch (err) {
        if (seq !== prefetchSeq.current) return;
        setPrefetch({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  };

  const cancelPrefetch = () => {
    // Cooperative cancel: detach the UI now; the orphaned transfer's cache entry
    // is deleted when it settles (see startPrefetch).
    prefetchSeq.current += 1;
    setPrefetch({ status: 'idle' });
  };

  // ── Derived ──────────────────────────────────────────────────

  const compat = inspection.status === 'done' ? inspection.result : null;
  const meta = compat?.metadata ?? null;
  const handoffHref = target
    ? buildChatHandoffUrl(
        target.input,
        target.entry?.mmprojUrl ? { mmproj: target.entry.mmprojUrl } : undefined,
      )
    : null;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-10 p-4">
      {/* Block-root status for the platform no-download loop (always ready). */}
      <span data-state="ready" className="sr-only" />

      {/* ── (c) Custom URL / shorthand input (G1) ─────────────── */}
      <section aria-label="Inspect a custom GGUF" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Inspect any GGUF</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="GGUF URL or HuggingFace shorthand"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomInspect();
            }}
            placeholder="https://huggingface.co/…/resolve/main/model.gguf or repo/name:file.gguf"
            className="h-9 min-w-72 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={handleCustomInspect}
            disabled={!customInput.trim()}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Inspect
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Accepts full URLs or HuggingFace shorthand - e.g.{' '}
          <code className="break-all rounded bg-muted px-1 py-0.5 text-[11px] [overflow-wrap:anywhere]">
            {SHORTHAND_EXAMPLE}
          </code>
          . Inspection reads ~4 KB of the file header, never the model.
        </p>
      </section>

      {/* ── (b) Curated catalog (G2–G4) ───────────────────────── */}
      <section
        aria-label="Curated wllama model catalog"
        className="flex flex-col gap-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Curated catalog</h2>
          <span className="text-xs text-muted-foreground">
            {ALL_CURATED.length} models verified for browser inference
          </span>
        </div>
        {CURATED_GROUPS.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.models.map(({ id, entry }) => (
                <div key={id} data-model-id={id}>
                  <ModelCatalogCard
                    entry={toCatalogEntry(id, entry)}
                    selected={target?.input === entry.url}
                    onClick={handleCuratedClick}
                    className="h-full max-w-none"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── (a) HuggingFace browse (G5) ───────────────────────── */}
      <section aria-label="Browse HuggingFace GGUF models" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">HuggingFace GGUF catalog</h2>
          <span className="text-xs text-muted-foreground">160,000+ GGUF models</span>
        </div>

        {!hfActivated && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setHfActivated(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Globe className="size-4" aria-hidden="true" />
              Browse HuggingFace
            </button>
            <p className="text-xs text-muted-foreground">
              Nothing is fetched from huggingface.co until you browse, type, or sort.
            </p>
          </div>
        )}

        {searchError && (
          <div
            role="alert"
            data-kind={searchError.kind}
            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
          >
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <span className="min-w-fit whitespace-nowrap rounded-full border border-destructive/40 px-1.5 py-0.5 font-medium uppercase tracking-wide text-destructive">
              {searchError.kind}
            </span>
            <span className="min-w-0 flex-1 text-destructive">{searchError.message}</span>
            <button
              type="button"
              onClick={() => void executeSearch()}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <RotateCw className="size-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {/*
         * The primitive owns search input, sort control, result rows, and the
         * expanded file list. It mounts only once the surface is user-activated
         * so its idle "No models found" empty state never reads as a failed
         * search (and its sort control can't fire a metadata fetch pre-browse).
         * hasMore/onLoadMore and error/onRetry are intentionally NOT passed: the
         * block owns pagination + search-error surfaces.
         */}
        {hfActivated && (
          <div className="w-full">
            <ModelSearchBrowser
              className="max-w-none"
              query={query}
              onQueryChange={handleQueryChange}
              sort={sort}
              onSortChange={handleSortChange}
              results={results}
              isLoading={isSearching}
              expandedRepoId={expandedRepoId}
              onSelectRepo={handleSelectRepo}
              files={files}
              filesLoading={filesLoading}
              filesError={filesError}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {hfActivated && nextCursor && (
          <button
            type="button"
            onClick={() => void executeSearch({ append: true, cursor: nextCursor })}
            disabled={isSearching}
            className="inline-flex h-8 items-center self-start rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {isSearching ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      {/* ── (d)–(f) Inspector: metadata + compat + handoff + prefetch ── */}
      <section aria-label="GGUF inspector" className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Inspector</h2>

        {target === null && (
          <p className="text-sm text-muted-foreground">
            Pick a curated model, select a HuggingFace file, or paste a URL to inspect its
            GGUF header and check whether it can run on this device.
          </p>
        )}

        {target && (
          <p className="break-all text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Inspecting: <span className="font-medium text-foreground">{target.label}</span>
          </p>
        )}

        {inspection.status === 'inspecting' && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reading GGUF header (~4 KB HTTP Range request - the model file is not
            downloaded)…
          </p>
        )}

        {inspection.status === 'error' && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
          >
            {/* wllama's message verbatim — it already carries the Range/not-a-GGUF hints. */}
            <p className="text-xs text-destructive">{inspection.message}</p>
            <button
              type="button"
              onClick={() => target && inspect(target)}
              className="inline-flex h-7 items-center gap-1 self-start rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <RotateCw className="size-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {compat && meta && target && (
          <div className="flex flex-col gap-4">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {/* Metadata (G6) */}
              <div
                role="group"
                aria-label="Model metadata"
                className="flex flex-col gap-3"
              >
                <GGUFMetadataCard
                  className="max-w-none"
                  metadata={{
                    architecture: meta.architecture,
                    parameters: formatParams(meta.parameterCount),
                    quantization: meta.quantization,
                    contextLength: meta.contextLength,
                    embeddingDimension: meta.embeddingLength,
                    vocabSize: meta.vocabSize,
                    headCount: meta.headCount,
                    layerCount: meta.layerCount,
                    fileSizeBytes: meta.fileSize,
                    author: meta.author,
                    license: meta.license,
                  }}
                />
                {/* Fields the card's props don't cover — surfaced so nothing is dropped. */}
                {(meta.modelName ||
                  meta.description ||
                  target.entry?.dimensions != null ||
                  target.entry?.nGpuLayers != null ||
                  target.entry?.mmprojUrl) && (
                  <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Additional details
                    </p>
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
                      {meta.modelName && (
                        <>
                          <dt className="text-muted-foreground">Name</dt>
                          <dd className="break-words [overflow-wrap:anywhere]">
                            {meta.modelName}
                          </dd>
                        </>
                      )}
                      {meta.description && (
                        <>
                          <dt className="text-muted-foreground">Description</dt>
                          <dd className="break-words [overflow-wrap:anywhere]">
                            {meta.description}
                          </dd>
                        </>
                      )}
                      {target.entry?.dimensions != null && (
                        <>
                          <dt className="text-muted-foreground">Embedding dims</dt>
                          <dd>{target.entry.dimensions}</dd>
                        </>
                      )}
                      {target.entry?.nGpuLayers != null && (
                        <>
                          <dt className="text-muted-foreground">GPU layers</dt>
                          <dd>{target.entry.nGpuLayers}</dd>
                        </>
                      )}
                      {target.entry?.mmprojUrl && (
                        <>
                          <dt className="text-muted-foreground">Vision projector</dt>
                          <dd>mmproj available - included in the chat handoff</dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              {/* Compat (G7) — the run/no-run verdict is stated ONCE, by the
                  BrowserCompatCard header; the wrapper carries the machine-readable
                  verdict (data-can-run) for assistive tech + drivers. */}
              <div
                role="group"
                aria-label="Device compatibility"
                data-can-run={String(compat.canRun)}
                className="flex flex-col gap-3"
              >
                <BrowserCompatCard
                  className="max-w-none"
                  modelName={meta.modelName ?? target.label}
                  requiredGB={toGB(compat.estimatedRAM)}
                  deviceGB={toGB(compat.deviceRAM ?? 4 * GIB)}
                  availableStorageGB={
                    compat.availableStorage != null ? toGB(compat.availableStorage) : undefined
                  }
                  crossOriginIsolated={compat.hasCORS}
                  estimatedSpeed={compat.estimatedSpeed}
                  warnings={compat.warnings}
                  canRun={compat.canRun}
                />
                {/* BrowserCompatCard has no recommendations prop — render them verbatim. */}
                {compat.recommendations.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Recommendations
                    </p>
                    <ul
                      className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground"
                    >
                      {compat.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* ── (e) Chat handoff (G8) + (f) prefetch-to-cache ── */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Use this model
              </p>

              <CapabilityGate
                requires="wasm"
                fallback={
                  <p className="text-xs text-muted-foreground">
                    Running GGUF models requires WebAssembly, which this browser does not
                    support - the chat handoff is unavailable.
                  </p>
                }
              >
                {compat.canRun || tryAnyway ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={handoffHref ?? '#'}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <MessageSquare className="size-4" aria-hidden="true" />
                      Chat with this model
                    </a>
                    {!compat.canRun && tryAnyway && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Compatibility warning overridden - inference may fail or be slow.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      This model is not recommended on this device - see the warnings
                      above. You can still try it.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTryAnyway(true)}
                      className="inline-flex h-8 items-center self-start rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      Try anyway
                    </button>
                  </div>
                )}
              </CapabilityGate>

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  {(prefetch.status === 'idle' || prefetch.status === 'error') && (
                    <button
                      type="button"
                      onClick={startPrefetch}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <CloudDownload className="size-3.5" aria-hidden="true" />
                      Download to cache
                    </button>
                  )}
                  {cached === true && prefetch.status !== 'downloading' && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      Already in the wllama cache - chat opens instantly.
                    </span>
                  )}
                  {prefetch.status === 'downloading' && (
                    <button
                      type="button"
                      onClick={cancelPrefetch}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      Cancel
                    </button>
                  )}
                </div>

                {prefetch.status === 'error' && (
                  <p className="text-xs text-destructive">{prefetch.message}</p>
                )}

                {(prefetch.status === 'downloading' || prefetch.status === 'done') && (
                  <div>
                    <ModelDownloader
                      className="max-w-none"
                      name={
                        prefetch.status === 'downloading' && prefetch.phase === 'mmproj'
                          ? `${target.label} - vision projector (mmproj)`
                          : target.label
                      }
                      size={target.entry?.size ?? formatBytes(meta.fileSize)}
                      contextLength={meta.contextLength || undefined}
                      category={target.entry?.vision ? 'Vision' : meta.architecture}
                      progress={
                        prefetch.status === 'done'
                          ? 1
                          : { loaded: prefetch.loaded, total: prefetch.total }
                      }
                      ready={prefetch.status === 'done'}
                    />
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Optional: downloads the model into wllama&apos;s browser cache so chat
                  starts instantly. Never automatic.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
