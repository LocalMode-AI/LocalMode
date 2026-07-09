'use client';

import { CopyButton } from './copy-button';

/**
 * Demo for CopyButton, used by the docs live preview. Click to copy — the label
 * flips to "Copied" for two seconds. The empty-value button stays disabled.
 */
export default function CopyButtonDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CopyButton value="npx shadcn add @localmode/ui/input-controls/copy-button" />
      <CopyButton value="" />
    </div>
  );
}
