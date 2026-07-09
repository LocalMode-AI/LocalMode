/**
 * @file discovery.ts
 * @description GGUF model discovery for `@localmode/wllama`: anonymous search
 * over GGUF-tagged HuggingFace repos (the "browse 160,000+ models" entry point)
 * and per-repo `.gguf` file listing. No `@huggingface/hub` dependency — two raw
 * `fetch` calls against the public HF REST API.
 *
 * Zero-download-on-load contract: nothing in this module runs at import time;
 * every request is caller-initiated and supports `AbortSignal` so stale
 * searches can be cancelled on keystroke/model switch.
 *
 * Errors are typed via {@link HFApiError} (`rate-limit` | `network` |
 * `not-found`) so the browse surface can render distinct retryable states.
 * Abort rejections are rethrown untouched (never wrapped) so callers can
 * distinguish cancellation from failure.
 *
 * @packageDocumentation
 */

/** Base origin for all HuggingFace API requests. */
const HF_BASE = 'https://huggingface.co';

/** Page size for search requests. */
const SEARCH_LIMIT = 30;

/**
 * Sort orders supported by the HF model search API (always descending —
 * `direction=-1`).
 */
export type HFSort = 'downloads' | 'likes' | 'lastModified';

/** One GGUF repo row returned by {@link searchGGUFModels}. */
export interface HFModelSearchResult {
  /** Full repo id, e.g. `"bartowski/Llama-3.2-1B-Instruct-GGUF"`. */
  repoId: string;
  /** Repo owner (the `author/` prefix of the repo id) when derivable. */
  author?: string;
  /** All-time download count when reported by the API. */
  downloads?: number;
  /** Like count when reported by the API. */
  likes?: number;
  /** ISO timestamp of the last repo modification when reported. */
  lastModified?: string;
  /** Repo tags (pipeline, license, architecture, …) when reported. */
  tags?: string[];
}

/** One `.gguf` file inside a repo, returned by {@link listGGUFFiles}. */
export interface HFModelFile {
  /** File name (repo-relative path), e.g. `"Llama-3.2-1B-Instruct-Q4_K_M.gguf"`. */
  filename: string;
  /** File size in bytes when the API reports it. */
  sizeBytes?: number;
  /** Quantization label parsed from the filename (e.g. `"Q4_K_M"`, `"F16"`, `"IQ2_XS"`). */
  quantLabel?: string;
}

/** Discriminant for {@link HFApiError}: which failure class occurred. */
export type HFApiErrorKind = 'rate-limit' | 'network' | 'not-found';

/**
 * Typed error for HuggingFace API failures.
 *
 * - `rate-limit` — HTTP 429 from the anonymous API; retry after a pause.
 * - `not-found` — HTTP 404 (unknown repo/revision).
 * - `network` — fetch failure, non-OK status, or malformed response body.
 *
 * Abort rejections are NOT converted into `HFApiError` — they propagate as the
 * original `AbortError` so callers can ignore cancelled requests.
 */
export class HFApiError extends Error {
  /** Which failure class occurred. */
  readonly kind: HFApiErrorKind;

  constructor(kind: HFApiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HFApiError';
    this.kind = kind;
  }
}

/** True for fetch-abort rejections (must be rethrown untouched). */
function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

/**
 * Fetch a HuggingFace API URL, mapping HTTP failures to {@link HFApiError}:
 * 429 → `rate-limit`, 404 → `not-found`, anything else non-OK (or a thrown
 * fetch/network failure) → `network`. Abort rejections are rethrown untouched.
 */
async function hfFetch(url: string, abortSignal?: AbortSignal): Promise<Response> {
  abortSignal?.throwIfAborted();

  let res: Response;
  try {
    res = await fetch(url, {
      signal: abortSignal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new HFApiError(
      'network',
      `Could not reach the HuggingFace API (${err instanceof Error ? err.message : String(err)}). Check your connection and retry.`,
      { cause: err },
    );
  }

  if (res.status === 429) {
    throw new HFApiError(
      'rate-limit',
      'HuggingFace API rate limit reached (HTTP 429). Wait a moment and retry.',
    );
  }
  // HF answers 401/403 (not 404) for unknown or private repos when called
  // anonymously, to avoid leaking private-repo existence — treat all three as
  // not-found (verified against the live API, 2026-07-02).
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new HFApiError('not-found', `Not found on HuggingFace (HTTP ${res.status}): ${url}`);
  }
  if (!res.ok) {
    throw new HFApiError(
      'network',
      `HuggingFace API request failed with HTTP ${res.status} ${res.statusText}.`,
    );
  }
  return res;
}

/** Parse a response body as JSON, mapping malformed bodies to a `network` error. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new HFApiError('network', 'HuggingFace API returned a malformed JSON response.', {
      cause: err,
    });
  }
}

/**
 * Extract the pagination cursor from a `Link: <url>; rel="next"` response
 * header. Returns the `cursor` query-param value of the next-page URL when
 * present, else `null` (no further pages).
 */
function parseNextCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const nextPart = linkHeader
    .split(',')
    .find((part) => /rel="next"/i.test(part));
  if (!nextPart) return null;
  const urlMatch = nextPart.match(/<([^>]+)>/);
  if (!urlMatch) return null;
  try {
    return new URL(urlMatch[1]).searchParams.get('cursor');
  } catch {
    return null;
  }
}

