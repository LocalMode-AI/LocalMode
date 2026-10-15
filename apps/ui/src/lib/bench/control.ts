/**
 * Control runs on /bench/run: a control experiment for the methodology that
 * runs the same suite as a protocol run with a different runtime execution
 * order, so a lane's position in the suite can be told apart from the lane
 * itself. A control run is opted into only by the `?control=<kind>` query
 * parameter (no other control on the page turns it on), is marked
 * `harness.control` in its run file, is never uploaded (Export JSON only),
 * and is refused on a paid-study link. Everything in this module is pure.
 */
import { CONTROL_KINDS, createHarnessControl, isControlRun, type ControlKind, type HarnessControl } from '@localmode/bench';

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
 * - A known kind (`order-reversed`): `control`, unless the query is a
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
      message: `Unknown control run kind "${value}"; the supported kind is ${CONTROL_KINDS.join(', ')}. Remove the control parameter for a protocol run.`,
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
 * The `harness.control` record a control run of this kind carries.
 *
 * @param kind - The control kind.
 * @returns `{ kind, runtimeOrder }`; the runner executes exactly this order.
 */
export function controlHarness(kind: ControlKind): HarnessControl {
  return createHarnessControl(kind);
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
