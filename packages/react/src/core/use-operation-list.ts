/**
 * @file use-operation-list.ts
 * @description Hook that wraps useOperation and accumulates results into a list
 */

import { useState, useCallback } from 'react';
import { useOperation } from './use-operation.js';

const IS_SERVER = typeof window === 'undefined';

/** Configuration for useOperationList */
interface UseOperationListConfig<TInput extends unknown[], TOutput, TItem> {
  /** The async function to execute */
  fn: (...args: [...TInput, AbortSignal]) => Promise<TOutput>;
  /** Transform a result into a list item. Receives the result and the original input args. */
  transform: (result: TOutput, ...args: TInput) => TItem;
  /** Whether to prepend new items (default: true — newest first) */
  prepend?: boolean;
}

/** Return type from useOperationList */
export interface UseOperationListReturn<TInput extends unknown[], TOutput, TItem> {
  /** Accumulated list of items */
  items: TItem[];
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error (null if none) */
  error: Error | null;
  /** Execute the operation — on success, transforms and adds result to items */
  execute: (...args: TInput) => Promise<TOutput | null>;
  /** Cancel the current operation */
  cancel: () => void;
  /** Reset error/loading state (keeps items) */
  reset: () => void;
  /** Clear the items list */
  clearItems: () => void;
  /** Remove items matching a predicate */
  removeItem: (predicate: (item: TItem) => boolean) => void;
  /** Replace the items array directly */
  setItems: (items: TItem[]) => void;
}

/**
 * Hook that executes an async operation and accumulates successful results into a list.
 *
 * Wraps `useOperation` for loading/error/abort management. Each successful `execute()`
 * call transforms the result and adds it to the `items` array. The transform function
 * receives both the result and the original input arguments.
 *
 * @param config - Operation function, transform, and prepend option
 * @returns List state with execute/cancel/reset/clearItems/removeItem/setItems
 *
 * @example
 * ```ts
 * const { items, isLoading, execute, removeItem } = useOperationList({
 *   fn: ({ document, question }, signal) =>
 *     askDocument({ model, document, question, abortSignal: signal }),
 *   transform: (result, { document, question }) => ({
 *     id: crypto.randomUUID(),
 *     question,
 *     answer: result.answer,
 *   }),
 * });
 * await execute({ document: 'doc.png', question: 'What is the total?' });
 * removeItem(item => item.id === 'some-id');
 * ```
 */
export function useOperationList<TInput extends unknown[], TOutput, TItem>(
  config: UseOperationListConfig<TInput, TOutput, TItem>
): UseOperationListReturn<TInput, TOutput, TItem> {
  const { transform, prepend = true } = config;
  const [items, setItems] = useState<TItem[]>([]);

  const op = useOperation<TInput, TOutput>({ fn: config.fn });

  const execute = useCallback(async (...args: TInput): Promise<TOutput | null> => {
    const result = await op.execute(...args);
    if (result !== null) {
      const item = transform(result, ...args);
      setItems(prev => prepend ? [item, ...prev] : [...prev, item]);
    }
    return result;
  }, [op.execute, transform, prepend]);

  const clearItems = useCallback(() => setItems([]), []);

  const removeItem = useCallback(
    (predicate: (item: TItem) => boolean) => {
      setItems(prev => prev.filter(item => !predicate(item)));
    },
    []
  );

  if (IS_SERVER) {
    return {
      items: [],
      isLoading: false,
      error: null,
      execute: (async () => null) as unknown as (...args: TInput) => Promise<TOutput | null>,
      cancel: () => {},
      reset: () => {},
      clearItems: () => {},
      removeItem: () => {},
      setItems: () => {},
    };
  }

  return {
    items,
    isLoading: op.isLoading,
    error: op.error,
    execute,
    cancel: op.cancel,
    reset: op.reset,
    clearItems,
    removeItem,
    setItems,
  };
}
