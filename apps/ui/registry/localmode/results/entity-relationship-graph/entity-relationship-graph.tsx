'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** A typed graph node. */
export interface GraphNode {
  /** Unique node id. */
  id: string;
  /** Display label. */
  label: string;
  /** Node type — drives color via the registry (e.g. 'PER', 'LOC'). */
  type?: string;
  /** Optional relative size weight (e.g. mention count). Default 1. */
  weight?: number;
}

/** A relationship-labeled edge between two nodes. */
export interface GraphEdge {
  /** Source node id. */
  source: string;
  /** Target node id. */
  target: string;
  /** Optional relationship label rendered on the edge. */
  label?: string;
  /** Optional edge strength (0–1) — thicker = stronger. Default 0.5. */
  weight?: number;
}

/** Per-type node color config. */
export type NodeTypeRegistry = Record<string, { color: string }>;

/** Props for {@link EntityRelationshipGraph}. */
export interface EntityRelationshipGraphProps {
  /** The typed nodes. */
  nodes: GraphNode[];
  /** The labeled edges. */
  edges: GraphEdge[];
  /**
   * Per-type node colors. Types absent from the registry use a default color.
   * @default the built-in PER/LOC/ORG/MISC registry
   */
  registry?: NodeTypeRegistry;
  /**
   * Canvas height in pixels.
   * @default 420
   */
  height?: number;
  /** Invoked when a node is clicked. */
  onNodeClick?: (node: GraphNode) => void;
  /**
   * Whether to render the SVG/PNG export toolbar.
   * @default true
   */
  showExport?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const DEFAULT_REGISTRY: NodeTypeRegistry = {
  PER: { color: 'var(--color-sky-500, #0ea5e9)' },
  LOC: { color: 'var(--color-emerald-500, #10b981)' },
  ORG: { color: 'var(--color-violet-500, #8b5cf6)' },
  MISC: { color: 'var(--color-amber-500, #f59e0b)' },
};
const FALLBACK_COLOR = 'var(--color-muted-foreground, #6b7280)';

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Run a lightweight force-directed layout entirely in-browser (no d3-force):
 * repulsion between all nodes, spring attraction along edges, and a gentle pull
 * toward the center. Returns the settled positions. Exported for reuse/testing.
 */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  iterations = 300,
): SimNode[] {
  const cx = width / 2;
  const cy = height / 2;
  // Deterministic ring seed so SSR/CSR agree and runs are reproducible.
  const sim: SimNode[] = nodes.map((node, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, nodes.length);
    return {
      ...node,
      x: cx + Math.cos(angle) * Math.min(width, height) * 0.3,
      y: cy + Math.sin(angle) * Math.min(width, height) * 0.3,
      vx: 0,
      vy: 0,
      r: 10 + Math.sqrt(node.weight ?? 1) * 4,
    };
  });
  const index = new Map(sim.map((n) => [n.id, n]));

  const k = Math.sqrt((width * height) / Math.max(1, sim.length)) * 0.6;
  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    // Repulsion.
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i];
        const b = sim[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / dist;
        dx /= dist;
        dy /= dist;
        a.vx += dx * force * 0.001;
        a.vy += dy * force * 0.001;
        b.vx -= dx * force * 0.001;
        b.vy -= dy * force * 0.001;
      }
    }
    // Spring attraction along edges.
    for (const edge of edges) {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = ((dist - k) / dist) * 0.02 * (0.5 + (edge.weight ?? 0.5));
      dx *= force;
      dy *= force;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
    // Center gravity + integrate.
    for (const node of sim) {
      node.vx += (cx - node.x) * 0.001;
      node.vy += (cy - node.y) * 0.001;
      node.x += node.vx * cooling;
      node.y += node.vy * cooling;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x = Math.max(node.r, Math.min(width - node.r, node.x));
      node.y = Math.max(node.r, Math.min(height - node.r, node.y));
    }
  }
  return sim;
}

