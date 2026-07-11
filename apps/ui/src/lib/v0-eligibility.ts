/**
 * @file v0-eligibility.ts
 * @description Which registry components show an "Open in v0" button.
 *
 * v0's "Open in v0" preview auto-mounts the item's primary component with NO
 * props, and its installer does not reliably place shadcn-primitive or
 * cross-primitive dependencies where the component imports them. Opening a
 * component bare in v0 therefore commonly yields one of three broken outcomes,
 * all confirmed by testing the real previews in v0:
 *   - "Module not found" — a shadcn primitive (`@/components/ui/*`) isn't installed;
 *   - "Element type is invalid … got: undefined" — the primary component, or a
 *     composed primitive it renders, resolves to undefined;
 *   - a blank preview — the component needs data (via optional props) to render.
 *
 * A static heuristic (shadcn-free + no-required-props) was tried and REJECTED: v0
 * testing showed it still let through components that crash (e.g. one composing
 * another primitive; one importing `cn` from a dev-tree path) and components that
 * render blank (a canvas with no stream; a dashboard with no metrics). So the
 * button is gated on an EMPIRICAL allowlist — only components whose v0 preview was
 * confirmed to render real UI. Honest by verification, not by proxy.
 *
 * To add a component: open its `/r/<name>.json` in v0
 * (`https://v0.dev/chat/api/open?url=<encoded item URL>`), confirm the preview
 * renders meaningful UI (not blank, no error), then add its name below.
 */

/**
 * Components whose "Open in v0" preview was verified to render real UI
 * (v0 preview tested 2026-07-10). Every entry was opened in v0 and confirmed to
 * mount bare without an error and without rendering blank.
 */
export const V0_VERIFIED: ReadonlySet<string> = new Set<string>([
  'ui/local-first/device-badge', // capability badge
  'ui/audio/mic-selector', // device dropdown + "Allow microphone"
  'ui/audio/voice-orb', // idle voice orb
  'ui/audio/waveform-activity-bars', // idle bars
  'ui/conversation/loader', // animated dots
  'ui/data-documents/format-detection-badge', // "Detecting…" badge
  'ui/local-first/device-capability-grid', // cores/memory/GPU + capability rows
  'ui/local-first/storage-meter', // "0 B / 10.0 GB" meter
  'ui/results/entity-stats-bar', // "0 entities" empty-state bar
]);

/**
 * Whether the named registry component should show an "Open in v0" button.
 * True only for components in {@link V0_VERIFIED}.
 *
 * @param name Registry item name under the `ui/` scheme, e.g. `ui/local-first/device-badge`.
 */
export function isV0Eligible(name: string): boolean {
  return V0_VERIFIED.has(name);
}
