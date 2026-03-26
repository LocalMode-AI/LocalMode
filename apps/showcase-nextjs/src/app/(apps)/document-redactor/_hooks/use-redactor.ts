/**
 * @file use-redactor.ts
 * @description Hook for managing document redaction operations with optional differential privacy
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useExtractEntities, toAppError, downloadBlob } from '@localmode/react';
import { embed, wrapEmbeddingModel, dpEmbeddingMiddleware, createPrivacyBudget } from '@localmode/core';
import { getNERModel, getEmbeddingModel, mapEntities } from '../_services/redactor.service';
import { redactText } from '../_lib/utils';
import { DEFAULT_EPSILON, MAX_BUDGET_EPSILON, LOW_BUDGET_THRESHOLD } from '../_lib/constants';
import type { DetectedEntity, DPEmbeddingResult, PrivacyBudgetState } from '../_lib/types';
import type { PrivacyBudget } from '@localmode/core';

/** Compute the current budget state from a PrivacyBudget instance */
function computeBudgetState(budget: PrivacyBudget | null): PrivacyBudgetState {
  if (!budget) {
    return { consumed: 0, remaining: MAX_BUDGET_EPSILON, maxEpsilon: MAX_BUDGET_EPSILON, isExhausted: false, isLow: false };
  }
  const consumed = budget.consumed();
  const remaining = budget.remaining();
  const maxEpsilon = MAX_BUDGET_EPSILON;
  const isExhausted = budget.isExhausted();
  const isLow = !isExhausted && remaining < maxEpsilon * LOW_BUDGET_THRESHOLD;
  return { consumed, remaining, maxEpsilon, isExhausted, isLow };
}

/** Hook for orchestrating document redaction scanning, export, and optional DP embedding */
export function useRedactor() {
  const [entities, setEntities] = useState<DetectedEntity[]>([]);
  const [dpEnabled, setDpEnabled] = useState(false);
  const [epsilon, setEpsilon] = useState(DEFAULT_EPSILON);
  const [dpResult, setDpResult] = useState<DPEmbeddingResult | null>(null);
  const [budgetState, setBudgetState] = useState<PrivacyBudgetState>(
    () => computeBudgetState(null)
  );

  const nerModel = useRef(getNERModel()).current;
  const budgetRef = useRef<PrivacyBudget | null>(null);
  const budgetInitialized = useRef(false);

  const { error, isLoading, execute, cancel, reset } = useExtractEntities({ model: nerModel });

  // Initialize the privacy budget once (async)
  useEffect(() => {
    if (budgetInitialized.current) return;
    budgetInitialized.current = true;
    createPrivacyBudget({ maxEpsilon: MAX_BUDGET_EPSILON, onExhausted: 'warn' }).then(
      (budget) => {
        budgetRef.current = budget;
        setBudgetState(computeBudgetState(budget));
      }
    );
  }, []);

  /** Scan input text for named entities and optionally apply DP embedding */
  const scan = async (input: string) => {
    if (!input.trim()) return;
    const data = await execute(input);
    if (!data) return;

    const mapped = mapEntities(data.entities);
    setEntities(mapped);

    // If DP is enabled, embed the redacted text with DP noise
    if (dpEnabled) {
      try {
        const redacted = redactText(input, mapped);
        const baseModel = getEmbeddingModel();
        const wrappedModel = wrapEmbeddingModel({
          model: baseModel,
          middleware: dpEmbeddingMiddleware(
            { epsilon, mechanism: 'gaussian' },
            budgetRef.current ?? undefined
          ),
        });

        const result = await embed({ model: wrappedModel, value: redacted });
        setDpResult({
          dimensions: result.embedding.length,
          epsilonUsed: epsilon,
          timestamp: new Date(),
        });

        // Update budget state after consumption
        setBudgetState(computeBudgetState(budgetRef.current));
      } catch (err) {
        console.error('DP embedding failed:', err);
        // Don't block the NER result — DP is optional enhancement
        setDpResult(null);
      }
    } else {
      setDpResult(null);
    }
  };

  /** Download the redacted text as a .txt file */
  const downloadRedacted = (input: string) => {
    const redacted = redactText(input, entities);
    downloadBlob(redacted, 'redacted.txt');
  };

  return {
    entities,
    isScanning: isLoading,
    error: toAppError(error),
    scan,
    downloadRedacted,
    cancel,
    clearError: reset,
    // DP state
    dpEnabled,
    setDpEnabled,
    epsilon,
    setEpsilon,
    dpResult,
    budgetState,
  };
}
