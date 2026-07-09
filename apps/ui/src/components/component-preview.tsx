/**
 * @file component-preview.tsx
 * @description Server wrapper for a registry component preview. Resolves the
 * demo's source file from the item name and reads it at build time (via the
 * shared `@/lib/registry-source` reader, also used by the markdown pipeline),
 * then hands it to the interactive {@link ComponentPreviewClient} so the Code
 * tab shows the exact installed demo source with no MDX duplication and no drift.
 */
import { ComponentPreviewClient } from '@/components/component-preview-client';
import { readDemoSource } from '@/lib/registry-source';

/** Props for {@link ComponentPreview}. */
interface ComponentPreviewProps {
  /** Registry item name under the ui/ scheme, e.g. `ui/device-badge`. */
  name: string;
  /**
   * Gate the demo behind a "Run preview" click. Use ONLY for demos that load a
   * model (or other heavy asset) on MOUNT. Default: false — auto-renders.
   */
  gated?: boolean;
  /** Optional note shown in the gated placeholder (e.g. model size / what runs). */
  note?: string;
  /** Optional minimum height / extra classes for the preview surface. */
  className?: string;
}

/** Live preview surface (Preview/Code tabs + theme switcher; optional Run-gate). */
export function ComponentPreview({ name, gated, note, className }: ComponentPreviewProps) {
  const source = readDemoSource(name);
  return (
    <ComponentPreviewClient
      name={name}
      source={source}
      gated={gated}
      note={note}
      className={className}
    />
  );
}
