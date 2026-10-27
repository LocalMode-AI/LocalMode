/**
 * Real Transformers.js translation with the multi-target Opus-MT models
 * `Xenova/opus-mt-en-zh` and `Xenova/opus-mt-en-ar`, pinned to fixed Hugging
 * Face revisions and loaded through the provider (q8, CPU). Each model
 * translates the same sentences with the default target token and with the
 * token disabled, so the effect of the token is visible in the output.
 *
 * Downloads about 237 MB on a cold cache; run with
 * `pnpm --filter @localmode/transformers test:validate`.
 */
import { describe, it, expect } from 'vitest';
import { createTransformers } from '../src/index.js';

const SENTENCES = [
  'Hello.',
  'Thank you very much.',
  'I love you.',
  'Please send me the report before Friday.',
];

const CJK = /[一-鿿]/g;
const ARABIC = /[؀-ۿ]/g;
const share = (text: string, re: RegExp) =>
  (text.match(re)?.length ?? 0) / Math.max(1, text.replace(/\s/g, '').length);

async function translateBoth(modelId: string, revision: string) {
  const t = createTransformers({ device: 'cpu', quantized: true, revision });
  const withToken = await t.translator(modelId).doTranslate({ texts: SENTENCES });
  const withoutToken = await t
    .translator(modelId, { targetLanguageToken: false })
    .doTranslate({ texts: SENTENCES });
  return { t, withToken: withToken.translations, withoutToken: withoutToken.translations };
}

describe('multi-target Opus-MT target-language token (real model)', () => {
  it('en-zh: the default >>cmn_Hans<< token yields Chinese output', async () => {
    const out = await translateBoth('Xenova/opus-mt-en-zh', '046f55aec303cdee3e0318604406d4df20f1e8ea');
    console.log('[en-zh] with token   :', JSON.stringify(out.withToken));
    console.log('[en-zh] without token:', JSON.stringify(out.withoutToken));
    for (const text of out.withToken) {
      expect(text.length).toBeGreaterThan(0);
      expect(share(text, CJK)).toBeGreaterThan(0.5);
    }
    // The token changes what the model produces for at least one sentence.
    expect(out.withToken).not.toEqual(out.withoutToken);

    // The model reads the token as its target: >>cmn_Hant<< gives Traditional
    // characters where the default gives Simplified ones, both through the
    // setting and through a token written at the start of the text.
    expect(out.withToken[1]).toContain('谢');
    expect(out.withToken[2]).toContain('爱');
    const hant = await out.t
      .translator('Xenova/opus-mt-en-zh', { targetLanguageToken: '>>cmn_Hant<<' })
      .doTranslate({ texts: SENTENCES });
    const inline = await out.t
      .translator('Xenova/opus-mt-en-zh', { targetLanguageToken: false })
      .doTranslate({ texts: SENTENCES.map((x) => `>>cmn_Hant<< ${x}`) });
    console.log('[en-zh] >>cmn_Hant<< :', JSON.stringify(hant.translations));
    expect(hant.translations[1]).toContain('謝');
    expect(hant.translations[2]).toContain('愛');
    expect(inline.translations).toEqual(hant.translations);
  });

  it('en-ar: the default >>ara<< token yields Arabic output', async () => {
    const out = await translateBoth('Xenova/opus-mt-en-ar', '034a684356c19021a187cda4d7f823298b913921');
    console.log('[en-ar] with token   :', JSON.stringify(out.withToken));
    console.log('[en-ar] without token:', JSON.stringify(out.withoutToken));
    for (const text of out.withToken) {
      expect(text.length).toBeGreaterThan(0);
      expect(share(text, ARABIC)).toBeGreaterThan(0.5);
    }
    expect(out.withToken).not.toEqual(out.withoutToken);
  });
});
