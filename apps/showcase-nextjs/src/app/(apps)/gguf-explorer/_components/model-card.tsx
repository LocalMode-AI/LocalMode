/**
 * @file model-card.tsx
 * @description Inspect tab: displays parsed GGUF metadata and browser compatibility results
 */
'use client';

import {
  Cpu,
  Layers,
  Ruler,
  Hash,
  BookOpen,
  User,
  Scale,
  FileText,
  HardDrive,
  Shield,
  Zap,
  Gauge,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Server,
} from 'lucide-react';
import { Spinner, Badge } from './ui';
import { cn, formatParams, formatBytes, formatNumber, getCompatColor, getCompatTextColor } from '../_lib/utils';
import type { InspectionResult } from '../_lib/types';
import type { GGUFMetadata, GGUFBrowserCompat } from '../_services/gguf.service';

/** Props for the ModelCard component */
interface ModelCardProps {
  /** Inspection result containing metadata and compat */
  result: InspectionResult | null;
  /** Whether inspection is in progress */
  isLoading: boolean;
}

/** Metadata field row */
function MetaField({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 py-2', className)}>
      <span className="text-poster-text-sub/50 shrink-0">{icon}</span>
      <span className="text-xs text-poster-text-sub w-28 shrink-0">{label}</span>
      <span className="text-sm text-poster-text-main font-medium">{value}</span>
    </div>
  );
}

/** Optional metadata field — only rendered if value exists */
function OptionalMetaField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return <MetaField icon={icon} label={label} value={value} />;
}

/** GGUF metadata card */
function MetadataSection({ metadata }: { metadata: GGUFMetadata }) {
  return (
    <div className="card bg-poster-surface/40 border border-poster-border/20">
      <div className="card-body p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-poster-primary" />
          <h3 className="text-sm font-semibold text-poster-text-main">Model Metadata</h3>
        </div>

        {/* Optional header fields */}
        {metadata.modelName && (
          <h2 className="text-lg font-bold text-poster-text-main mb-1">{metadata.modelName}</h2>
        )}
        {metadata.description && (
          <p className="text-xs text-poster-text-sub mb-3 leading-relaxed">{metadata.description}</p>
        )}

        <div className="divide-y divide-poster-border/10">
          <MetaField icon={<Cpu className="w-3.5 h-3.5" />} label="Architecture" value={metadata.architecture} />
          <MetaField icon={<Layers className="w-3.5 h-3.5" />} label="Parameters" value={formatParams(metadata.parameterCount)} />
          <MetaField icon={<Zap className="w-3.5 h-3.5" />} label="Quantization" value={metadata.quantization} />
          <MetaField icon={<Ruler className="w-3.5 h-3.5" />} label="Context Length" value={formatNumber(metadata.contextLength)} />
          <MetaField icon={<Hash className="w-3.5 h-3.5" />} label="Embedding Dim" value={formatNumber(metadata.embeddingLength)} />
          <MetaField icon={<BookOpen className="w-3.5 h-3.5" />} label="Vocab Size" value={formatNumber(metadata.vocabSize)} />
          <MetaField icon={<Layers className="w-3.5 h-3.5" />} label="Heads" value={formatNumber(metadata.headCount)} />
          <MetaField icon={<Layers className="w-3.5 h-3.5" />} label="Layers" value={formatNumber(metadata.layerCount)} />
          <MetaField icon={<HardDrive className="w-3.5 h-3.5" />} label="File Size" value={formatBytes(metadata.fileSize)} />
          <OptionalMetaField icon={<User className="w-3.5 h-3.5" />} label="Author" value={metadata.author} />
          <OptionalMetaField icon={<Scale className="w-3.5 h-3.5" />} label="License" value={metadata.license} />
        </div>
      </div>
    </div>
  );
}

/** RAM usage bar visualization */
function RAMBar({ compat }: { compat: GGUFBrowserCompat }) {
  // Calculate fill percentage (capped at 100)
  let fillPercent = 100;
  if (compat.deviceRAM !== null && compat.deviceRAM > 0) {
    fillPercent = Math.min(100, (compat.estimatedRAM / compat.deviceRAM) * 100);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-poster-text-sub">RAM Usage</span>
        <span className="text-poster-text-main font-medium">
          {compat.estimatedRAMHuman} / {compat.deviceRAMHuman}
        </span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-poster-surface border border-poster-border/20">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
            compat.canRun
              ? 'bg-gradient-to-r from-success/70 to-success'
              : 'bg-gradient-to-r from-error/70 to-error'
          )}
          style={{ width: `${Math.max(fillPercent, 3)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-poster-text-sub/50">
        <span>0%</span>
        <span>Device RAM</span>
      </div>
    </div>
  );
}

/** Browser compatibility section */
function CompatSection({ compat }: { compat: GGUFBrowserCompat }) {
  return (
    <div className="card bg-poster-surface/40 border border-poster-border/20">
      <div className="card-body p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-poster-primary" />
            <h3 className="text-sm font-semibold text-poster-text-main">Browser Compatibility</h3>
          </div>
          <Badge
            variant={compat.canRun ? 'success' : 'error'}
            size="lg"
            className="gap-1.5 font-semibold"
          >
            {compat.canRun ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Compatible
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                Not Recommended
              </>
            )}
          </Badge>
        </div>

        {/* RAM bar */}
        <RAMBar compat={compat} />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {/* Storage */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-poster-surface/60 border border-poster-border/10">
            <HardDrive className="w-4 h-4 text-poster-text-sub/50" />
            <div>
              <p className="text-[10px] text-poster-text-sub">Available Storage</p>
              <p className="text-xs font-medium text-poster-text-main">{compat.availableStorageHuman}</p>
            </div>
          </div>

          {/* CORS / Threading */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-poster-surface/60 border border-poster-border/10">
            <Server className="w-4 h-4 text-poster-text-sub/50" />
            <div>
              <p className="text-[10px] text-poster-text-sub">Threading</p>
              <p className={cn('text-xs font-medium', compat.hasCORS ? 'text-success' : 'text-warning')}>
                {compat.hasCORS ? 'Multi-threaded' : 'Single-threaded'}
              </p>
            </div>
          </div>

          {/* Speed estimate */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-poster-surface/60 border border-poster-border/10 col-span-2">
            <Gauge className="w-4 h-4 text-poster-text-sub/50" />
            <div>
              <p className="text-[10px] text-poster-text-sub">Estimated Speed</p>
              <p className="text-xs font-medium text-poster-text-main">{compat.estimatedSpeed}</p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {compat.warnings.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {compat.warnings.map((warning: string, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-poster-text-sub leading-relaxed">{warning}</p>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {compat.recommendations.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {compat.recommendations.map((rec: string, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-info/5 border border-info/20">
                <Info className="w-3.5 h-3.5 text-info shrink-0 mt-0.5" />
                <p className="text-xs text-poster-text-sub leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Model card: metadata + compatibility for the Inspect tab */
export function ModelCard({ result, isLoading }: ModelCardProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fadeIn">
        <Spinner size="lg" className="text-poster-primary" />
        <div className="text-center">
          <p className="text-sm font-medium text-poster-text-main">Inspecting model...</p>
          <p className="text-xs text-poster-text-sub mt-1">Reading GGUF header via Range requests (~4KB)</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fadeIn">
        <Cpu className="w-10 h-10 text-poster-text-sub/20" />
        <p className="text-sm text-poster-text-sub">Select a model from the Browse tab to inspect it</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      <MetadataSection metadata={result.metadata} />
      <CompatSection compat={result.compat} />
    </div>
  );
}
