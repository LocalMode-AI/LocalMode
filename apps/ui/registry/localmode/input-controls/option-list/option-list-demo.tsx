'use client';

import { useState } from 'react';
import { OptionList, type Option } from './option-list';

const OPTIONS: Option[] = [
  { id: 'report.pdf', label: 'report.pdf', description: 'Q4 financial report' },
  { id: 'report-draft.pdf', label: 'report-draft.pdf', description: 'Working draft' },
  { id: 'report-2023.pdf', label: 'report-2023.pdf', description: 'Last year' },
  { id: 'summary.md', label: 'summary.md', description: 'Executive summary' },
  { id: 'notes.txt', label: 'notes.txt', description: 'Meeting notes' },
  { id: 'budget.xlsx', label: 'budget.xlsx', description: 'Spreadsheet' },
  { id: 'roadmap.md', label: 'roadmap.md', description: 'Product roadmap' },
  { id: 'changelog.md', label: 'changelog.md', description: 'Release history' },
];

/**
 * Demo for OptionList, used by the docs live preview. Presents 8 disambiguation
 * choices (paginating past the 6-per-page limit); selecting one is what you
 * would feed back into a `useAgent` inquiry loop. Pure UI — no model download.
 */
export default function OptionListDemo() {
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <OptionList
        prompt="Which file did you mean?"
        options={OPTIONS}
        selectedId={chosen ?? undefined}
        onSelect={(opt) => setChosen(opt.id)}
      />
      {chosen && (
        <p className="text-xs text-muted-foreground">
          Sent to agent: <span className="font-mono">{chosen}</span>
        </p>
      )}
    </div>
  );
}
