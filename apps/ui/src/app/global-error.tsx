'use client';

/**
 * @file global-error.tsx
 * @description Last-resort boundary for errors in the root layout itself. It
 * replaces the whole document, so it renders its own <html>/<body> with inline
 * styles (theme tokens/CSS may be unavailable at this point).
 */
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#0a0a0a',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: '28rem', color: '#a1a1aa', margin: 0 }}>
          An unexpected error occurred. Please reload the page.
        </p>
        {error.digest ? (
          <p style={{ fontSize: '0.75rem', color: '#71717a', margin: 0 }}>Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            cursor: 'pointer',
            borderRadius: '0.375rem',
            border: 'none',
            background: '#fafafa',
            color: '#0a0a0a',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
