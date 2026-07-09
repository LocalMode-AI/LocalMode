/**
 * Speech-to-Text Pipeline-Option Mapping Tests
 *
 * Regression coverage for TransformersSpeechToTextModel.doTranscribe():
 * Transformers.js throws "Cannot specify `task` or `language` for an
 * English-only model" when `language`/`task` reach a `*.en` Whisper
 * checkpoint (see @huggingface/transformers
 * src/models/whisper/modeling_whisper.js `_retrieve_init_tokens`). The
 * wrapper must therefore apply its anti-hallucination defaults
 * (`language: 'en'`, `task: 'transcribe'`) ONLY to multilingual checkpoints.
 *
 * Found by evidence/_harness/b-voice.mjs (real Chrome + fake mic +
 * Xenova/whisper-tiny.en): every transcription failed with
 * "Transcription failed after 3 attempts" caused by the English-only throw.
 *
 * Boundary note: the REAL-model path (real Whisper in real Chrome over a real
 * MediaRecorder blob) is exercised by the browser harness; this unit suite
 * mocks `@huggingface/transformers` — the layer BELOW doTranscribe — with a
 * recording stub to pin the exact options forwarded to the pipeline.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every (audio, options) pair the stub pipeline receives. */
const pipelineCalls: Array<{ audio: unknown; options: Record<string, unknown> }> = [];

/** Per-test generation_config served by the stub pipeline's model. */
let generationConfig: { is_multilingual?: boolean } | undefined;

vi.mock('@huggingface/transformers', () => {
  const pipe = async (audio: unknown, options: Record<string, unknown>) => {
    pipelineCalls.push({ audio, options });
    return { text: ' stub transcript ' };
  };
  // Live getter (NOT Object.assign, which would snapshot the value) so each
  // test's `generationConfig` is observed at doTranscribe() time.
  Object.defineProperty(pipe, 'model', {
    get: () => ({ generation_config: generationConfig }),
  });
  return {
    pipeline: vi.fn(async () => pipe),
    env: { backends: { onnx: { wasm: {} } } },
  };
});

import { createSpeechToTextModel } from '../src/implementations/speech-to-text.js';

/** 0.5s of silence at 16kHz — goes through the real prepareAudio/WAV path. */
const SAMPLES = new Float32Array(8000);

async function run(
  modelId: string,
  options: { language?: string; task?: 'transcribe' | 'translate' } = {},
) {
  const model = createSpeechToTextModel(modelId);
  await model.doTranscribe({ audio: SAMPLES, ...options });
  return pipelineCalls[pipelineCalls.length - 1].options;
}

beforeEach(() => {
  pipelineCalls.length = 0;
});

describe('doTranscribe() pipeline options — English-only (*.en) checkpoints', () => {
  beforeEach(() => {
    // whisper-tiny.en generation_config has no is_multilingual/lang_to_id
    generationConfig = {};
  });

  it('passes NO language/task for whisper-tiny.en by default (the b-voice regression)', async () => {
    const opts = await run('Xenova/whisper-tiny.en');
    expect('language' in opts).toBe(false);
    expect('task' in opts).toBe(false);
  });

  it('drops a redundant explicit language "en" instead of crashing the model', async () => {
    const opts = await run('Xenova/whisper-tiny.en', { language: 'en' });
    expect('language' in opts).toBe(false);
  });

  it('drops a redundant explicit task "transcribe"', async () => {
    const opts = await run('Xenova/whisper-tiny.en', { task: 'transcribe' });
    expect('task' in opts).toBe(false);
  });

  it('passes an explicit non-English language through so Transformers.js raises its own descriptive error', async () => {
    const opts = await run('Xenova/whisper-tiny.en', { language: 'fr' });
    expect(opts.language).toBe('fr');
  });

  it('passes an explicit translate task through so Transformers.js raises its own descriptive error', async () => {
    const opts = await run('Xenova/whisper-tiny.en', { task: 'translate' });
    expect(opts.task).toBe('translate');
  });
});

describe('doTranscribe() pipeline options — multilingual checkpoints', () => {
  beforeEach(() => {
    generationConfig = { is_multilingual: true };
  });

  it('keeps the anti-hallucination defaults (language "en", task "transcribe")', async () => {
    const opts = await run('Xenova/whisper-tiny');
    expect(opts.language).toBe('en');
    expect(opts.task).toBe('transcribe');
  });

  it('honors explicit language/task', async () => {
    const opts = await run('Xenova/whisper-tiny', { language: 'de', task: 'translate' });
    expect(opts.language).toBe('de');
    expect(opts.task).toBe('translate');
  });
});

describe('doTranscribe() pipeline options — return_timestamps mapping', () => {
  it('defaults to false, maps true and "word" through', async () => {
    generationConfig = {};
    const model = createSpeechToTextModel('Xenova/whisper-tiny.en');

    await model.doTranscribe({ audio: SAMPLES });
    expect(pipelineCalls[0].options.return_timestamps).toBe(false);

    await model.doTranscribe({ audio: SAMPLES, returnTimestamps: true });
    expect(pipelineCalls[1].options.return_timestamps).toBe(true);

    await model.doTranscribe({ audio: SAMPLES, returnTimestamps: 'word' });
    expect(pipelineCalls[2].options.return_timestamps).toBe('word');
  });
});
