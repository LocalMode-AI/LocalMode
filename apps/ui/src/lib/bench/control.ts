/**
 * Control runs on /bench/run: a control experiment for the methodology that
 * runs the same suite as a protocol run in the runtime execution order its
 * kind names. `order-reversed` reverses the protocol order, so a lane's
 * position in the suite can be told apart from the lane itself;
 * `fixed-order` keeps the protocol order, a same-build, same-day reference
 * series so an order-reversed series can be compared within one browser
 * build; `wasm-default` keeps the protocol order and runs the
 * Transformers.js WASM lane at the runtime's own defaults (dtype q8, ONNX
 * Runtime's WASM thread count set to every logical core); `wasm-q8` and
 * `wasm-threads` keep the protocol order and make one of those two changes
 * each (q8 with the runtime's own thread count; the protocol's q4 files on
 * every logical core); `wllama-compat` keeps the protocol order and every
 * lane's protocol configuration, but loads both llama.cpp lanes through
 * wllama's compatibility build (32-bit memory, no JSPI) instead of the
 * memory64 build, in every browser. A control run is opted into only by the `?control=<kind>` query
 * parameter (no other control on the page turns it on), is marked
 * `harness.control` in its run file, is never uploaded (Export JSON only),
 * and is refused on a paid-study link. Everything in this module is pure.
 */
import {
  CONTROL_KINDS,
  CONTROL_WASM_LANE_SPECS,
  CONTROL_WASM_MAX_THREADS,
  createHarnessControl,
  isControlRun,
  type ControlKind,
  type HarnessControl,
} from '@localmode/bench';
import type { BenchAdapterOptions } from './adapters';

/** The query parameter that opts a page into a control run. */
export const CONTROL_QUERY_PARAM = 'control';

/** What the query string asks for. */
export type ControlRequest =
  | { status: 'none' }
  | { status: 'control'; kind: ControlKind }
  | { status: 'refused'; message: string };

/** Banner text per control kind, shown on the page for as long as control mode is on. */
const BANNER_TEXT: Record<ControlKind, string> = {
  'order-reversed': 'Control run: reversed runtime order; not published to the leaderboard',
  'fixed-order': 'Control run: protocol runtime order; not published to the leaderboard',
  'wasm-default': 'Control run: Transformers.js WASM lane at runtime defaults (q8, all cores); not published to the leaderboard',
  'wasm-q8': 'Control run: Transformers.js WASM lane at q8, runtime thread default; not published to the leaderboard',
  'wasm-threads': 'Control run: Transformers.js WASM lane at q4 on all cores; not published to the leaderboard',
  'wllama-compat': 'Control run: llama.cpp lanes on the wllama compatibility build; not published to the leaderboard',
};

/** Message for a paid-study link that also carries the control parameter. */
export const CONTROL_STUDY_REFUSAL =
  'A paid-study link cannot start a control run: a control run is never uploaded, so it cannot earn a completion code. Open the study link without the control parameter, or open /bench/run?control=order-reversed without the study parameters.';

/** Why a control run is never uploaded (shown where the upload would be). */
export const CONTROL_UPLOAD_REFUSAL =
  'This is a control run: it is never uploaded or published. Keep it with Export JSON.';

/**
 * Read the control request from a /bench/run query string.
 *
 * - No `control` parameter: `none`, a protocol run.
 * - A known kind (`order-reversed`, `fixed-order`, `wasm-default`, `wasm-q8`, `wasm-threads`, `wllama-compat`): `control`, unless the query is a
 *   paid-study link (`PROLIFIC_PID` or `cc` present), which is `refused`.
 * - Any other value: `refused`, so a mistyped kind never quietly runs (and
 *   publishes) a protocol run.
 *
 * @param search - The query string, with or without the leading `?`.
 * @returns The request.
 * @example
 * parseControlRequest('?control=order-reversed'); // { status: 'control', kind: 'order-reversed' }
 */
export function parseControlRequest(search: string): ControlRequest {
  const params = new URLSearchParams(search);
  if (!params.has(CONTROL_QUERY_PARAM)) return { status: 'none' };
  const value = (params.get(CONTROL_QUERY_PARAM) ?? '').trim();
  if (!CONTROL_KINDS.includes(value as ControlKind)) {
    return {
      status: 'refused',
      message: `Unknown control run kind "${value}"; the supported kinds are ${CONTROL_KINDS.join(', ')}. Remove the control parameter for a protocol run.`,
    };
  }
  if (params.has('PROLIFIC_PID') || params.has('cc')) return { status: 'refused', message: CONTROL_STUDY_REFUSAL };
  return { status: 'control', kind: value as ControlKind };
}

