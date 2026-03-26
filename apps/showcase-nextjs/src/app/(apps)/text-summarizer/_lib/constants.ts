/**
 * @file constants.ts
 * @description Constants for the text summarizer application
 */
import type { SummaryLength, LengthConfig } from './types';

/** Model configuration */
export const MODEL_ID = 'Xenova/distilbart-cnn-6-6';
export const MODEL_SIZE = '300MB';

/** Summary length configurations */
export const LENGTH_CONFIGS: Record<SummaryLength, LengthConfig> = {
  short: { label: 'Short', maxLength: 50, minLength: 20 },
  medium: { label: 'Medium', maxLength: 130, minLength: 50 },
  long: { label: 'Long', maxLength: 250, minLength: 100 },
} as const;

/** Sample text for demo */
export const SAMPLE_TEXT = `Artificial intelligence has transformed the way we interact with technology. Machine learning models can now understand natural language, recognize images, and even generate creative content. These advances have led to practical applications in healthcare, where AI assists in diagnosing diseases; in transportation, where self-driving cars are becoming a reality; and in education, where personalized learning experiences are being created. However, these developments also raise important ethical questions about privacy, bias, and the future of work. As AI continues to evolve, society must carefully consider how to harness its benefits while mitigating potential risks. The key challenge lies in developing AI systems that are not only powerful but also fair, transparent, and accountable.`;
