/**
 * @file constants.ts
 * @description Constants for the model evaluator application
 */

import type { EvaluatorTab, ModelOption, SampleDataset, SampleCorpus } from './types';

/** Available tabs */
export const TABS: EvaluatorTab[] = ['evaluate', 'calibrate'];

/** Tab display labels */
export const TAB_LABELS: Record<EvaluatorTab, string> = {
  evaluate: 'Evaluate',
  calibrate: 'Calibrate',
};

/** Accent color for this app */
export const ACCENT_COLOR = 'poster-accent-purple';

/** Default percentile for threshold calibration */
export const DEFAULT_PERCENTILE = 90;

// ============================================================================
// Classifier Models
// ============================================================================

export const CLASSIFIER_MODELS: ModelOption[] = [
  {
    id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    name: 'DistilBERT Sentiment',
    description: 'Fine-tuned for binary sentiment classification (POSITIVE / NEGATIVE)',
    size: '67MB',
  },
  {
    id: 'Xenova/mobilebert-uncased-mnli',
    name: 'MobileBERT Zero-Shot',
    description: 'Zero-shot classification via natural language inference',
    size: '400MB',
  },
];

// ============================================================================
// Embedding Models
// ============================================================================

export const EMBEDDING_MODELS: ModelOption[] = [
  {
    id: 'Xenova/bge-small-en-v1.5',
    name: 'BGE Small',
    description: 'Compact English embedding model, 384 dimensions',
    size: '33MB',
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM L6 v2',
    description: 'Fast general-purpose embeddings, 384 dimensions',
    size: '23MB',
  },
];

// ============================================================================
// Sample Datasets
// ============================================================================

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'sentiment',
    name: 'Sentiment Analysis',
    description: 'Product reviews labeled as POSITIVE or NEGATIVE',
    entries: [
      { input: 'This product is amazing! Best purchase I ever made.', expected: 'POSITIVE' },
      { input: 'Terrible quality. Broke after one day of use.', expected: 'NEGATIVE' },
      { input: 'I love how easy this is to set up. Highly recommend!', expected: 'POSITIVE' },
      { input: 'Waste of money. Very disappointed with this item.', expected: 'NEGATIVE' },
      { input: 'Great value for the price. Works perfectly.', expected: 'POSITIVE' },
      { input: 'Awful customer service and the product is defective.', expected: 'NEGATIVE' },
      { input: 'Exceeded my expectations. Beautiful design and build.', expected: 'POSITIVE' },
      { input: 'Cheap materials, poor construction. Do not buy.', expected: 'NEGATIVE' },
      { input: 'Fast shipping and excellent packaging. Very happy!', expected: 'POSITIVE' },
      { input: 'The worst purchase I have ever made. Total scam.', expected: 'NEGATIVE' },
      { input: 'Absolutely fantastic! My whole family loves it.', expected: 'POSITIVE' },
      { input: 'Returned immediately. Nothing like the description.', expected: 'NEGATIVE' },
      { input: 'Perfect gift idea. Arrived on time and looks great.', expected: 'POSITIVE' },
      { input: 'Flimsy and cheaply made. Falls apart easily.', expected: 'NEGATIVE' },
      { input: 'Outstanding performance. Best in its class.', expected: 'POSITIVE' },
      { input: 'Overpriced for what you get. Not worth it.', expected: 'NEGATIVE' },
      { input: 'So glad I bought this. Life-changing product!', expected: 'POSITIVE' },
      { input: 'Stopped working after a week. No refund offered.', expected: 'NEGATIVE' },
      { input: 'Sleek design and works as advertised. Five stars.', expected: 'POSITIVE' },
      { input: 'Unbelievably bad. Save your money and avoid this.', expected: 'NEGATIVE' },
      { input: 'My favorite purchase this year. Truly impressed.', expected: 'POSITIVE' },
      { input: 'Misleading product images. Very poor quality.', expected: 'NEGATIVE' },
      { input: 'Incredible sound quality for the price. Love it!', expected: 'POSITIVE' },
      { input: 'Complete garbage. Threw it away after one use.', expected: 'NEGATIVE' },
    ],
  },
  {
    id: 'topic',
    name: 'News Topic Classification',
    description: 'News headlines labeled by category',
    entries: [
      { input: 'Stocks rally as Fed signals rate cuts ahead', expected: 'business' },
      { input: 'Lakers defeat Celtics in overtime thriller', expected: 'sports' },
      { input: 'New AI chip promises 10x faster inference', expected: 'technology' },
      { input: 'Senate passes bipartisan infrastructure bill', expected: 'politics' },
      { input: 'Tesla reports record quarterly earnings', expected: 'business' },
      { input: 'World Cup final draws 1 billion viewers', expected: 'sports' },
      { input: 'Apple unveils next-generation MacBook Pro', expected: 'technology' },
      { input: 'President signs executive order on climate', expected: 'politics' },
      { input: 'Inflation falls to lowest level in two years', expected: 'business' },
      { input: 'Olympic swimmer breaks three world records', expected: 'sports' },
      { input: 'Google launches open-source language model', expected: 'technology' },
      { input: 'Election results spark debate over voting laws', expected: 'politics' },
      { input: 'Amazon acquires streaming platform for $5B', expected: 'business' },
      { input: 'Champions League draw reveals exciting matchups', expected: 'sports' },
      { input: 'Quantum computer solves protein folding puzzle', expected: 'technology' },
      { input: 'Supreme Court rules on digital privacy case', expected: 'politics' },
      { input: 'Startup raises $200M in Series C funding round', expected: 'business' },
      { input: 'Tennis star announces retirement after 20 seasons', expected: 'sports' },
      { input: 'SpaceX successfully lands reusable rocket booster', expected: 'technology' },
      { input: 'Governor proposes sweeping education reform plan', expected: 'politics' },
    ],
  },
];

