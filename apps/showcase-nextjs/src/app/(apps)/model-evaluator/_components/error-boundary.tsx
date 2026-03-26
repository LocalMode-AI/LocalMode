/**
 * @file error-boundary.tsx
 * @description React Error Boundary for graceful error handling
 */
'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, IconBox } from './ui';

/** Props for the ErrorBoundary component */
interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Optional fallback UI */
  fallback?: ReactNode;
}

/** State for the ErrorBoundary component */
interface ErrorBoundaryState {
  /** Whether an error has occurred */
  hasError: boolean;
  /** The error that occurred */
  error: Error | null;
}

/** Error boundary for catching and displaying React errors */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <IconBox size="lg" variant="surface" className="mb-6">
            <AlertTriangle className="w-8 h-8 text-error" />
          </IconBox>

          <h2 className="text-xl font-bold text-poster-text-main mb-2">Something went wrong</h2>

          <p className="text-sm text-poster-text-sub mb-6 text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>

          <Button variant="primary" onClick={this.handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Props for the ErrorAlert component */
interface ErrorAlertProps {
  /** Error message to display */
  message: string;
  /** Callback to dismiss the error */
  onDismiss?: () => void;
  /** Callback to retry the operation */
  onRetry?: () => void;
}

/** Inline error alert for displaying recoverable errors */
export function ErrorAlert({ message, onDismiss, onRetry }: ErrorAlertProps) {
  return (
    <div className="alert alert-error shadow-lg">
      <AlertTriangle className="w-5 h-5" />
      <span className="flex-1">{message}</span>
      <div className="flex gap-2">
        {onRetry && (
          <Button variant="ghost" size="xs" onClick={onRetry}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="xs" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
