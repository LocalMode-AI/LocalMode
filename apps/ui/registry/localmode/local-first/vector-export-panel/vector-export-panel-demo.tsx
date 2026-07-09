'use client';

import { useState } from 'react';

import {
  VectorExportPanel,
  type ExportFormat,
  type LastExportSummary,
} from './vector-export-panel';

const FORMATS: ExportFormat[] = [
  {
    id: 'native-json',
    label: 'Native JSON',
    description: 'Full fidelity, re-importable',
    vectors: true,
  },
  {
    id: 'csv',
    label: 'CSV',
    description: 'Spreadsheet-friendly rows',
    vectors: false,
  },
  {
    id: 'jsonl',
    label: 'JSONL',
    description: 'One record per line',
    vectors: false,
  },
];

const BYTES: Record<string, number> = {
  'native-json': 2_842_624,
  csv: 49_664,
  jsonl: 61_440,
};

/**
 * Demo for VectorExportPanel. Fixture-driven with a simulated busy state —
 * activating a format spins its action for a moment, then shows the
 * last-export banner. No network, no model. Wire `onExport` to
 * useImportExport (`exportCSV`, `exportJSONL`) in your app.
 */
export default function VectorExportPanelDemo() {
  const [exporting, setExporting] = useState<string | false>(false);
  const [lastExport, setLastExport] = useState<LastExportSummary | null>(null);

  const handleExport = (formatId: string) => {
    setExporting(formatId);
    setTimeout(() => {
      setExporting(false);
      setLastExport({
        formatId,
        records: 1024,
        bytes: BYTES[formatId] ?? 49_664,
        filename: `vectors.${formatId === 'native-json' ? 'json' : formatId}`,
        at: 'just now',
      });
    }, 1200);
  };

  return (
    <VectorExportPanel
      formats={FORMATS}
      recordCount={1024}
      dimensions={384}
      exporting={exporting}
      lastExport={lastExport}
      onExport={handleExport}
    />
  );
}