/** Serialize an SVG element to a downloadable string. */
function serializeSvg(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * An interactive force-directed graph of typed nodes + relationship-labeled
 * edges with drag, zoom, pan, hover, click, and SVG/PNG export — for
 * visualizing VectorDB entity relationships, agent-memory connections, or NER
 * co-occurrences. The layout runs entirely client-side over local data (no
 * network), using a lightweight in-component force simulation (no d3-force).
 *
 * @example
 * ```tsx
 * <EntityRelationshipGraph
 *   nodes={[{ id: 'a', label: 'Ada', type: 'PER' }, { id: 'l', label: 'London', type: 'LOC' }]}
 *   edges={[{ source: 'a', target: 'l', label: 'lived in' }]}
 * />
 * ```
 */
export function EntityRelationshipGraph({
  nodes,
  edges,
  registry = DEFAULT_REGISTRY,
  height = 420,
  onNodeClick,
  showExport = true,
  className,
}: EntityRelationshipGraphProps) {
  const WIDTH = 800;
  const svgRef = useRef<SVGSVGElement>(null);
  const [sim, setSim] = useState<SimNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ id: string | null; panning: boolean; px: number; py: number }>({
    id: null,
    panning: false,
    px: 0,
    py: 0,
  });

  // Recompute layout when the data changes (client-only).
  useEffect(() => {
    setSim(layoutGraph(nodes, edges, WIDTH, height));
  }, [nodes, edges, height]);

  const index = new Map(sim.map((n) => [n.id, n]));

  const toLocal = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = WIDTH / rect.width;
    const sy = height / rect.height;
    return {
      x: ((clientX - rect.left) * sx - view.x) / view.scale,
      y: ((clientY - rect.top) * sy - view.y) / view.scale,
    };
  };

  const onPointerDown = (e: React.PointerEvent, nodeId?: string) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (nodeId) {
      drag.current = { id: nodeId, panning: false, px: e.clientX, py: e.clientY };
    } else {
      drag.current = { id: null, panning: true, px: e.clientX, py: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current.id) {
      const pos = toLocal(e.clientX, e.clientY);
      setSim((prev) =>
        prev.map((n) =>
          n.id === drag.current.id ? { ...n, x: pos.x, y: pos.y } : n,
        ),
      );
    } else if (drag.current.panning) {
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      drag.current.px = e.clientX;
      drag.current.py = e.clientY;
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = rect ? WIDTH / rect.width : 1;
      const sy = rect ? height / rect.height : 1;
      setView((v) => ({ ...v, x: v.x + dx * sx, y: v.y + dy * sy }));
    }
  };

  const onPointerUp = () => {
    drag.current = { id: null, panning: false, px: 0, py: 0 };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({
      ...v,
      scale: Math.min(4, Math.max(0.3, v.scale * factor)),
    }));
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const blob = new Blob([serializeSvg(svgRef.current)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    download(url, 'entity-graph.svg');
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    if (!svgRef.current) return;
    const svgString = serializeSvg(svgRef.current);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = getComputedStyle(svgRef.current!).backgroundColor || '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      download(canvas.toDataURL('image/png'), 'entity-graph.png');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
  };

  const color = (type?: string) =>
    (type && registry[type]?.color) || FALLBACK_COLOR;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
    >
      {showExport && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            type="button"
            onClick={exportSvg}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            SVG
          </button>
          <button
            type="button"
            onClick={exportPng}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            PNG
          </button>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        height={height}
        className="touch-none select-none bg-card"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label="Entity relationship graph"
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* Edges. */}
          {edges.map((edge, i) => {
            const a = index.get(edge.source);
            const b = index.get(edge.target);
            if (!a || !b) return null;
            const active =
              hovered === edge.source || hovered === edge.target;
            return (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-border, #cbd5e1)"
                  strokeWidth={(1 + (edge.weight ?? 0.5) * 3) / (active ? 1 : 1.5)}
                  opacity={hovered && !active ? 0.25 : 0.8}
                />
                {edge.label && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 3}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                    opacity={hovered && !active ? 0.25 : 1}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {/* Nodes. */}
          {sim.map((node) => {
            const dim = hovered != null && hovered !== node.id;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.label} ${node.type}`}
                transform={`translate(${node.x} ${node.y})`}
                className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                opacity={dim ? 0.4 : 1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNodeClick?.(node);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, node.id);
                }}
                onPointerEnter={() => setHovered(node.id)}
                onPointerLeave={() => setHovered(null)}
                onClick={() => onNodeClick?.(node)}
              >
                <circle
                  r={node.r}
                  fill={color(node.type)}
                  stroke="var(--color-card, #fff)"
                  strokeWidth={2}
                />
                <text
                  y={node.r + 11}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-medium"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
