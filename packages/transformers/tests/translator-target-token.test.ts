/**
 * Multi-target Opus-MT models need a sentence-initial `>>id<<` target token.
 * Token selection is a pure function; the prepend path runs the translator
 * unmodified against Transformers.js mocked at its module boundary: the token
 * must reach the model as one vocabulary id at the start of the input ids,
 * since Transformers.js would split the token string into sub-word pieces.
 * The real pipeline runs in `opus-mt-target-token.integration.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// What reached the model: plain text through the pipeline call, or the
// token-prefixed id sequence through generate(), rendered back to text.
const inputs: string[] = [];

const VOCAB = new Map<string, number>([
  ['>>cmn_Hans<<', 900],
  ['>>cmn_Hant<<', 901],
  ['>>yue_Hant<<', 902],
  ['>>ara<<', 903],
]);
const ID_TO_TOKEN = new Map([...VOCAB].map(([k, v]) => [v, k]));
const EOS = 0;

vi.mock('@huggingface/transformers', () => {
  class Tensor {
    constructor(
      public type: string,
      public data: BigInt64Array,
      public dims: number[]
    ) {}
  }
  // Word-level stand-in for the real tokenizer: one id per word, then EOS.
  const words: string[] = [];
  const tokenizer = Object.assign(
    (text: string) => {
      const ids = text.split(/\s+/).filter(Boolean).map((w) => {
        if (!words.includes(w)) words.push(w);
        return 1000 + words.indexOf(w);
      });
      return { input_ids: { data: BigInt64Array.from([...ids, EOS].map(BigInt)) } };
    },
    {
      convert_tokens_to_ids: (token: string) => VOCAB.get(token) ?? null,
      batch_decode: () => ['out'],
      model_max_length: 512,
    }
  );
  const model = {
    generate: vi.fn(async (options: { input_ids: Tensor; attention_mask: Tensor; max_new_tokens: number }) => {
      expect(options.attention_mask.dims).toEqual(options.input_ids.dims);
      expect(options.max_new_tokens).toBe(256);
      const ids = Array.from(options.input_ids.data, Number);
      inputs.push(
        'ids:' +
        ids
          .filter((id) => id !== EOS)
          .map((id) => ID_TO_TOKEN.get(id) ?? words[id - 1000])
          .join(' ')
      );
      return [[1, 2]];
    }),
  };
  return {
    env: { backends: { onnx: { wasm: {} } }, useCustomCache: false },
    Tensor,
    pipeline: vi.fn(async () => {
      const pipe = async (text: string) => {
        inputs.push(`text:${text}`);
        return [{ translation_text: 'out' }];
      };
      return Object.assign(pipe, {
        dispose: vi.fn(),
        tokenizer,
        model,
        _default_generation_config: { max_new_tokens: 256 },
      });
    }),
  };
});

import {
  createTransformers,
  OPUS_MT_TARGET_LANGUAGE_TOKENS,
  resolveTargetLanguageToken,
} from '../src/index.js';

describe('resolveTargetLanguageToken()', () => {
  it('returns the table token for the known multi-target Opus-MT models', () => {
    expect(resolveTargetLanguageToken('Xenova/opus-mt-en-zh')).toBe('>>cmn_Hans<<');
    expect(resolveTargetLanguageToken('Xenova/opus-mt-en-ar')).toBe('>>ara<<');
    expect(OPUS_MT_TARGET_LANGUAGE_TOKENS['Xenova/opus-mt-en-zh']).toBe('>>cmn_Hans<<');
  });

  it('accepts the transformers:-prefixed model id', () => {
    expect(resolveTargetLanguageToken('transformers:Xenova/opus-mt-en-zh')).toBe('>>cmn_Hans<<');
  });

  it('returns undefined for single-target models', () => {
    expect(resolveTargetLanguageToken('Xenova/opus-mt-en-de')).toBeUndefined();
    expect(resolveTargetLanguageToken('Xenova/opus-mt-zh-en')).toBeUndefined();
  });

  it('uses an explicit token over the table, and false disables it', () => {
    expect(resolveTargetLanguageToken('Xenova/opus-mt-en-zh', '>>cmn_Hant<<')).toBe('>>cmn_Hant<<');
    expect(resolveTargetLanguageToken('Xenova/opus-mt-en-zh', false)).toBeUndefined();
    expect(resolveTargetLanguageToken('my/custom-multi', '>>fra<<')).toBe('>>fra<<');
  });
});

describe('translator target-language token', () => {
  beforeEach(() => {
    inputs.length = 0;
  });

  it('prepends the token for en-zh and en-ar', async () => {
    const t = createTransformers();
    await t.translator('Xenova/opus-mt-en-zh').doTranslate({ texts: ['Hello.', 'Bye.'] });
    await t.translator('Xenova/opus-mt-en-ar').doTranslate({ texts: ['Hello.'] });
    expect(inputs).toEqual(['ids:>>cmn_Hans<< Hello.', 'ids:>>cmn_Hans<< Bye.', 'ids:>>ara<< Hello.']);
  });

  it('sends single-target model input unchanged', async () => {
    await createTransformers().translator('Xenova/opus-mt-en-de').doTranslate({ texts: ['Hello.'] });
    expect(inputs).toEqual(['text:Hello.']);
  });

  it('honours the override and the opt-out', async () => {
    const t = createTransformers();
    await t.translator('Xenova/opus-mt-en-zh', { targetLanguageToken: '>>cmn_Hant<<' }).doTranslate({ texts: ['Hi'] });
    await t.translator('Xenova/opus-mt-en-zh', { targetLanguageToken: false }).doTranslate({ texts: ['Hi'] });
    expect(inputs).toEqual(['ids:>>cmn_Hant<< Hi', 'text:Hi']);
  });

  it('takes a per-call providerOptions override', async () => {
    const model = createTransformers().translator('Xenova/opus-mt-en-zh');
    await model.doTranslate({ texts: ['Hi'], providerOptions: { transformers: { targetLanguageToken: '>>yue_Hant<<' } } });
    await model.doTranslate({ texts: ['Hi'], providerOptions: { transformers: { targetLanguageToken: false } } });
    expect(inputs).toEqual(['ids:>>yue_Hant<< Hi', 'text:Hi']);
  });

  it('reads a token written at the start of the text as the target', async () => {
    const t = createTransformers();
    await t.translator('Xenova/opus-mt-en-zh').doTranslate({ texts: ['>>cmn_Hant<< Hi'] });
    await t.translator('Xenova/opus-mt-en-de').doTranslate({ texts: ['  >>cmn_Hant<<Hi there'] });
    expect(inputs).toEqual(['ids:>>cmn_Hant<< Hi', 'ids:>>cmn_Hant<< Hi there']);
  });

  it('rejects a token the model vocabulary does not contain', async () => {
    const model = createTransformers().translator('Xenova/opus-mt-en-zh', { targetLanguageToken: '>>xx<<' });
    await expect(model.doTranslate({ texts: ['Hi'] })).rejects.toThrow(/not in the vocabulary/);
    expect(inputs).toEqual([]);
  });
});
