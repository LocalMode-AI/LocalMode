/**
 * @file error-boundary.tsx
 * @description Error boundary and error alert components for the data extractor
 */
'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { cn } from '../_lib/utils';

// ============================================================================
// ErrorBoundary
// ============================================================================

/** Props for ErrorBoundary */
interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback UI */
  fallback?: ReactNode;
}

/** State for ErrorBoundary */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Error boundary component to catch React rendering errors */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-6 text-center text-poster-text-sub">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-error" />
            <p className="font-medium text-poster-text-main">Something went wrong</p>
            <p className="text-sm mt-1">{this.state.error?.message}</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// ErrorAlert
// ============================================================================

/** Props for ErrorAlert */
interface ErrorAlertProps {
  /** Error message to display */
  message: string;
  /** Dismiss handler */
  onDismiss?: () => void;
  /** Retry handler */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Inline error alert with retry and dismiss actions */
export function ErrorAlert({ message, onDismiss, onRetry, className }: ErrorAlertProps) {
  return (
    <div className={cn('alert alert-error shadow-lg', className)}>
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-sm">{message}</span>
      <div className="flex gap-1">
        {onRetry && (
          <button className="btn btn-ghost btn-xs" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        {onDismiss && (
          <button className="btn btn-ghost btn-xs" onClick={onDismiss}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
