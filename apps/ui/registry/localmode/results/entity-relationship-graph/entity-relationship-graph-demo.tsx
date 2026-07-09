'use client';

import { EntityRelationshipGraph } from './entity-relationship-graph';

const NODES = [
  { id: 'ada', label: 'Ada Lovelace', type: 'PER', weight: 3 },
  { id: 'babbage', label: 'Charles Babbage', type: 'PER', weight: 2 },
  { id: 'engine', label: 'Analytical Engine', type: 'MISC', weight: 2 },
  { id: 'london', label: 'London', type: 'LOC' },
  { id: 'society', label: 'Royal Society', type: 'ORG' },
];

const EDGES = [
  { source: 'ada', target: 'babbage', label: 'collaborated' },
  { source: 'babbage', target: 'engine', label: 'designed' },
  { source: 'ada', target: 'engine', label: 'wrote notes on' },
  { source: 'babbage', target: 'society', label: 'member of' },
  { source: 'ada', target: 'london', label: 'lived in' },
];

/**
 * Demo for the EntityRelationshipGraph component, used by the docs live preview.
 * Renders a force-directed graph of sample NER co-occurrences — drag nodes,
 * scroll to zoom, drag the background to pan, export SVG/PNG. Fully local, no
 * network.
 */
export default function EntityRelationshipGraphDemo() {
  return <EntityRelationshipGraph nodes={NODES} edges={EDGES} />;
}