/** Narrow an unknown JSON value to a record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Map one raw HF search item to {@link HFModelSearchResult} (null when unusable). */
function toSearchResult(raw: unknown): HFModelSearchResult | null {
  const item = asRecord(raw);
  const repoId =
    typeof item.id === 'string' ? item.id : typeof item.modelId === 'string' ? item.modelId : null;
  if (!repoId) return null;

  // Author from the repoId prefix (the API's list endpoint may omit `author`).
  const prefixAuthor = repoId.includes('/') ? repoId.split('/')[0] : undefined;
  const author = typeof item.author === 'string' ? item.author : prefixAuthor;

  return {
    repoId,
    ...(author ? { author } : {}),
    ...(typeof item.downloads === 'number' ? { downloads: item.downloads } : {}),
    ...(typeof item.likes === 'number' ? { likes: item.likes } : {}),
    ...(typeof item.lastModified === 'string' ? { lastModified: item.lastModified } : {}),
    ...(Array.isArray(item.tags)
      ? { tags: item.tags.filter((t): t is string => typeof t === 'string') }
      : {}),
  };
}

/**
 * Search GGUF-tagged model repos on HuggingFace.
 *
 * Issues `GET https://huggingface.co/api/models?filter=gguf&search=<q>&sort=<sort>&direction=-1&limit=30`.
 * An **empty query omits `search`** — that is the "browse the top models for
 * this sort" entry point (the real 160K+ catalog browse). Pagination uses the
 * response's `Link: <…>; rel="next"` cursor: pass the returned `nextCursor`
 * back as `opts.cursor` (with the same query + sort) to fetch the next page;
 * `nextCursor === null` means the last page.
 *
 * @param opts.query Free-text search; empty string browses top models.
 * @param opts.sort Sort order (always descending).
 * @param opts.cursor Opaque cursor from a previous call's `nextCursor`, or null/omitted for page one.
 * @param opts.abortSignal Cancels the request (rejects with the original `AbortError`).
 * @returns Mapped result rows plus the next-page cursor (null when exhausted).
 * @throws {HFApiError} `rate-limit` on 429, `not-found` on 404, `network` otherwise.
 *
 * @example
 * ```ts
 * const { results, nextCursor } = await searchGGUFModels({ query: 'llama 1b', sort: 'downloads' });
 * ```
 *
 * @see listGGUFFiles for listing a result repo's `.gguf` files.
 */
export async function searchGGUFModels(opts: {
  query: string;
  sort: HFSort;
  cursor?: string | null;
  abortSignal?: AbortSignal;
}): Promise<{ results: HFModelSearchResult[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    filter: 'gguf',
    sort: opts.sort,
    direction: '-1',
    limit: String(SEARCH_LIMIT),
  });
  // The default list payload omits `author` and `lastModified` — request them
  // explicitly (verified against the live API, 2026-07-02).
  for (const field of ['author', 'downloads', 'likes', 'lastModified', 'tags']) {
    params.append('expand[]', field);
  }
  const query = opts.query.trim();
  if (query) params.set('search', query);
  if (opts.cursor) params.set('cursor', opts.cursor);

  const res = await hfFetch(`${HF_BASE}/api/models?${params.toString()}`, opts.abortSignal);
  const body = await readJson(res);
  if (!Array.isArray(body)) {
    throw new HFApiError('network', 'HuggingFace API returned an unexpected search response shape.');
  }

  return {
    results: body
      .map(toSearchResult)
      .filter((r): r is HFModelSearchResult => r !== null),
    nextCursor: parseNextCursor(res.headers.get('Link')),
  };
}

/**
 * Quantization label matcher for GGUF filenames. Matches the common llama.cpp
 * quant naming families at a token boundary (`.`, `-`, `_`, start/end):
 * `Q4_K_M`, `Q8_0`, `Q5_K_S`, `Q2_K`, `Q4_0_4_4`, `IQ2_XS`, `IQ4_NL`,
 * `F16`, `F32`, `BF16`, `FP16`, …
 */
const QUANT_LABEL_RE =
  /(?:^|[.\-_ ])((?:iq|q)\d+(?:_[a-z0-9]+)*|(?:bf|fp|f)(?:16|32))(?=[.\-_ ]|$)/i;

