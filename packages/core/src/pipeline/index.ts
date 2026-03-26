/**
 * Pipeline module — composable multi-step workflows.
 *
 * @packageDocumentation
 */

export { createPipeline } from './pipeline.js';

export type {
  PipelineStep,
  Pipeline,
  PipelineConfig,
  PipelineProgress,
  PipelineResult,
  PipelineRunOptions,
} from './types.js';

export {
  embedStep,
  embedManyStep,
  chunkStep,
  searchStep,
  rerankStep,
  storeStep,
  classifyStep,
  summarizeStep,
  generateStep,
  semanticChunkStep,
} from './steps.js';
