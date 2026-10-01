# License notice for this directory

`stsb-subset.ts` holds 100 sentence pairs with their similarity scores: the
first 100 rows of the STS Benchmark test split (Cer, Diab, Agirre,
Lopez-Gazpio, Specia; SemEval-2017 Task 1), taken from
https://huggingface.co/datasets/mteb/stsbenchmark-sts. All 100 pairs are
captions from the Microsoft Research Video Description Corpus.

The STS Benchmark releases its similarity scores under **CC BY-SA 4.0**
(https://creativecommons.org/licenses/by-sa/4.0/) and leaves each sentence
under the terms of its source corpus, which for these pairs are Microsoft
Research's terms for the Microsoft Research Video Description Corpus. CC BY-SA
4.0 covers the scores in this file, not the sentence text.

Modifications: the first 100 test-split rows, reformatted as TypeScript.

The file is retained for the protocol's quality-fidelity lane (Spearman
correlation of embedding cosine similarities against the scores); the
maintainer is confirming the terms under which the sentences may be
redistributed.

The built package bundles the pairs into `dist/index.js` and `dist/index.cjs`
(and their source maps), and this notice ships with it at
`src/datasets/stsb/LICENSE-CC-BY-SA.md`. The share-alike condition applies to
the similarity scores only; the rest of @localmode/bench is MIT-licensed.
