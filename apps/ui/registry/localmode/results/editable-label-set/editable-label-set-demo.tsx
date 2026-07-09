'use client';

import { useState } from 'react';
import { EditableLabelSet } from './editable-label-set';

/**
 * Demo for the EditableLabelSet component, used by the docs live preview.
 * Owns the controlled label list; add via the inline input, remove via the
 * chip's × control. Fully local.
 */
export default function EditableLabelSetDemo() {
  const [labels, setLabels] = useState([
    'technology',
    'business',
    'sports',
  ]);

  return (
    <div className="max-w-md">
      <EditableLabelSet
        labels={labels}
        onAdd={(label) => setLabels((prev) => [...prev, label])}
        onRemove={(_, index) =>
          setLabels((prev) => prev.filter((__, i) => i !== index))
        }
      />
    </div>
  );
}
