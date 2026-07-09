'use client';

/**
 * @file structured-output-viewer-demo.tsx
 * @description Docs preview for `StructuredOutputViewer`. Shows a generated
 * object with JSON + schema-tree tabs and an inference-stats footer.
 */
import { StructuredOutputViewer } from './structured-output-viewer';

const OBJECT = {
  invoice: {
    number: 'INV-2042',
    date: '2026-05-31',
    total: 1280.5,
    currency: 'USD',
    lineItems: [
      { description: 'Pro plan (annual)', amount: 1200 },
      { description: 'Support add-on', amount: 80.5 },
    ],
    paid: false,
  },
};

export default function StructuredOutputViewerDemo() {
  return (
    <div className="w-full max-w-xl">
      <StructuredOutputViewer
        object={OBJECT}
        usage={{ totalTokens: 312 }}
        durationMs={1840}
        attempts={1}
      />
    </div>
  );
}
