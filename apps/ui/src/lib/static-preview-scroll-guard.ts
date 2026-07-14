/**
 * @file static-preview-scroll-guard.ts
 * @description Presentational component previews must never scroll the page.
 * Some demos call Element.scrollIntoView() on mount (e.g. a cmdk list scrolling
 * its selected item into view), which scrolls the window to a preview below the
 * fold — visible as the page jumping down a bit on load. This module neutralizes
 * scrollIntoView for elements inside a registered static-preview root, a targeted
 * and timing-independent guard shared by every static-preview surface (the
 * components-browser grid and the homepage live collage). Roots are tracked
 * client-side via a Set of elements (not a DOM attribute) so it is hydration-safe,
 * and the prototype is patched exactly once so a single root registry is consulted
 * regardless of which surface mounts first (two Sets would leave the live patch
 * blind to whichever module patched second).
 */

const staticPreviewRoots = new Set<Element>();

if (typeof Element !== 'undefined') {
  const proto = Element.prototype as Element & { __lmStaticPreviewPatched?: boolean };
  if (!proto.__lmStaticPreviewPatched) {
    proto.__lmStaticPreviewPatched = true;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      for (const root of staticPreviewRoots) if (root.contains(this)) return;
      return (original as (...a: unknown[]) => void).apply(this, args);
    };
  }
}

/**
 * Register `root` as a static-preview root: any scrollIntoView() called on a
 * descendant of it becomes a no-op while it stays registered. Returns a cleanup
 * function that unregisters it — call it from a React effect's cleanup.
 *
 * @param root - The preview container element whose subtree must not scroll the page.
 * @returns An unregister function.
 */
export function registerStaticPreviewRoot(root: Element): () => void {
  staticPreviewRoots.add(root);
  return () => {
    staticPreviewRoots.delete(root);
  };
}
