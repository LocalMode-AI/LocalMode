/**
 * The item lists /bench/tasks accepts, each pinned by its item count and
 * digest (SHA-256 over `<id>\t<text sha256>\n` per item, in list order). The
 * texts themselves are never part of the build: the page fetches a list from
 * a local item server and refuses it unless every text matches its SHA-256
 * and the list matches its pin here. The sample lists also name their source
 * file and its SHA-256, which the item server checks before it serves them;
 * `scripts/pin-task-item-lists.ts` regenerates them. Adding or changing a list
 * changes the session protocol's item lists.
 */
import type { TaskKind, TaskSet, TaskSubset } from '@localmode/bench';

/** A pinned item list. */
export interface TaskItemListSpec {
  id: string;
  task: TaskKind;
  set: TaskSet;
  subset: TaskSubset;
  count: number;
  sha256: string;
  /** The sample file the list is served from, and its SHA-256 (sample lists). */
  file?: string;
  fileSha256?: string;
}

/** Every list the page accepts. */
export const TASK_ITEM_LISTS: readonly TaskItemListSpec[] = [
  // BEGIN sample lists (scripts/pin-task-item-lists.ts)
  { id: 'summarize-cnndm-test-full', task: 'summarize', set: 'cnndm-test', subset: 'full', count: 1000, sha256: '7144e81837bb13364013f87d5bd36951e64ec24c0a505101a58a9b02edcc1965', file: 'summarization_cnndm.jsonl', fileSha256: 'd2dee89fdeaea969e8e5f50a7c98129ca0eea44e1a7aa04915960655184f342b' },
  { id: 'summarize-cnndm-reserve-full', task: 'summarize', set: 'cnndm-reserve', subset: 'full', count: 1000, sha256: '0e4e623919ed2ca1aa46d7e2874fc580d22a7dec5b20ca739a40909bdc76edfa', file: 'summarization_cnndm_reserve.jsonl', fileSha256: '34105e7c32a2dc0fe8adf0eae1bbed83feda98f782d26078a0fa5a1959f8bee4' },
  { id: 'summarize-xsum-test-full', task: 'summarize', set: 'xsum-test', subset: 'full', count: 500, sha256: '62d9893e3aee61dc08ea09a56675997310b30144a5a41a8f268bc94f024cb2d7', file: 'summarization_xsum.jsonl', fileSha256: '51ffca1eae33cf46e2c8f85798ef6215880040087d1a07b8936cf0717a944821' },
  { id: 'summarize-cnndm-test-S', task: 'summarize', set: 'cnndm-test', subset: 'S', count: 300, sha256: '7a334582c16b1fa0249a1f8e83ca7e74760bdfaaff56b6e73fc4bc14641d3121', file: 'subset_crossdevice_summarization.jsonl', fileSha256: '7fc7fe5f525d52c71cb48bc486505397f679a0c77743bc7a88bc4064c687cb2c' },
  { id: 'summarize-cnndm-test-R', task: 'summarize', set: 'cnndm-test', subset: 'R', count: 100, sha256: 'fc350eb070feaf87f343314303179ba0345ba1368e5f97ce5a46a0a9d513f2c8', file: 'subset_repeats_summarization.jsonl', fileSha256: 'e7cb58851f52f8ea9f455d59e03d8aa346d0da696165a2c67241c5b8f8a53d41' },
  { id: 'summarize-cnndm-test-L', task: 'summarize', set: 'cnndm-test', subset: 'L', count: 50, sha256: '2d4999008adfea96e5299a47df66cf0b7a46e70fadd227bf278202c2f4bf91cc', file: 'subset_latency_summarization.jsonl', fileSha256: '3c4b773ac654e741d93152100a55b7864d93051470710608a42c921d0d0decd3' },
  { id: 'summarize-cnndm-test-pilot', task: 'summarize', set: 'cnndm-test', subset: 'pilot', count: 10, sha256: '91f3cbdba63b225b6070bb87b0251e4ad18031cb49b27c0307361f514094de9c', file: 'pilot_summarization.jsonl', fileSha256: '6318632bcf8773a254fe5fac6000c66c8bdf345b2350ac7015ccb93379790724' },
  { id: 'translate-flores-devtest-full', task: 'translate', set: 'flores-devtest', subset: 'full', count: 24288, sha256: '1b8d3c74aa13df3bf5c30ccef814aa85867a3ef178a129a23e3dcb39cc1fd17d', file: 'translation_flores.jsonl', fileSha256: 'fc5147a6d00fad87d9a99d7fb03c9726de4ac40afe5bc9d2a830fe4a0fef8a10' },
  { id: 'translate-flores-devtest-S', task: 'translate', set: 'flores-devtest', subset: 'S', count: 2400, sha256: 'e6f5e5194acde2ed9c8520eeb4197d1cdf6741a7399ae5ae07cada37dc149da2', file: 'subset_crossdevice_translation.jsonl', fileSha256: '6b61270d94a5bf1930494b26c158c1f7f32bc152b0b0f28f912a49a6fbc68b08' },
  { id: 'translate-flores-devtest-R', task: 'translate', set: 'flores-devtest', subset: 'R', count: 200, sha256: '3d9d149076a60c69bcc153a84fe5652e81dd0cce8b8d7448e9fb186f7b29c86c', file: 'subset_repeats_translation.jsonl', fileSha256: '11a2aa76ad54dac10dea336f1bec5e73727a4b18962025bf3b84e3805ccdf792' },
  { id: 'translate-flores-devtest-L', task: 'translate', set: 'flores-devtest', subset: 'L', count: 200, sha256: '3d9d149076a60c69bcc153a84fe5652e81dd0cce8b8d7448e9fb186f7b29c86c', file: 'subset_latency_translation.jsonl', fileSha256: '7b0f9e5909cc5ca698962cebd85280f10613e4cff2ec895beb22e933359313d2' },
  { id: 'translate-flores-devtest-pilot', task: 'translate', set: 'flores-devtest', subset: 'pilot', count: 10, sha256: 'd6504d731a42783f814f5e129a15c7420f3724541c7bec28285a6f70cc9c5e92', file: 'pilot_translation.jsonl', fileSha256: 'f27c16af9f87b50bee147747e9c9eb21558cd521db89d6db0fc72f360c41a5a7' },
  { id: 'detect-language-flores-devtest-full', task: 'detect-language', set: 'flores-devtest', subset: 'full', count: 52624, sha256: '84a768ceac5303c93f0bf4deffe7cf77425e2d2a4c968cf5bdfde03e4af84450', file: 'lid_flores.jsonl', fileSha256: '320e4e5e0a1e8f2ec7ddeb02e5cfa84149b8983e75a2800164262a522e3a1315' },
  { id: 'detect-language-wili-test-full', task: 'detect-language', set: 'wili-test', subset: 'full', count: 2600, sha256: 'f7866165f16832cebee7466ac88120d996c5f58eef8661a8bf0c7892288036ff', file: 'lid_wili.jsonl', fileSha256: 'c83d15eea1fa56c598de6a8ef0d589df651914801b8b5d719b0d589981e7bd34' },
  { id: 'detect-language-flores-devtest-S', task: 'detect-language', set: 'flores-devtest', subset: 'S', count: 5200, sha256: 'bd200157ed0b1d7eb473b277d57ac67534f63adaf704852fa5d32cfca57a701f', file: 'subset_crossdevice_lid.jsonl', fileSha256: 'c5cb8a9966485eab9e5fff959b2f3666112b160ac01634b7e43f17a641bc5293' },
  { id: 'detect-language-flores-devtest-R', task: 'detect-language', set: 'flores-devtest', subset: 'R', count: 300, sha256: '1f858d58f00a451eeff60bb1336a678117cb82724680e6f55bfd7ebacd6c7167', file: 'subset_repeats_lid.jsonl', fileSha256: 'a67a7937e3ee82f2029e4ae84902cf86157fb8bed906000ed1c0cffdf1e89a01' },
  { id: 'detect-language-flores-devtest-L', task: 'detect-language', set: 'flores-devtest', subset: 'L', count: 200, sha256: 'a9333432c4a84d57321bfc8892d40d5d0a023d49c2e1cac81b0ef9a34e32c8ee', file: 'subset_latency_lid.jsonl', fileSha256: '53e7d0981d8ded974ac4946c373047c88f06a702fec3b43768b19dda5541362d' },
  { id: 'detect-language-flores-devtest-pilot', task: 'detect-language', set: 'flores-devtest', subset: 'pilot', count: 10, sha256: '2d96626dba622682619d0eb37b3068177a77f1d9575d59d2263d51393411b7f5', file: 'pilot_lid.jsonl', fileSha256: '9bcf7d35ecf73d3cc6a6fae611cbef370a75abec8bd6f7a0f2c57207b662f71d' },
  // END sample lists
  // Five-item lists of e2e/bench/tasks.spec.ts.
  {
    id: 'pilot-e2e-summarize-cnndm-5',
    task: 'summarize',
    set: 'cnndm-test',
    subset: 'pilot',
    count: 5,
    sha256: 'cb79f0771e3e4f011dafa747db81dc690a147ddb363369985992d613ac8404b6',
  },
  {
    id: 'pilot-e2e-translate-flores-5',
    task: 'translate',
    set: 'flores-devtest',
    subset: 'pilot',
    count: 5,
    sha256: '9e911c46a1e28578385951c8a68f4fc407d2cfb39e7f63c257f915df68f54b4d',
  },
  {
    id: 'pilot-e2e-detect-flores-5',
    task: 'detect-language',
    set: 'flores-devtest',
    subset: 'pilot',
    count: 5,
    sha256: 'a3450e099fb86724f2b0cd69c549d41622ea00dfa0dd5f92e48814ea081c69fe',
  },
  {
    id: 'pilot-e2e-summarize-cnndm-1',
    task: 'summarize',
    set: 'cnndm-test',
    subset: 'pilot',
    count: 1,
    sha256: '05f45c229694cd5cf8a45c46d618ffa2a16a5bbbce450919fdab8aae85162a64',
  },
  {
    id: 'pilot-e2e-translate-flores-1',
    task: 'translate',
    set: 'flores-devtest',
    subset: 'pilot',
    count: 1,
    sha256: '1b7b336f23861b842585d9c0fc7b21e746c72a095ce47743ed143fdaa3c0f753',
  },
];