/** Parse the quantization label out of a GGUF filename, if present. */
function parseQuantLabel(filename: string): string | undefined {
  const match = QUANT_LABEL_RE.exec(filename);
  return match ? match[1].toUpperCase() : undefined;
}

/** True when a repo-relative path is a `.gguf` file. */
function isGGUFPath(path: string): boolean {
  return path.toLowerCase().endsWith('.gguf');
}

/** Build an {@link HFModelFile} from a filename + optional byte size. */
function toModelFile(filename: string, size: unknown): HFModelFile {
  const quantLabel = parseQuantLabel(filename);
  return {
    filename,
    ...(typeof size === 'number' ? { sizeBytes: size } : {}),
    ...(quantLabel ? { quantLabel } : {}),
  };
}

/** Encode a `author/name` repo id as a URL path (keeps the `/` separator). */
function encodeRepoPath(repoId: string): string {
  return repoId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * List the `.gguf` files of a HuggingFace repo with byte sizes and parsed
 * quantization labels.
 *
 * Primary source: `GET https://huggingface.co/api/models/<repoId>?blobs=true`,
 * reading `siblings[]` (`rfilename` + `size`). When the response carries no
 * usable `siblings` array (or fails with a plain network error), falls back to
 * `GET https://huggingface.co/api/models/<repoId>/tree/main`. A 404 or 429 on
 * the primary request is authoritative and is NOT retried against the fallback.
 *
 * @param repoId Full repo id, e.g. `"bartowski/Llama-3.2-1B-Instruct-GGUF"`.
 * @param opts.abortSignal Cancels the request (rejects with the original `AbortError`).
 * @returns All `.gguf` files in the repo (possibly empty).
 * @throws {HFApiError} `not-found` for unknown repos, `rate-limit` on 429, `network` otherwise.
 *
 * @example
 * ```ts
 * const files = await listGGUFFiles('bartowski/Llama-3.2-1B-Instruct-GGUF');
 * // → [{ filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', sizeBytes: 807694464, quantLabel: 'Q4_K_M' }, …]
 * ```
 *
 * @see searchGGUFModels for finding repos to list.
 */
export async function listGGUFFiles(
  repoId: string,
  opts?: { abortSignal?: AbortSignal },
): Promise<HFModelFile[]> {
  const abortSignal = opts?.abortSignal;
  const repoPath = encodeRepoPath(repoId);

  // Primary: repo info with blob sizes.
  try {
    const res = await hfFetch(`${HF_BASE}/api/models/${repoPath}?blobs=true`, abortSignal);
    const body = asRecord(await readJson(res));
    if (Array.isArray(body.siblings)) {
      return body.siblings
        .map(asRecord)
        .filter((s) => typeof s.rfilename === 'string' && isGGUFPath(s.rfilename))
        .map((s) => toModelFile(s.rfilename as string, s.size));
    }
    // No siblings in the payload — fall through to the tree listing.
  } catch (err) {
    if (isAbortError(err)) throw err;
    // 404/429 are authoritative for the repo — do not mask them with a fallback.
    if (err instanceof HFApiError && err.kind !== 'network') throw err;
  }

  // Fallback: file tree of the main revision.
  const res = await hfFetch(`${HF_BASE}/api/models/${repoPath}/tree/main`, abortSignal);
  const body = await readJson(res);
  if (!Array.isArray(body)) {
    throw new HFApiError('network', 'HuggingFace API returned an unexpected tree response shape.');
  }
  return body
    .map(asRecord)
    .filter(
      (entry) =>
        (entry.type === 'file' || entry.type == null) &&
        typeof entry.path === 'string' &&
        isGGUFPath(entry.path),
    )
    .map((entry) => toModelFile(entry.path as string, entry.size));
}

/**
 * @internal Test-only surface for the pure, side-effect-free helpers above.
 *
 * These functions are module-private (they are NOT re-exported from
 * `index.ts`, so they are not part of the package's public API). They are
 * exposed here solely so the pure-helper unit suite can exercise them directly
 * without an HTTP round-trip — the fetch/error-mapping behaviour is covered
 * separately against a real local HTTP server fixture. Do not import this from
 * application code.
 */
export const __discoveryInternals = {
  parseQuantLabel,
  parseNextCursor,
  toSearchResult,
  toModelFile,
  isGGUFPath,
  encodeRepoPath,
  isAbortError,
  asRecord,
  /**
   * The HTTP + error-mapping seam. Exposed so the error-mapping suite can
   * exercise the real fetch/status-mapping code against a real local HTTP
   * server (`searchGGUFModels`/`listGGUFFiles` pass their thrown errors
   * straight through — this IS the error a public-API caller receives), rather
   * than stubbing `fetch`.
   */
  hfFetch,
  readJson,
};
