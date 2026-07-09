/**
 * Chrome AI Summarizer Implementation
 *
 * Implements SummarizationModel using Chrome's built-in Summarizer API.
 *
 * @packageDocumentation
 */

import {
  SummarizationError,
  type SummarizationModel,
  type DoSummarizeOptions,
  type DoSummarizeResult,
} from '@localmode/core';
import type { AISummarizer, AISummarizerCreateOptions, ChromeAISummarizerSettings } from '../types.js';
import { availabilityWithDeadline, estimateTokens, getSummarizerFactory } from '../utils.js';

/**
 * Chrome AI Summarizer — implements SummarizationModel.
 *
 * Uses Chrome's built-in on-device model. Your app ships no model files, but Chrome may
 * need to download the model once (browser-wide) — gate that with `allowDownload`.
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
      const factory = getSummarizerFactory();
      if (!factory) {
        throw new SummarizationError(
          'Chrome AI Summarizer API is not available. `self.Summarizer` is undefined.',
          {
            hint: 'The Summarizer API requires Chrome 138+ stable on desktop. See https://localmode.dev/docs/chrome-ai for setup.',
          }
        );
      }

      const createOptions: AISummarizerCreateOptions = {
        type: this.settings.type ?? 'tldr',
        format: this.settings.format ?? 'plain-text',
        length: this.settings.length ?? 'medium',
        sharedContext: this.settings.sharedContext,
        signal: abortSignal,
      };

      // Availability gate. The legacy `self.ai.summarizer` surface has no
      // `availability()`; there, presence is all we can check.
      if (typeof factory.availability === 'function') {
        const availability = await availabilityWithDeadline(() =>
          factory.availability!(createOptions) as Promise<string>,
        );
        // A probe that never answers must not wedge the caller; fall through to
        // create(), which surfaces a real error instead of hanging on the gate.
        if (availability === 'unavailable') {
          throw new SummarizationError(
            'Chrome AI Summarizer is reported as unavailable on this device.',
            { hint: 'This device or Chrome build cannot run the on-device summarization model.' }
          );
        }
        if (
          (availability === 'downloadable' || availability === 'downloading') &&
          !this.settings.allowDownload
        ) {
          throw new SummarizationError(
            `The Chrome AI summarization model needs to be downloaded before use (status: ${availability}).`,
            {
              hint: 'Set `allowDownload: true` on the summarizer settings and call it from a user activation (click/tap/keypress) so Chrome can download the model.',
            }
          );
        }
      }

      const onProgress = this.settings.onProgress;
      if (onProgress) {
        createOptions.monitor = (m: EventTarget) => {
          m.addEventListener('downloadprogress', ((evt: Event) => {
            const e = evt as Event & { loaded?: number; total?: number };
            onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0 });
          }) as EventListener);
        };
      }

      const session = await factory.create(createOptions);

      this.session = session;
      return session;
    })();

    // A failed create must not poison every later call with the same rejection.
    this.sessionPromise.catch(() => {
      this.sessionPromise = null;
    });

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
