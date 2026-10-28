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
  { id: 'translate-flores-devtest-full', task: 'translate', set: 'flores-devtest', subset: 'full', count: 24288, sha256: '3748231f87de67ace7e25c566a3e3e8374fe126384fc71d2ea2f924a7256bd05', file: 'translation_flores.jsonl', fileSha256: '0f353c6ad004f2974752cb43755362d6bc44620561fb32e036dda5f55f87cbea' },
  { id: 'translate-flores-devtest-S', task: 'translate', set: 'flores-devtest', subset: 'S', count: 2400, sha256: 'b3f7e7c0cfed4ab0046b9baecc7180a1011861145177512373f567f8de33a488', file: 'subset_crossdevice_translation.jsonl', fileSha256: '5d65daf671f19285f43a882344156f8e796eb1537079f2f06bb093440e3bdebd' },
  { id: 'translate-flores-devtest-R', task: 'translate', set: 'flores-devtest', subset: 'R', count: 200, sha256: 'ed677b4635dff4ec68181a51546435a63497c25645a5d3a9fe434fe70b90f8ed', file: 'subset_repeats_translation.jsonl', fileSha256: 'b5c5ea1f7cddb37cf373008e2e3d22104a8f6b978cf142b2ae166a0f32aee6b2' },
  { id: 'translate-flores-devtest-L', task: 'translate', set: 'flores-devtest', subset: 'L', count: 200, sha256: 'ed677b4635dff4ec68181a51546435a63497c25645a5d3a9fe434fe70b90f8ed', file: 'subset_latency_translation.jsonl', fileSha256: 'a137766808a818d8f32776c180e3d8d69c7fb53428db3a10100a5b49a7ea0c83' },
  { id: 'translate-flores-devtest-pilot', task: 'translate', set: 'flores-devtest', subset: 'pilot', count: 10, sha256: '23d0a81b11e0b46263ff4de5fedb72385b6ca2e1f3f8c3f547eee8c96f9bc069', file: 'pilot_translation.jsonl', fileSha256: '7b0f0f3d76deaee67dad88c8d17819900adbda09c49536962a844f0ba00bc69a' },
  { id: 'detect-language-flores-devtest-full', task: 'detect-language', set: 'flores-devtest', subset: 'full', count: 52624, sha256: '47d167089da9422e132977e287c752cde731455b98ca1dc9adc1bc3238323a8d', file: 'lid_flores.jsonl', fileSha256: '401e6724af0e03941e09af67e8eafeed51d0d71fc3666b4babda369e699fd0e4' },
  { id: 'detect-language-wili-test-full', task: 'detect-language', set: 'wili-test', subset: 'full', count: 2600, sha256: 'f7866165f16832cebee7466ac88120d996c5f58eef8661a8bf0c7892288036ff', file: 'lid_wili.jsonl', fileSha256: 'b774efc265476fc351932a65862a7f0845da8a842054836b025c4bcdecae79a6' },
  { id: 'detect-language-flores-devtest-S', task: 'detect-language', set: 'flores-devtest', subset: 'S', count: 5200, sha256: '49e85160a7d65c74bc2836785f12a98d4786cdc3f6d6b0c76818b8364ad2dbff', file: 'subset_crossdevice_lid.jsonl', fileSha256: '64ba59f6ac825dacfd5c31ef5f0b21f0b7906af9426d1f466dd61b365fe8ea46' },
  { id: 'detect-language-flores-devtest-R', task: 'detect-language', set: 'flores-devtest', subset: 'R', count: 300, sha256: '7b02cd21e0dd563ab576f7e939168926a2f05859f4cd1ce3d64ef85a69063259', file: 'subset_repeats_lid.jsonl', fileSha256: '80a663f0687c9a73d94b8e129d93a47f7e50d6e99cc311454d841332eeb127ef' },
  { id: 'detect-language-flores-devtest-L', task: 'detect-language', set: 'flores-devtest', subset: 'L', count: 200, sha256: 'b5ba2426e4edbbcfaa5d7093edc1fcfd60f3a6282c866c23002eef425e8362b6', file: 'subset_latency_lid.jsonl', fileSha256: '77f8dcc8955830bd3315009045a206b23cf7ae83f82bbb40d6cc05f451c63571' },
  { id: 'detect-language-flores-devtest-pilot', task: 'detect-language', set: 'flores-devtest', subset: 'pilot', count: 10, sha256: '95d59a245d05f3f013e93f23b78c0633693fea2ce8155a0e8f3f9c47b0c9b9e4', file: 'pilot_lid.jsonl', fileSha256: 'a6689e4f0ef8e726980155f76fe83596dd0ba6518f3b8ff690a50c75fbab8360' },
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
    sha256: '0a0635a4802648fea0fd089d5821bae3ca4867d1f58fcf0b7e03936cc98e17fd',
  },
  {
    id: 'pilot-e2e-detect-flores-5',
    task: 'detect-language',
    set: 'flores-devtest',
    subset: 'pilot',
    count: 5,
    sha256: '9d1061c5b0c95c97b0f6c1046a33aa0597625862f3fa768b442b9c985b9a3dcc',
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
    sha256: 'ffcc2ded8c35399aba19d96e7061333a21588ec0473f871051c866730ced8d56',
  },
];
