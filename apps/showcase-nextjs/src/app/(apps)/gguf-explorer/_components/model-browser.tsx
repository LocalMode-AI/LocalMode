/**
 * @file model-browser.tsx
 * @description Browse tab: curated WLLAMA_MODELS catalog grouped by size, plus custom URL input
 */
'use client';

import { useState } from 'react';
import {
  Search,
  ExternalLink,
  Cpu,
  HardDrive,
  Layers,
  Sparkles,
  Zap,
  FileText,
} from 'lucide-react';
import { Button, Input } from './ui';
import { cn, formatParams, formatBytes } from '../_lib/utils';
import { SIZE_CATEGORY_LABELS, SAMPLE_URLS } from '../_lib/constants';
import { WLLAMA_MODELS, getModelCategory } from '../_services/gguf.service';
import type { WllamaModelEntry } from '../_services/gguf.service';

/** Props for the ModelBrowser component */
interface ModelBrowserProps {
  /** Callback when a curated model is selected */
  onSelectCurated: (entry: WllamaModelEntry) => void;
  /** Callback when a custom URL is submitted */
  onSelectCustomUrl: (url: string) => void;
}

/** Group models by size category */
function groupModels() {
  const groups: Record<'tiny' | 'small' | 'medium' | 'large', Array<{ id: string; entry: WllamaModelEntry }>> = {
    tiny: [],
    small: [],
    medium: [],
    large: [],
  };

  for (const [id, rawEntry] of Object.entries(WLLAMA_MODELS)) {
    const entry = rawEntry as WllamaModelEntry;
    const category = getModelCategory(entry.sizeBytes);
    groups[category].push({ id, entry });
  }

  return groups;
}

/** Single model card in the catalog */
function ModelCatalogCard({
  entry,
  onClick,
}: {
  entry: WllamaModelEntry;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-xl border border-poster-border/20 bg-poster-surface/40',
        'hover:bg-poster-surface/80 hover:border-poster-primary/30 hover:shadow-lg hover:shadow-black/10',
        'transition-all duration-200 text-left cursor-pointer group'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-poster-text-main group-hover:text-poster-primary transition-colors">
          {entry.name}
        </h3>
        <span className="badge badge-sm badge-ghost text-poster-text-sub shrink-0">{entry.size}</span>
      </div>

      <p className="text-xs text-poster-text-sub leading-relaxed">{entry.description}</p>

      <div className="flex flex-wrap items-center gap-2 mt-1">
        <span className="inline-flex items-center gap-1 text-xs text-poster-text-sub/70">
          <Cpu className="w-3 h-3" />
          {entry.architecture}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-poster-text-sub/70">
          <Layers className="w-3 h-3" />
          {formatParams(entry.parameterCount)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-poster-text-sub/70">
          <Zap className="w-3 h-3" />
          {entry.quantization}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-poster-text-sub/70">
          <FileText className="w-3 h-3" />
          {entry.contextLength.toLocaleString()} ctx
        </span>
      </div>
    </button>
  );
}

/** Category section header */
function CategoryHeader({ category }: { category: 'tiny' | 'small' | 'medium' | 'large' }) {
  const info = SIZE_CATEGORY_LABELS[category];
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={cn('w-2 h-2 rounded-full', info.bgColor.replace('/10', ''))} />
      <h2 className={cn('text-sm font-semibold', info.color)}>{info.title}</h2>
      <span className="text-xs text-poster-text-sub/50">{info.subtitle}</span>
    </div>
  );
}

/** Browse tab content: catalog + URL input */
export function ModelBrowser({ onSelectCurated, onSelectCustomUrl }: ModelBrowserProps) {
  const [customUrl, setCustomUrl] = useState('');
  const groups = groupModels();

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      onSelectCustomUrl(customUrl.trim());
      setCustomUrl('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (customUrl.trim()) {
        onSelectCustomUrl(customUrl.trim());
        setCustomUrl('');
      }
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Custom URL input */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-poster-primary" />
          <h2 className="text-sm font-semibold text-poster-text-main">Custom GGUF URL</h2>
        </div>
        <p className="text-xs text-poster-text-sub leading-relaxed">
          Paste a HuggingFace GGUF URL or shorthand (e.g., <code className="text-poster-primary/80">{SAMPLE_URLS[0]}</code>)
        </p>
        <form onSubmit={handleCustomSubmit} className="flex gap-2">
          <Input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://huggingface.co/.../model.gguf or repo/name:file.gguf"
            className="flex-1 input-sm"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!customUrl.trim()}
            className="cursor-pointer"
          >
            <Search className="w-4 h-4 mr-1" />
            Inspect
          </Button>
        </form>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-poster-border/20" />
        <span className="text-xs text-poster-text-sub/50 font-medium">or pick from the curated catalog</span>
        <div className="flex-1 h-px bg-poster-border/20" />
      </div>

      {/* Curated catalog by category */}
      {(['tiny', 'small', 'medium', 'large'] as const).map((category) => {
        const models = groups[category];
        if (models.length === 0) return null;

        return (
          <div key={category}>
            <CategoryHeader category={category} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {models.map(({ id, entry }) => (
                <ModelCatalogCard
                  key={id}
                  entry={entry}
                  onClick={() => onSelectCurated(entry)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-2 py-4">
        <Sparkles className="w-3.5 h-3.5 text-poster-text-sub/30" />
        <span className="text-xs text-poster-text-sub/40">
          135,000+ GGUF models available on HuggingFace
        </span>
      </div>
    </div>
  );
}
