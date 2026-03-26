/**
 * @file constants.ts
 * @description Constants and configuration for the data extractor application
 */

import { jsonSchema } from '@localmode/core';
import { z } from 'zod';
import type { ExtractionTemplate, ModelOption, TemplateName } from './types';

/** Default model ID */
export const DEFAULT_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

/** Available models for structured output (1.7B+ with reliable JSON generation) */
export const AVAILABLE_MODELS: ModelOption[] = [
  // Medium (1GB - 2.2GB)
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen 3 1.7B', size: '1.1GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 3B', size: '1.7GB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '1.76GB' },
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC', name: 'Hermes 3 Llama 3.2 3B', size: '1.76GB' },
  { id: 'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC', name: 'Ministral 3 3B', size: '1.8GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini', size: '2.1GB' },
  // Large (2.2GB+)
  { id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC', name: 'Phi 3 Mini 4K', size: '2.2GB' },
  { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen 3 4B', size: '2.2GB' },
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral 7B v0.3', size: '4GB' },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 7B', size: '4GB' },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', name: 'DeepSeek R1 Distill Qwen 7B', size: '4.18GB' },
  { id: 'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC', name: 'DeepSeek R1 Distill Llama 8B', size: '4.41GB' },
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', name: 'Hermes 3 Llama 3.1 8B', size: '4.9GB' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', size: '4.5GB' },
  { id: 'Qwen3-8B-q4f16_1-MLC', name: 'Qwen 3 8B', size: '4.5GB' },
];

/** Contact info schema */
const contactSchema = z.object({
  name: z.string().describe('Full name'),
  email: z.string().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  company: z.string().optional().describe('Company name'),
});

/** Event details schema */
const eventSchema = z.object({
  title: z.string().describe('Event title'),
  date: z.string().describe('Event date'),
  location: z.string().describe('Event location'),
  description: z.string().optional().describe('Brief description'),
});

/** Product review schema */
const reviewSchema = z.object({
  product: z.string().describe('Product name'),
  rating: z.number().describe('Rating from 1 to 5'),
  pros: z.array(z.string()).describe('List of positive aspects'),
  cons: z.array(z.string()).describe('List of negative aspects'),
});

/** Recipe schema */
const recipeSchema = z.object({
  name: z.string().describe('Recipe name'),
  servings: z.number().describe('Number of servings'),
  ingredients: z.array(z.object({
    item: z.string().describe('Ingredient name'),
    amount: z.string().describe('Amount with unit'),
  })).describe('List of ingredients'),
  steps: z.array(z.string()).describe('Cooking steps'),
});

/** Job posting schema */
const jobSchema = z.object({
  title: z.string().describe('Job title'),
  company: z.string().describe('Company name'),
  salary: z.string().optional().describe('Salary range'),
  requirements: z.array(z.string()).describe('Job requirements'),
  location: z.string().describe('Job location'),
});

/** Extraction templates */
export const EXTRACTION_TEMPLATES: Record<TemplateName, ExtractionTemplate> = {
  contact: {
    name: 'Contact Info',
    icon: 'User',
    schema: jsonSchema(contactSchema),
    schemaDisplay: '{ name, email, phone?, company? }',
    sampleText:
      'Hi, my name is Sarah Chen. You can reach me at sarah.chen@acme.co or call 555-0147. I work at Acme Corporation as a Senior Engineer.',
  },
  event: {
    name: 'Event Details',
    icon: 'Calendar',
    schema: jsonSchema(eventSchema),
    schemaDisplay: '{ title, date, location, description? }',
    sampleText:
      'Join us for the Annual Tech Summit on March 15, 2027 at the SF Convention Center. This year we focus on AI, privacy, and the future of local-first computing.',
  },
  review: {
    name: 'Product Review',
    icon: 'Star',
    schema: jsonSchema(reviewSchema),
    schemaDisplay: '{ product, rating, pros[], cons[] }',
    sampleText:
      "I bought the NovaPhone X200 last month. It's fantastic — the camera is incredible, battery lasts two days, and the display is gorgeous. However, it's quite heavy and the price is steep at $1200. I'd give it 4 out of 5 stars.",
  },
  recipe: {
    name: 'Recipe',
    icon: 'ChefHat',
    schema: jsonSchema(recipeSchema),
    schemaDisplay: '{ name, servings, ingredients[{item,amount}], steps[] }',
    sampleText:
      "Classic Pancakes (serves 4): Mix 1.5 cups flour, 3.5 tsp baking powder, 1 tbsp sugar, and a pinch of salt. In another bowl, combine 1.25 cups milk, 1 egg, and 3 tbsp melted butter. Mix wet into dry until smooth. Pour 1/4 cup batter onto a hot griddle. Cook until bubbles form, flip, cook until golden. Serve with maple syrup.",
  },
  job: {
    name: 'Job Posting',
    icon: 'Briefcase',
    schema: jsonSchema(jobSchema),
    schemaDisplay: '{ title, company, salary?, requirements[], location }',
    sampleText:
      'We are hiring a Senior Frontend Engineer at CloudTech Inc. The position is based in Austin, TX with a salary range of $150K-$190K. Requirements: 5+ years of React experience, TypeScript proficiency, experience with Next.js, and familiarity with CI/CD pipelines.',
  },
};

/** Default template */
export const DEFAULT_TEMPLATE: TemplateName = 'contact';
