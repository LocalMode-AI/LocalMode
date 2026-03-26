/**
 * @file advisor-view.tsx
 * @description Main view component for the model advisor application.
 * Displays device capabilities, task-based model recommendations, adaptive batch size,
 * side-by-side model comparison, and custom model registration.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Cpu,
  Monitor,
  HardDrive,
  Zap,
  Plus,
  X,
  ChevronDown,
  ArrowLeftRight,
  Layers,
  Info,
  Globe,
  MemoryStick,
} from 'lucide-react';
import { Button, IconBox, Spinner, Badge, StatusDot } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useAdvisor } from '../_hooks/use-advisor';
import { cn, formatBytes, formatSizeMB, tierColor, deviceBadgeColor, taskLabel } from '../_lib/utils';
import { TASK_GROUPS, APP_TITLE, APP_SUBTITLE } from '../_lib/constants';
import type { ComparisonPair, CustomModelFormData, TaskCategory } from '../_lib/types';
import type { DeviceCapabilities } from '@localmode/core';

// ============================================================================
// Device Profile Card
// ============================================================================

/** Display detected device capabilities */
function DeviceProfileCard({
  capabilities,
  isLoading,
}: {
  capabilities: Record<string, unknown> | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="card bg-poster-surface/50 border border-poster-border/30 shadow-lg">
        <div className="card-body flex items-center justify-center min-h-[200px]">
          <Spinner size="lg" className="text-poster-accent-teal" />
          <p className="text-sm text-poster-text-sub mt-3">Detecting device capabilities...</p>
        </div>
      </div>
    );
  }

  if (!capabilities) {
    return (
      <div className="card bg-poster-surface/50 border border-poster-border/30 shadow-lg">
        <div className="card-body text-center">
          <p className="text-sm text-poster-text-sub">No capabilities detected yet.</p>
        </div>
      </div>
    );
  }

  // Cast to DeviceCapabilities -- the underlying data is always this shape
  const caps = capabilities as unknown as DeviceCapabilities;

  return (
    <div className="card bg-poster-surface/50 border border-poster-border/30 shadow-lg">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-poster-accent-teal" />
          <h2 className="card-title text-base text-poster-text-main">Device Profile</h2>
          <Badge variant="ghost" size="sm" className="ml-auto">
            {caps.device.type}
          </Badge>
        </div>

        {/* Key hardware stats */}
        <div className="stats stats-vertical lg:stats-horizontal bg-poster-surface border border-poster-border/20 shadow-sm w-full">
          <div className="stat py-3 px-4">
            <div className="stat-title text-poster-text-sub text-xs">CPU Cores</div>
            <div className="stat-value text-poster-accent-teal text-xl">{caps.hardware.cores}</div>
          </div>
          <div className="stat py-3 px-4">
            <div className="stat-title text-poster-text-sub text-xs">Memory</div>
            <div className="stat-value text-poster-accent-teal text-xl">
              {caps.hardware.memory ? `${caps.hardware.memory} GB` : 'Unknown'}
            </div>
          </div>
          <div className="stat py-3 px-4">
            <div className="stat-title text-poster-text-sub text-xs">GPU</div>
            <div className="stat-value text-poster-accent-teal text-sm truncate max-w-[120px]" title={caps.hardware.gpu ?? 'Not detected'}>
              {caps.hardware.gpu ? caps.hardware.gpu.split(' ').slice(0, 2).join(' ') : 'None'}
            </div>
          </div>
        </div>

        {/* Feature flags */}
        <div>
          <h3 className="text-xs font-medium text-poster-text-sub mb-2 uppercase tracking-wider">Features</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <FeatureFlag label="WebGPU" supported={caps.features.webgpu} />
            <FeatureFlag label="WASM" supported={caps.features.wasm} />
            <FeatureFlag label="SIMD" supported={caps.features.simd} />
            <FeatureFlag label="Threads" supported={caps.features.threads} />
            <FeatureFlag label="IndexedDB" supported={caps.features.indexeddb} />
            <FeatureFlag label="Web Workers" supported={caps.features.webworkers} />
          </div>
        </div>

        {/* Storage */}
        <div>
          <h3 className="text-xs font-medium text-poster-text-sub mb-2 uppercase tracking-wider">Storage</h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-poster-text-sub">
              Quota: <span className="text-poster-text-main font-medium">{formatBytes(caps.storage.quotaBytes)}</span>
            </span>
            <span className="text-poster-text-sub">
              Available: <span className="text-poster-text-main font-medium">{formatBytes(caps.storage.availableBytes)}</span>
            </span>
          </div>
        </div>

        {/* Browser info */}
        <div className="flex items-center gap-2 text-xs text-poster-text-sub">
          <Globe className="w-3.5 h-3.5" />
          <span>{caps.browser.name} {caps.browser.version}</span>
          <span className="text-poster-border mx-1">&middot;</span>
          <span>{caps.device.os} {caps.device.osVersion}</span>
        </div>
      </div>
    </div>
  );
}