// ============================================================================
// Sample Corpora
// ============================================================================

export const SAMPLE_CORPORA: SampleCorpus[] = [
  {
    id: 'general',
    name: 'General Knowledge',
    description: 'Diverse sentences covering common topics',
    texts: [
      'The Eiffel Tower is located in Paris, France.',
      'Water boils at 100 degrees Celsius at sea level.',
      'The human heart beats about 100,000 times per day.',
      'Python is a popular programming language for data science.',
      'The Great Wall of China is visible from space.',
      'Photosynthesis converts sunlight into chemical energy.',
      'Shakespeare wrote Romeo and Juliet in the 16th century.',
      'The speed of light is approximately 300,000 km per second.',
      'DNA carries the genetic instructions for all living organisms.',
      'The Amazon rainforest produces 20% of the world oxygen.',
      'Mount Everest is the tallest mountain above sea level.',
      'The internet was originally developed for military communication.',
      'Elephants are the largest land animals on Earth.',
      'The Pacific Ocean is the largest and deepest ocean.',
      'Coffee is the second most traded commodity after oil.',
      'The human brain contains approximately 86 billion neurons.',
      'Mars is known as the Red Planet due to iron oxide.',
      'Classical music can improve concentration and focus.',
      'The stock market operates on supply and demand principles.',
      'Antibiotics cannot treat viral infections like the common cold.',
    ],
  },
  {
    id: 'technical',
    name: 'Technical Documentation',
    description: 'Software engineering and ML terminology',
    texts: [
      'Neural networks consist of interconnected layers of nodes.',
      'RESTful APIs use HTTP methods for CRUD operations.',
      'Gradient descent optimizes model parameters iteratively.',
      'Docker containers package applications with their dependencies.',
      'Transformers use self-attention mechanisms for sequence modeling.',
      'Kubernetes orchestrates containerized applications at scale.',
      'Convolutional neural networks excel at image recognition tasks.',
      'GraphQL provides a flexible query language for APIs.',
      'Reinforcement learning agents learn through trial and error.',
      'Microservices architecture splits applications into small services.',
      'BERT uses bidirectional context for language understanding.',
      'CI/CD pipelines automate software testing and deployment.',
      'Embeddings represent words as dense vectors in high-dimensional space.',
      'Load balancers distribute incoming traffic across multiple servers.',
      'Attention mechanisms allow models to focus on relevant inputs.',
      'Version control systems track changes in source code over time.',
      'Fine-tuning adapts pretrained models to specific downstream tasks.',
      'WebAssembly enables near-native performance in web browsers.',
      'Batch normalization stabilizes and accelerates neural network training.',
      'Event-driven architectures process data as streams of events.',
    ],
  },
];
