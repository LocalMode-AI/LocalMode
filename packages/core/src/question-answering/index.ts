/**
 * Question Answering Domain
 *
 * Functions and types for extractive question answering.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export {
  answerQuestion,
  answerQuestionMany,
  setGlobalQuestionAnsweringProvider,
} from './answer-question.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  QuestionAnsweringUsage,
  QuestionAnsweringResponse,
  ExtractedAnswer,
  // Model interface
  QuestionAnsweringModel,
  DoAnswerQuestionOptions,
  DoAnswerQuestionResult,
  // answerQuestion() types
  AnswerQuestionOptions,
  AnswerQuestionResult,
  // answerQuestionMany() types
  AnswerQuestionManyOptions,
  AnswerQuestionManyResult,
  // Factory types
  QuestionAnsweringModelFactory,
} from './types.js';

