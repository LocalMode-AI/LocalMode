'use client';

/**
 * @file inline-citation-demo.tsx
 * @description Docs preview for `InlineCitation`. Hover/focus a superscript
 * marker to reveal the cited local chunk; the multi-source marker pages via a
 * carousel. No network unfurl.
 */
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationQuote,
  InlineCitationSource,
} from './inline-citation';

export default function InlineCitationDemo() {
  return (
    <p className="w-full max-w-xl text-sm leading-relaxed text-foreground">
      LocalMode runs models entirely in the browser
      <InlineCitation>
        <InlineCitationCard>
          <InlineCitationCardTrigger label={1} />
          <InlineCitationCardBody>
            <InlineCitationCarousel count={1}>
              <InlineCitationSource
                title="architecture.md"
                excerpt="Execution model overview"
              >
                <InlineCitationQuote>
                  All inference executes on-device via WebGPU or WASM.
                </InlineCitationQuote>
              </InlineCitationSource>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
      , and your data never leaves the device
      <InlineCitation>
        <InlineCitationCard>
          <InlineCitationCardTrigger label={2} />
          <InlineCitationCardBody>
            <InlineCitationCarousel count={2}>
              <InlineCitationSource title="privacy.md" excerpt="No telemetry">
                <InlineCitationQuote>
                  There is no analytics and no API keys.
                </InlineCitationQuote>
              </InlineCitationSource>
              <InlineCitationSource title="faq.md" excerpt="Data residency">
                <InlineCitationQuote>
                  Embeddings and vectors stay in local IndexedDB.
                </InlineCitationQuote>
              </InlineCitationSource>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
      .
    </p>
  );
}
