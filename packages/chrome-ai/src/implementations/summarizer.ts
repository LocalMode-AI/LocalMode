/**
 * Chrome AI Summarizer Implementation
 *
 * Implements SummarizationModel using Chrome's built-in Summarizer API.
 *
 * @packageDocumentation
 */

import type {
  SummarizationModel,
  DoSummarizeOptions,
  DoSummarizeResult,
} from '@localmode/core';
import type { AISummarizer, ChromeAISummarizerSettings } from '../types.js';
import { estimateTokens } from '../utils.js';

/**
 * Chrome AI Summarizer — implements SummarizationModel.
 *
 * Uses Chrome's built-in Gemini Nano model for instant, zero-download summarization.
 */
export class ChromeAISummarizer implements SummarizationModel {
  readonly modelId = 'chrome-ai:gemini-nano-summarizer';
  readonly provider = 'chrome-ai';

  private session: AISummarizer | null = null;
  private sessionPromise: Promise<AISummarizer> | null = null;
  private settings: ChromeAISummarizerSettings;

  constructor(settings: ChromeAISummarizerSettings = {}) {
    this.settings = settings;
  }

  /**
   * Get or create the summarizer session.
   */
  private async getSession(abortSignal?: AbortSignal): Promise<AISummarizer> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = (async () => {
      const ai = (self as any).ai;
      if (!ai?.summarizer) {
        throw new Error(
          'Chrome AI Summarizer API is not available. ' +
            'This requires Chrome 138+ with built-in AI enabled.'
        );
      }

      const session = await ai.summarizer.create({
        type: this.settings.type ?? 'tl;dr',
        format: this.settings.format ?? 'plain-text',
        length: this.settings.length ?? 'medium',
        sharedContext: this.settings.sharedContext,
        signal: abortSignal,
      });

      this.session = session;
      return session;
    })();

    return this.sessionPromise;
  }

  /**
   * Map numeric maxLength to Chrome AI's length enum.
   */
  private mapLength(maxLength?: number): 'short' | 'medium' | 'long' | undefined {
    if (maxLength === undefined) return undefined;
    if (maxLength <= 50) return 'short';
    if (maxLength <= 150) return 'medium';
    return 'long';
  }

  async doSummarize(options: DoSummarizeOptions): Promise<DoSummarizeResult> {
    const { texts, abortSignal, providerOptions } = options;

    abortSignal?.throwIfAborted();

    // Apply provider-specific options if provided
    const chromeOptions = providerOptions?.chromeAI as ChromeAISummarizerSettings | undefined;
    if (chromeOptions) {
      // Recreate session if provider options change configuration
      if (chromeOptions.type || chromeOptions.format || chromeOptions.sharedContext) {
        this.destroy();
        this.settings = { ...this.settings, ...chromeOptions };
      }
    }

    // Map maxLength to Chrome AI length if not already set via provider options
    const lengthFromMaxLength = this.mapLength(options.maxLength);
    if (lengthFromMaxLength && !chromeOptions?.length) {
      const currentLength = this.settings.length ?? 'medium';
      if (lengthFromMaxLength !== currentLength) {
        this.destroy();
        this.settings = { ...this.settings, length: lengthFromMaxLength };
      }
    }

    const session = await this.getSession(abortSignal);

    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const summaries: string[] = [];

    for (const text of texts) {
      abortSignal?.throwIfAborted();
      const summary = await session.summarize(text, { signal: abortSignal });
      summaries.push(summary);
    }

    const durationMs = performance.now() - startTime;
    const inputTokens = texts.reduce((sum, t) => sum + estimateTokens(t), 0);
    const outputTokens = summaries.reduce((sum, s) => sum + estimateTokens(s), 0);

    return {
      summaries,
      usage: {
        inputTokens,
        outputTokens,
        durationMs,
      },
    };
  }

  /**
   * Destroy the session and free resources.
   */
  destroy(): void {
    if (this.session) {
      this.session.destroy();
      this.session = null;
      this.sessionPromise = null;
    }
  }
}
