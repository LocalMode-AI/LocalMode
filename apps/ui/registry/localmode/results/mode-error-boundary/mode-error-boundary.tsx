'use client';

import { Component, type ReactNode } from 'react';

/** Props for {@link ModeErrorBoundary}. */
export interface ModeErrorBoundaryProps {
  /** The subtree to isolate — a render error inside it is caught and recovered. */
  children: ReactNode;
}

interface ModeErrorBoundaryState {
  error: Error | null;
}

/**
 * A React error boundary that isolates a render failure in its subtree: it
 * catches the error, renders a compact recoverable `role="alert"` notice with
 * the message and a Reset button that clears the error and re-renders the
 * children — so one failing surface cannot blank the whole page.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <ModeErrorBoundary>
 *   <ResultSurface data={data} />
 * </ModeErrorBoundary>
 * ```
 */
export class ModeErrorBoundary extends Component<ModeErrorBoundaryProps, ModeErrorBoundaryState> {
  state: ModeErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModeErrorBoundaryState {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <span className="font-medium">Something went wrong rendering this result.</span>
          <span className="break-words opacity-90">{this.state.error.message}</span>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex h-7 items-center rounded-md border border-destructive/40 px-2 font-medium hover:bg-destructive/20"
          >
            Reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