/** Single feature flag indicator */
function FeatureFlag({ label, supported }: { label: string; supported: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusDot color={supported ? 'teal' : 'error'} pulse={false} />
      <span className={cn('text-xs', supported ? 'text-poster-text-main' : 'text-poster-text-sub')}>
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// Task Selector
// ============================================================================

/** Dropdown for selecting a task category */
function TaskSelector({
  selectedTask,
  onTaskChange,
}: {
  selectedTask: TaskCategory;
  onTaskChange: (task: TaskCategory) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-poster-text-main flex items-center gap-2">
        <Layers className="w-4 h-4 text-poster-accent-teal" />
        Task
      </label>
      <select
        value={selectedTask}
        onChange={(e) => onTaskChange(e.target.value as TaskCategory)}
        className="select select-bordered select-sm bg-poster-surface border-poster-border/30 text-poster-text-main focus:border-poster-accent-teal/50 focus:outline-none"
      >
        {TASK_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.tasks.map((task) => (
              <option key={task} value={task}>
                {taskLabel(task)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Model Recommendation Card
// ============================================================================

/** Single model recommendation card */
function ModelCard({
  entry,
  score,
  reasons,
  isSelected,
  onToggleCompare,
}: {
  entry: {
    readonly modelId: string;
    readonly provider: string;
    readonly task: string;
    readonly name: string;
    readonly sizeMB: number;
    readonly minMemoryMB?: number;
    readonly dimensions?: number;
    readonly recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
    readonly speedTier: 'fast' | 'medium' | 'slow';
    readonly qualityTier: 'low' | 'medium' | 'high';
    readonly description?: string;
  };
  score: number;
  reasons: string[];
  isSelected: boolean;
  onToggleCompare: () => void;
}) {
  return (
    <div
      className={cn(
        'card bg-poster-surface/50 border shadow-sm transition-all duration-200 hover:shadow-md',
        isSelected
          ? 'border-poster-accent-teal/60 ring-1 ring-poster-accent-teal/30'
          : 'border-poster-border/30'
      )}
    >
      <div className="card-body p-4 gap-3">
        {/* Top row: name + score */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-poster-text-main text-sm">{entry.name}</h3>
            <p className="text-xs text-poster-text-sub font-mono truncate">{entry.modelId}</p>
          </div>
          <div className="flex-shrink-0 ml-3">
            <div
              className="radial-progress text-poster-accent-teal text-xs font-bold"
              style={
                {
                  '--value': score,
                  '--size': '3rem',
                  '--thickness': '3px',
                } as React.CSSProperties
              }
              role="progressbar"
            >
              {score}
            </div>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="ghost" size="sm">{entry.provider}</Badge>
          <Badge variant="ghost" size="sm">{formatSizeMB(entry.sizeMB)}</Badge>
          <Badge className={tierColor(entry.speedTier)} size="sm">
            {entry.speedTier}
          </Badge>
          <Badge className={tierColor(entry.qualityTier)} size="sm">
            {entry.qualityTier} quality
          </Badge>
          <Badge className={deviceBadgeColor(entry.recommendedDevice)} size="sm">
            {entry.recommendedDevice}
          </Badge>
          {entry.dimensions && (
            <Badge variant="ghost" size="sm">{entry.dimensions}d</Badge>
          )}
        </div>

        {/* Description */}
        {entry.description && (
          <p className="text-xs text-poster-text-sub">{entry.description}</p>
        )}

        {/* Reasons */}
        <div className="flex flex-wrap gap-1">
          {reasons.map((reason, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[10px] text-poster-text-sub bg-poster-surface rounded-full px-2 py-0.5 border border-poster-border/20"
            >
              <Info className="w-2.5 h-2.5 text-poster-accent-teal" />
              {reason}
            </span>
          ))}
        </div>

        {/* Compare button */}
        <div className="flex justify-end">
          <Button
            variant={isSelected ? 'primary' : 'ghost'}
            size="xs"
            onClick={onToggleCompare}
            className={cn(
              isSelected
                ? 'bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal'
                : 'hover:text-poster-accent-teal'
            )}
          >
            <ArrowLeftRight className="w-3 h-3 mr-1" />
            {isSelected ? 'Selected' : 'Compare'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Batch Size Card
// ============================================================================

/** Display adaptive batch size computation result */
function BatchSizeCard({
  batchSize,
}: {
  batchSize: { batchSize: number; reasoning: string; deviceProfile: { cores: number; memoryGB: number; hasGPU: boolean; source: string } };
}) {
  return (
    <div className="card bg-poster-surface/50 border border-poster-border/30 shadow-lg">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-poster-accent-teal" />
          <h2 className="card-title text-base text-poster-text-main">Adaptive Batch Size</h2>
        </div>

        <div className="stats bg-poster-surface border border-poster-border/20 shadow-sm w-full">
          <div className="stat py-3 px-4">
            <div className="stat-title text-poster-text-sub text-xs">Optimal Batch Size</div>
            <div className="stat-value text-poster-accent-teal text-3xl">{batchSize.batchSize}</div>
            <div className="stat-desc text-poster-text-sub/70">items per batch</div>
          </div>
        </div>

        {/* Device profile summary */}
        <div className="flex items-center gap-4 text-xs text-poster-text-sub">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            {batchSize.deviceProfile.cores} cores
          </span>
          <span className="flex items-center gap-1">
            <MemoryStick className="w-3 h-3" />
            {batchSize.deviceProfile.memoryGB} GB RAM
          </span>
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            GPU: {batchSize.deviceProfile.hasGPU ? 'Yes' : 'No'}
          </span>
        </div>

        {/* Reasoning */}
        <details className="group">
          <summary className="text-xs text-poster-text-sub cursor-pointer hover:text-poster-text-main transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            Computation details
          </summary>
          <p className="text-xs text-poster-text-sub mt-2 leading-relaxed bg-poster-surface/50 rounded-lg p-3 border border-poster-border/20">
            {batchSize.reasoning}
          </p>
        </details>
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Panel
// ============================================================================

/** Side-by-side model comparison */
function ComparisonPanel({
  comparisonPair,
  recommendations,
  onClear,
}: {
  comparisonPair: ComparisonPair;
  recommendations: ReadonlyArray<{
    readonly entry: {
      readonly modelId: string;
      readonly provider: string;
      readonly name: string;
      readonly sizeMB: number;
      readonly dimensions?: number;
      readonly recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
      readonly speedTier: 'fast' | 'medium' | 'slow';
      readonly qualityTier: 'low' | 'medium' | 'high';
    };
    readonly score: number;
  }>;
  onClear: () => void;
}) {
  const [idA, idB] = comparisonPair;
  if (!idA || !idB) return null;

  const modelA = recommendations.find((r) => r.entry.modelId === idA);
  const modelB = recommendations.find((r) => r.entry.modelId === idB);
  if (!modelA || !modelB) return null;

  return (
    <div className="card bg-poster-surface/50 border border-poster-accent-teal/30 shadow-lg">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-poster-accent-teal" />
            <h2 className="card-title text-base text-poster-text-main">Model Comparison</h2>
          </div>
          <Button variant="ghost" size="xs" onClick={onClear} className="hover:text-error">
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ComparisonColumn model={modelA} other={modelB} />
          <ComparisonColumn model={modelB} other={modelA} />
        </div>
      </div>
    </div>
  );
}

/** Single column in the comparison panel */
function ComparisonColumn({
  model,
  other,
}: {
  model: {
    readonly entry: {
      readonly modelId: string;
      readonly provider: string;
      readonly name: string;
      readonly sizeMB: number;
      readonly dimensions?: number;
      readonly recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
      readonly speedTier: 'fast' | 'medium' | 'slow';
      readonly qualityTier: 'low' | 'medium' | 'high';
    };
    readonly score: number;
  };
  other: {
    readonly entry: {
      readonly sizeMB: number;
      readonly speedTier: 'fast' | 'medium' | 'slow';
      readonly qualityTier: 'low' | 'medium' | 'high';
    };
    readonly score: number;
  };
}) {
  const speedRank = { fast: 3, medium: 2, slow: 1 };
  const qualityRank = { low: 1, medium: 2, high: 3 };

  const isSmallerSize = model.entry.sizeMB < other.entry.sizeMB;
  const isFasterSpeed = speedRank[model.entry.speedTier] > speedRank[other.entry.speedTier];
  const isHigherQuality = qualityRank[model.entry.qualityTier] > qualityRank[other.entry.qualityTier];
  const isHigherScore = model.score > other.score;

  return (
    <div className="bg-poster-surface rounded-xl border border-poster-border/20 p-4 flex flex-col gap-3">
      <div>
        <h3 className="font-semibold text-poster-text-main text-sm">{model.entry.name}</h3>
        <p className="text-xs text-poster-text-sub font-mono">{model.entry.provider}</p>
      </div>

      <ComparisonRow label="Score" value={`${model.score}/100`} highlight={isHigherScore} />
      <ComparisonRow label="Size" value={formatSizeMB(model.entry.sizeMB)} highlight={isSmallerSize} />
      <ComparisonRow label="Speed" value={model.entry.speedTier} highlight={isFasterSpeed} />
      <ComparisonRow label="Quality" value={model.entry.qualityTier} highlight={isHigherQuality} />
      <ComparisonRow label="Device" value={model.entry.recommendedDevice} />
      {model.entry.dimensions && (
        <ComparisonRow label="Dimensions" value={`${model.entry.dimensions}`} />
      )}
    </div>
  );
}

/** Single row in the comparison column */
function ComparisonRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-poster-text-sub">{label}</span>
      <span
        className={cn(
          'font-medium',
          highlight === true
            ? 'text-poster-accent-teal'
            : highlight === false
              ? 'text-poster-text-sub'
              : 'text-poster-text-main'
        )}
      >
        {value}
        {highlight === true && ' *'}
      </span>
    </div>
  );
}

// ============================================================================
// Register Model Modal
// ============================================================================

/** Modal form for registering a custom model */
function RegisterModelModal({
  isOpen,
  onClose,
  onRegister,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: CustomModelFormData) => void;
}) {
  const [formData, setFormData] = useState<Partial<CustomModelFormData>>({
    task: 'embedding',
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof CustomModelFormData>(key: K, value: CustomModelFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // Clear field error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.modelId?.trim()) newErrors.modelId = 'Model ID is required';
    if (!formData.name?.trim()) newErrors.name = 'Name is required';
    if (!formData.provider?.trim()) newErrors.provider = 'Provider is required';
    if (!formData.task) newErrors.task = 'Task is required';
    if (!formData.sizeMB || formData.sizeMB < 1) newErrors.sizeMB = 'Size must be at least 1 MB';
    if (!formData.recommendedDevice) newErrors.recommendedDevice = 'Device is required';
    if (!formData.speedTier) newErrors.speedTier = 'Speed tier is required';
    if (!formData.qualityTier) newErrors.qualityTier = 'Quality tier is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onRegister(formData as CustomModelFormData);
    // Reset form
    setFormData({
      task: 'embedding',
      recommendedDevice: 'wasm',
      speedTier: 'medium',
      qualityTier: 'medium',
    });
    setErrors({});
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-poster-surface border border-poster-border/30 max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-poster-text-main">Register Custom Model</h3>
          <button onClick={handleClose} className="btn btn-ghost btn-sm btn-circle">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-poster-text-sub mb-4">
          Custom registrations are in-memory only and will be lost on page refresh.
        </p>

        <div className="flex flex-col gap-3">
          {/* Model ID */}
          <FormField label="Model ID *" error={errors.modelId}>
            <input
              type="text"
              placeholder="custom/my-model"
              value={formData.modelId ?? ''}
              onChange={(e) => updateField('modelId', e.target.value)}
              className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            />
          </FormField>

          {/* Name */}
          <FormField label="Name *" error={errors.name}>
            <input
              type="text"
              placeholder="My Custom Model"
              value={formData.name ?? ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            />
          </FormField>

          {/* Provider */}
          <FormField label="Provider *" error={errors.provider}>
            <input
              type="text"
              placeholder="custom"
              value={formData.provider ?? ''}
              onChange={(e) => updateField('provider', e.target.value)}
              className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            />
          </FormField>

          {/* Task */}
          <FormField label="Task *" error={errors.task}>
            <select
              value={formData.task ?? 'embedding'}
              onChange={(e) => updateField('task', e.target.value as TaskCategory)}
              className="select select-bordered select-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            >
              {TASK_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.tasks.map((task) => (
                    <option key={task} value={task}>
                      {taskLabel(task)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FormField>

          {/* Size + Min Memory in a row */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Size (MB) *" error={errors.sizeMB}>
              <input
                type="number"
                min={1}
                placeholder="50"
                value={formData.sizeMB ?? ''}
                onChange={(e) => updateField('sizeMB', Number(e.target.value))}
                className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
              />
            </FormField>
            <FormField label="Min Memory (MB)">
              <input
                type="number"
                min={0}
                placeholder="Optional"
                value={formData.minMemoryMB ?? ''}
                onChange={(e) => updateField('minMemoryMB', e.target.value ? Number(e.target.value) : undefined)}
                className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
              />
            </FormField>
          </div>

          {/* Dimensions */}
          <FormField label="Dimensions">
            <input
              type="number"
              min={1}
              placeholder="Optional (e.g. 384)"
              value={formData.dimensions ?? ''}
              onChange={(e) => updateField('dimensions', e.target.value ? Number(e.target.value) : undefined)}
              className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            />
          </FormField>

          {/* Device + Speed + Quality in a row */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Device *" error={errors.recommendedDevice}>
              <select
                value={formData.recommendedDevice ?? 'wasm'}
                onChange={(e) => updateField('recommendedDevice', e.target.value as 'webgpu' | 'wasm' | 'cpu')}
                className="select select-bordered select-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
              >
                <option value="webgpu">WebGPU</option>
                <option value="wasm">WASM</option>
                <option value="cpu">CPU</option>
              </select>
            </FormField>
            <FormField label="Speed *" error={errors.speedTier}>
              <select
                value={formData.speedTier ?? 'medium'}
                onChange={(e) => updateField('speedTier', e.target.value as 'fast' | 'medium' | 'slow')}
                className="select select-bordered select-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
              >
                <option value="fast">Fast</option>
                <option value="medium">Medium</option>
                <option value="slow">Slow</option>
              </select>
            </FormField>
            <FormField label="Quality *" error={errors.qualityTier}>
              <select
                value={formData.qualityTier ?? 'medium'}
                onChange={(e) => updateField('qualityTier', e.target.value as 'low' | 'medium' | 'high')}
                className="select select-bordered select-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </FormField>
          </div>

          {/* Description */}
          <FormField label="Description">
            <input
              type="text"
              placeholder="Optional description"
              value={formData.description ?? ''}
              onChange={(e) => updateField('description', e.target.value || undefined)}
              className="input input-bordered input-sm w-full bg-poster-bg border-poster-border/30 text-poster-text-main"
            />
          </FormField>
        </div>

        {/* Actions */}
        <div className="modal-action">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            className="bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal"
          >
            <Plus className="w-4 h-4 mr-1" />
            Register
          </Button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={handleClose}>
        <button className="cursor-default">close</button>
      </div>
    </div>
  );
}

/** Labeled form field with optional error */
function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-poster-text-sub mb-1 block">{label}</label>
      {children}
      {error && <p className="text-xs text-error mt-0.5">{error}</p>}
    </div>
  );
}

// ============================================================================
// Main Advisor View
// ============================================================================

/** Main model advisor view */
export function AdvisorView() {
  const {
    selectedTask,
    setSelectedTask,
    recommendations,
    capabilities,
    isLoading,
    error,
    refresh,
    batchSize,
    isRegisterModalOpen,
    openRegisterModal,
    closeRegisterModal,
    registerModel,
  } = useAdvisor();

  // Comparison state -- local to the view component
  const [comparisonPair, setComparisonPair] = useState<ComparisonPair>([null, null]);

  /** Toggle a model in the comparison pair */
  const toggleCompare = (modelId: string) => {
    setComparisonPair(([a, b]) => {
      // If already selected, deselect it
      if (a === modelId) return [null, b];
      if (b === modelId) return [a, null];
      // Fill first empty slot, or replace second
      if (a === null) return [modelId, b];
      return [a, modelId];
    });
  };

  const clearComparison = () => setComparisonPair([null, null]);

  const hasComparison = comparisonPair[0] !== null && comparisonPair[1] !== null;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <IconBox size="sm" variant="accent">
              <Cpu className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">{APP_TITLE}</h1>
              <p className="text-xs text-poster-text-sub">{APP_SUBTITLE}</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              0MB
              <span className="text-poster-accent-teal">&middot;</span>
              no download
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={openRegisterModal}
            className="bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal hover:border-poster-accent-teal/80 transition-all duration-300 cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1" />
            Register Model
          </Button>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-teal/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            {/* Error */}
            {error && <ErrorAlert message={error.message} onDismiss={() => refresh()} onRetry={refresh} />}

            {/* Top row: Device card + Batch size card */}
            <ErrorBoundary>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DeviceProfileCard capabilities={capabilities} isLoading={isLoading} />
                <BatchSizeCard batchSize={batchSize} />
              </div>
            </ErrorBoundary>

            {/* Task selector */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <TaskSelector selectedTask={selectedTask} onTaskChange={setSelectedTask} />
              <span className="text-xs text-poster-text-sub">
                {recommendations.length} {recommendations.length === 1 ? 'model' : 'models'} recommended
              </span>
            </div>

            {/* Comparison panel (only when 2 models selected) */}
            {hasComparison && (
              <ComparisonPanel
                comparisonPair={comparisonPair}
                recommendations={recommendations}
                onClear={clearComparison}
              />
            )}

            {/* Recommendations list */}
            <ErrorBoundary>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" className="text-poster-accent-teal" />
                  <span className="text-sm text-poster-text-sub ml-3">Computing recommendations...</span>
                </div>
              ) : recommendations.length === 0 && !error ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <IconBox size="lg" variant="surface" className="mb-4">
                    <Cpu className="w-8 h-8 text-poster-text-sub" />
                  </IconBox>
                  <p className="text-sm text-poster-text-sub text-center">
                    No models found for <span className="font-medium text-poster-text-main">{taskLabel(selectedTask)}</span> on your device.
                  </p>
                  <p className="text-xs text-poster-text-sub mt-1">
                    Try a different task or register a custom model.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {recommendations.map((rec) => (
                    <ModelCard
                      key={rec.entry.modelId}
                      entry={rec.entry}
                      score={rec.score}
                      reasons={rec.reasons}
                      isSelected={
                        comparisonPair[0] === rec.entry.modelId ||
                        comparisonPair[1] === rec.entry.modelId
                      }
                      onToggleCompare={() => toggleCompare(rec.entry.modelId)}
                    />
                  ))}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Register Model Modal */}
      <RegisterModelModal
        isOpen={isRegisterModalOpen}
        onClose={closeRegisterModal}
        onRegister={registerModel}
      />
    </div>
  );
}