/**
 * The control kind a page runs in. An open series keeps the kind it started
 * with (a resumed series stays in, or out of, control mode whatever the URL
 * says); otherwise the URL's request decides.
 *
 * @param request - The URL's control request.
 * @param openSeriesControl - The stored open series' kind, `null` for a protocol series, `undefined` without an open series.
 * @returns The kind, or null for a protocol run.
 */
export function effectiveControlKind(
  request: ControlRequest,
  openSeriesControl: ControlKind | null | undefined,
): ControlKind | null {
  if (openSeriesControl !== undefined) return openSeriesControl;
  return request.status === 'control' ? request.kind : null;
}

/**
 * Banner text for a control kind.
 *
 * @param kind - The control kind.
 * @returns e.g. "Control run: reversed runtime order; not published to the leaderboard".
 */
export function controlBannerText(kind: ControlKind): string {
  return BANNER_TEXT[kind];
}

/**
 * The ONNX Runtime WASM thread count a `wasm-default` or `wasm-threads` control run sets for
 * the Transformers.js WASM lane: every logical processor the browser reports
 * (`navigator.hardwareConcurrency`), at least 1 and at most
 * `CONTROL_WASM_MAX_THREADS`.
 *
 * @param hardwareConcurrency - The browser's `navigator.hardwareConcurrency`.
 * @returns The thread count.
 * @example
 * wasmDefaultThreads(navigator.hardwareConcurrency); // 12 on a 12-thread CPU
 */
export function wasmDefaultThreads(hardwareConcurrency: number | undefined): number {
  const n = typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency) ? Math.floor(hardwareConcurrency) : 1;
  return Math.min(CONTROL_WASM_MAX_THREADS, Math.max(1, n));
}

/**
 * The `harness.control` record a control run of this kind carries.
 *
 * @param kind - The control kind.
 * @param hardwareConcurrency - The browser's `navigator.hardwareConcurrency`; used only by the kinds that set the WASM lane's thread count (`wasm-default`, `wasm-threads`).
 * @returns `{ kind, runtimeOrder }` (plus `wasmLane` for `wasm-default`, `wasm-q8` and `wasm-threads`, and
 *   `wllamaBuild` for `wllama-compat`); the runner executes exactly this order, and the adapters apply
 *   `wasmLane` and `wllamaBuild` (see `controlAdapterOptions`).
 */
export function controlHarness(kind: ControlKind, hardwareConcurrency?: number): HarnessControl {
  return CONTROL_WASM_LANE_SPECS[kind]?.threads === 'all-cores'
    ? createHarnessControl(kind, { numThreads: wasmDefaultThreads(hardwareConcurrency) })
    : createHarnessControl(kind);
}

/**
 * What a control run changes in the runtime adapters, from its
 * `harness.control` record: the Transformers.js WASM lane's settings
 * (`wasmLane`, on the WASM-lane kinds) and the wllama build of the llama.cpp
 * lanes (`wllamaBuild`, on `wllama-compat`). Empty on a protocol run and on
 * the order kinds, so the adapters run at the protocol's configuration.
 *
 * @param control - The run's control record, or undefined on a protocol run.
 * @returns The options for `createLLMAdapters` / `createEmbedAdapters`.
 * @example
 * controlAdapterOptions(controlHarness('wllama-compat')); // { wllamaBuild: 'compat' }
 */
export function controlAdapterOptions(control: HarnessControl | undefined): BenchAdapterOptions {
  if (!control) return {};
  return {
    ...(control.wasmLane ? { wasmLane: control.wasmLane } : {}),
    ...(control.wllamaBuild ? { wllamaBuild: control.wllamaBuild } : {}),
  };
}

/**
 * Whether a run may be uploaded from the page: never for a control run.
 *
 * @param run - The finished run.
 * @returns False for a run carrying `harness.control`.
 */
export function mayUpload(run: unknown): boolean {
  return !isControlRun(run);
}
