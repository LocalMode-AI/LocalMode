/**
 * @file error-boundary.tsx
 * @description Error handling components for voice-studio
 */
'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui';

interface ErrorBoundaryProps { children: ReactNode; fallback?: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Error caught by boundary:', error, info); }
  handleRetry = () => { this.setState({ hasError: false, error: null }); };
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
          <AlertTriangle className="w-8 h-8 text-error mb-4" />
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-poster-text-sub mb-4">{this.state.error?.message}</p>
          <Button variant="primary" onClick={this.handleRetry}><RefreshCw className="w-4 h-4 mr-2" />Try Again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ErrorAlert({ message, onDismiss, onRetry }: { message: string; onDismiss?: () => void; onRetry?: () => void }) {
  return (
    <div className="alert alert-error shadow-lg">
      <AlertTriangle className="w-5 h-5" />
      <span className="flex-1">{message}</span>
      <div className="flex gap-2">
        {onRetry && <Button variant="ghost" size="xs" onClick={onRetry}><RefreshCw className="w-3 h-3 mr-1" />Retry</Button>}
        {onDismiss && <Button variant="ghost" size="xs" onClick={onDismiss}>Dismiss</Button>}
      </div>
    </div>
  );
}
