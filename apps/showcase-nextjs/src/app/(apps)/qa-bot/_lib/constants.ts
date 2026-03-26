/**
 * @file constants.ts
 * @description Constants for the QA bot application
 */

/** Default question-answering model identifier */
export const MODEL_ID = 'Xenova/distilbert-base-cased-distilled-squad';

/** Approximate model download size */
export const MODEL_SIZE = '~100MB';

/** Sample context paragraph for demonstration */
export const SAMPLE_CONTEXT = `The Amazon rainforest, also known as Amazonia, is a moist broadleaf tropical rainforest in the Amazon biome that covers most of the Amazon basin of South America. This basin encompasses 7,000,000 km2, of which 5,500,000 km2 are covered by the rainforest. This region includes territory belonging to nine nations and 3,344 formally acknowledged indigenous territories. The majority of the forest is contained within Brazil, with 60% of the rainforest, followed by Peru with 13%, Colombia with 10%, and with minor amounts in Bolivia, Ecuador, French Guiana, Guyana, Suriname, and Venezuela. The Amazon represents over half of the planet's remaining rainforests.`;

/** Sample questions for the demonstration context */
export const SAMPLE_QUESTIONS = [
  'How large is the Amazon basin?',
  'Which country has the most rainforest?',
  'How many nations have territory in the basin?',
];
