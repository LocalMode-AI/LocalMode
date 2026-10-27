/**
 * Pinned fallback models of the task sessions: each repository's revision
 * and, per dtype, the files Transformers.js 4.2 loads for the pipeline with
 * their sizes and SHA-256 (from the Hugging Face API, or computed from a
 * download at the revision for files outside LFS). The task adapters rewrite
 * every model-file request to the pinned revision and check each loaded file
 * against these digests before a cell counts. Read on 2026-10-27.
 */

/** One pinned file. */
export interface PinnedFile {
  file: string;
  bytes: number;
  sha256: string;
}

/** A pinned repository. */
export interface PinnedModel {
  repo: string;
  revision: string;
  dtypes: Record<'q8' | 'fp32', PinnedFile[]>;
}

/** The pinned Transformers.js fallbacks (DistilBART-CNN 6-6 and the 24 Opus-MT directions). */
export const PINNED_FALLBACK_MODELS: readonly PinnedModel[] = [
  {
    repo: 'Xenova/distilbart-cnn-6-6',
    revision: '6b476295a3cf27d5b20e8c8b847a54ab8e5d0df9',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1852, sha256: '2e16f80f1dbbda53094b15f45d6e2953ced17bff4c6f9dc3f8e24ebbe701e09d' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 128819737, sha256: '14d9b2d8fb1b6ebf7133046eaba3ea0dc0539be0523caa14c3e9b22131518a02' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 155102167, sha256: '7a584dce621f77e39008055b6ef4ae9d3698241758e568edf3e5b0ad5fd6ccb2' },
        { file: 'generation_config.json', bytes: 363, sha256: '85c3e01442b11210b4a8f07fccadb863288720812e4b073f67ede39fae1feeba' },
        { file: 'tokenizer.json', bytes: 2108614, sha256: '2f1a555a1ee93656b4e6f67aa75d492a843c225e5ef754bae24c36bd85851cd7' },
        { file: 'tokenizer_config.json', bytes: 1335, sha256: 'c56f73109691e1540cff519360cd1472045cd3d9d42f687d4478fe87f5f10c06' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1852, sha256: '2e16f80f1dbbda53094b15f45d6e2953ced17bff4c6f9dc3f8e24ebbe701e09d' },
        { file: 'onnx/encoder_model.onnx', bytes: 512520582, sha256: '1ce28b2b7a9948ed8cdb414ff5e4037cfa5f54ae16e9797b3772d651904e293c' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 613946766, sha256: '32a8b5910c88ced64a7f8507dcc1fa785fa612fc27797105a2b7daf1843b8b0b' },
        { file: 'generation_config.json', bytes: 363, sha256: '85c3e01442b11210b4a8f07fccadb863288720812e4b073f67ede39fae1feeba' },
        { file: 'tokenizer.json', bytes: 2108614, sha256: '2f1a555a1ee93656b4e6f67aa75d492a843c225e5ef754bae24c36bd85851cd7' },
        { file: 'tokenizer_config.json', bytes: 1335, sha256: 'c56f73109691e1540cff519360cd1472045cd3d9d42f687d4478fe87f5f10c06' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-de',
    revision: '1ca130c44c4c5441ef16d48aae521a424ab644f7',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1411, sha256: '517955ebf66cd6523f9982851dd41771b74fb2d9c00b4933ba2922ac7a63336f' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 49366942, sha256: '15834b45fabd2dfb8c6c029b3ca3e7289aeefd90ece798ce42bcf548d1bd3b8d' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 56652404, sha256: '8b46a825964cdd182fe47cc780f0fb87d357eae1f47cf20aa63c1c09be5b510c' },
        { file: 'generation_config.json', bytes: 293, sha256: 'cd16a899388283889c6e87b903c689ce73430aaa18335415f9d9ea770606538e' },
        { file: 'tokenizer.json', bytes: 5498450, sha256: '8e0fcf45621ea87fa680c7f9969c37a7f819c1f4c7658a2e6e0879b866a14b17' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '4500a1295197174119cf17f9b2e6eab2d5c3a9c64009fb1e37ebd2868bf1161c' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1411, sha256: '517955ebf66cd6523f9982851dd41771b74fb2d9c00b4933ba2922ac7a63336f' },
        { file: 'onnx/encoder_model.onnx', bytes: 195807020, sha256: '21bd75239e95412a523b993467781d902d4b14e86e49422ffabfe48e15ed3ca1' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 221680436, sha256: 'bea9bca485118db5f5300bd1c77e8e07c9163215b9b5e1cf36d1e81b39cb57cb' },
        { file: 'generation_config.json', bytes: 293, sha256: 'cd16a899388283889c6e87b903c689ce73430aaa18335415f9d9ea770606538e' },
        { file: 'tokenizer.json', bytes: 5498450, sha256: '8e0fcf45621ea87fa680c7f9969c37a7f819c1f4c7658a2e6e0879b866a14b17' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '4500a1295197174119cf17f9b2e6eab2d5c3a9c64009fb1e37ebd2868bf1161c' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-de-en',
    revision: '399dfd68706739fffd503f876093e455ae268a06',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '6754743ec4754957d8552dad869d1314f3af6626b67446ec4cebe5e2fbaa0fc4' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 49366942, sha256: '4cedda8f8c89b72a42b3c6cd1e7a27f2de24457093e3bf80cb3e46829641fcd8' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 56652404, sha256: '4712800584b2d77c2f9e620bf29523e2b20b62f65ade5011ee01780e2b0ea5d3' },
        { file: 'generation_config.json', bytes: 293, sha256: 'cd16a899388283889c6e87b903c689ce73430aaa18335415f9d9ea770606538e' },
        { file: 'tokenizer.json', bytes: 5498450, sha256: '8e0fcf45621ea87fa680c7f9969c37a7f819c1f4c7658a2e6e0879b866a14b17' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e3687c40400600366d9b073a3fd9f75dc8b40d5a9d6e5c92544cf2e9592abe6c' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '6754743ec4754957d8552dad869d1314f3af6626b67446ec4cebe5e2fbaa0fc4' },
        { file: 'onnx/encoder_model.onnx', bytes: 195807020, sha256: '53dfa5f4acb6a933396191376b9b7ef4e27c5b7f0d344de8af44444f34b0c2d1' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 221680436, sha256: '31016c44da6f977f6990f03f854be1b3de400a7bbf288f765f2886d445869863' },
        { file: 'generation_config.json', bytes: 293, sha256: 'cd16a899388283889c6e87b903c689ce73430aaa18335415f9d9ea770606538e' },
        { file: 'tokenizer.json', bytes: 5498450, sha256: '8e0fcf45621ea87fa680c7f9969c37a7f819c1f4c7658a2e6e0879b866a14b17' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e3687c40400600366d9b073a3fd9f75dc8b40d5a9d6e5c92544cf2e9592abe6c' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-fr',
    revision: '28726206f80896b90035bd99cccd5cc1e151f916',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1411, sha256: 'b522b73fcc86f77981349c1df2a2e041eed0dbcbea4acf2635019cf21d51ffc0' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 50090398, sha256: '0a81bdba62f53223740a8c6c6f58e716eba8ea1f92dfa569caf27ed5e3b6a0f7' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 57381512, sha256: '333b244bce16023df04541c8cf9fd60aec9b0569da393c4b831d561897b0bda8' },
        { file: 'generation_config.json', bytes: 293, sha256: 'f9a4824ec78c61b4a95afc43bbb6a9545a44ccf1c01d0963a286e799b9e7b256' },
        { file: 'tokenizer.json', bytes: 5637839, sha256: '8391785c1a2139e7af4678571ccd8dc654ecbb72e4be186940f65d7c604f0246' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'eb8dfaa142fe03627c8d035415f56c46284b6ee4a16e54c6e8236928ac5a1170' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1411, sha256: 'b522b73fcc86f77981349c1df2a2e041eed0dbcbea4acf2635019cf21d51ffc0' },
        { file: 'onnx/encoder_model.onnx', bytes: 198700844, sha256: 'ffa8429c73bea51341e3ebb7af889a9b37294448c371f926dfb3a9a97895b0d9' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 224579912, sha256: 'd87fdd0e4f16e9ea2b58148624bf58ed64cec7c2c0e8d87bb82f4142b80bad57' },
        { file: 'generation_config.json', bytes: 293, sha256: 'f9a4824ec78c61b4a95afc43bbb6a9545a44ccf1c01d0963a286e799b9e7b256' },
        { file: 'tokenizer.json', bytes: 5637839, sha256: '8391785c1a2139e7af4678571ccd8dc654ecbb72e4be186940f65d7c604f0246' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'eb8dfaa142fe03627c8d035415f56c46284b6ee4a16e54c6e8236928ac5a1170' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-fr-en',
    revision: '6b166a182780e118c997879d0ad5be4b53671644',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1411, sha256: '6c2851f154d7b88c7767e4fdcf8a5694a36a456bfa6cbcde1b13fdbade3b56f6' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 50090398, sha256: 'e727cb26ac6bf816394c49671af69c9ae5798868fed1e40849872415dffc1772' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 57381512, sha256: '73bc7ac8e29c42e6f212ebcc29a2991d3646a04aabb642c0036aa54b40e4e1a9' },
        { file: 'generation_config.json', bytes: 293, sha256: 'f9a4824ec78c61b4a95afc43bbb6a9545a44ccf1c01d0963a286e799b9e7b256' },
        { file: 'tokenizer.json', bytes: 5637839, sha256: '8391785c1a2139e7af4678571ccd8dc654ecbb72e4be186940f65d7c604f0246' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'bba9e6b1e3b9724d15ebacaf11eaac360c5ae3f4139bcdef0ee1610592eaa3fe' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1411, sha256: '6c2851f154d7b88c7767e4fdcf8a5694a36a456bfa6cbcde1b13fdbade3b56f6' },
        { file: 'onnx/encoder_model.onnx', bytes: 198700844, sha256: '6e18e05c0a458a99296c526b6b2a989158ecf890a86072f9b3960df52bfc99a7' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 224579912, sha256: '1981b3cddcfdc8783e1d201a9316a25202c504f8566a970960816e1dbe3d9c34' },
        { file: 'generation_config.json', bytes: 293, sha256: 'f9a4824ec78c61b4a95afc43bbb6a9545a44ccf1c01d0963a286e799b9e7b256' },
        { file: 'tokenizer.json', bytes: 5637839, sha256: '8391785c1a2139e7af4678571ccd8dc654ecbb72e4be186940f65d7c604f0246' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'bba9e6b1e3b9724d15ebacaf11eaac360c5ae3f4139bcdef0ee1610592eaa3fe' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-es',
    revision: '4b002a4c7edd54a7ced58877258b87f7efd3f892',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1468, sha256: '499eae1f97eeba63172fc884f92fd727ae803b7ceb79c0f653aa4b011152af2f' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 52899742, sha256: '03434edd1147e6c49e22066e9dc5888235e99cc35a6711d1c4ea5b06455d5da9' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 60212804, sha256: '58ee5ddd6e22d1693d8722b90c1486afb93700a4376cf28fd74175052ad530ae' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6262682, sha256: '285eb29e7155ee48851a77960797813f86a125f70d2c1a124f613f1fbd2b19c3' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'dfb00189b823fb0f15464e9c4e68dd8594f5e5ef5f8dc497468a37741e73aa1f' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1468, sha256: '499eae1f97eeba63172fc884f92fd727ae803b7ceb79c0f653aa4b011152af2f' },
        { file: 'onnx/encoder_model.onnx', bytes: 209938220, sha256: 'ff549b1d64e45c444c938b878f7ad97d0b9aa64f51b30de049583d03ed284afc' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 235839236, sha256: '543a46ff7d2e45897770f24df97d21a8b0a50cf312f5ee3754df587c1883e957' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6262682, sha256: '285eb29e7155ee48851a77960797813f86a125f70d2c1a124f613f1fbd2b19c3' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'dfb00189b823fb0f15464e9c4e68dd8594f5e5ef5f8dc497468a37741e73aa1f' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-es-en',
    revision: 'eadfd7c658a9d8929ac3b8e996b68a68e2c7d480',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1433, sha256: 'fab3a7f93185bc5aa7b419f6a1e6e74d98c8f2a506c94493d3019bf46da3478d' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 52899742, sha256: 'c01e70f8455efc350831aa2af7ed187b16829241f0018ba07d1ba643a391bc18' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 60212804, sha256: '4cd91ab30240d295ce907b5100826031838c672005e57e524d711122d75605fa' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6262682, sha256: '285eb29e7155ee48851a77960797813f86a125f70d2c1a124f613f1fbd2b19c3' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'e1fac15a910169d5b5ec07a13b0374273626a239b5142db10be229ca66cc52a9' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1433, sha256: 'fab3a7f93185bc5aa7b419f6a1e6e74d98c8f2a506c94493d3019bf46da3478d' },
        { file: 'onnx/encoder_model.onnx', bytes: 209938220, sha256: '783d150761adf03de8e2574375a77832336003914395f80b50c9ad82095c7caa' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 235839236, sha256: '6d2bb9fc704b42b8bf8e6e67ee6b4e865cab674706b29a10e5996ac135e5d625' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6262682, sha256: '285eb29e7155ee48851a77960797813f86a125f70d2c1a124f613f1fbd2b19c3' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'e1fac15a910169d5b5ec07a13b0374273626a239b5142db10be229ca66cc52a9' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-it',
    revision: '075406e3c8c2c30634d4a1bd8f00c21d9e162011',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '1cf40ab3aa16e8b6ea7c9766981de1da705a161564c0d5ad187c1e62e5c8ee85' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 60597150, sha256: 'b51c5110c7ba356ef01ee400d427afe162e657de1d7a2e9a40deedd811b49e6f' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 67970348, sha256: 'f9db146ed7665ea7d437dc4df564e3af5df923366de4d52aaf2c4b4e3e4ae4f1' },
        { file: 'generation_config.json', bytes: 293, sha256: '15a4ad1f54640380c5119641a6a6247862bd32dc982b8170024d9d03eb3831a2' },
        { file: 'tokenizer.json', bytes: 7904597, sha256: 'fb93411d5198eb85753bbd68e9ac24ccb42071003214851b2f37c81f2ea50416' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '39ab5df0b1163bfa8a2728c37a3e81dc14a5ee910dcd33f49d46132f26bc4744' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '1cf40ab3aa16e8b6ea7c9766981de1da705a161564c0d5ad187c1e62e5c8ee85' },
        { file: 'onnx/encoder_model.onnx', bytes: 240727852, sha256: '15984df43eb5e36f7ea63b655797f43627ac72066a4dd80c061007673b460682' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 266689004, sha256: 'afd25b3921ea9404fe998ff5927890f3eea6e34d4f2fa67693fc476d4c79f6b2' },
        { file: 'generation_config.json', bytes: 293, sha256: '15a4ad1f54640380c5119641a6a6247862bd32dc982b8170024d9d03eb3831a2' },
        { file: 'tokenizer.json', bytes: 7904597, sha256: 'fb93411d5198eb85753bbd68e9ac24ccb42071003214851b2f37c81f2ea50416' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '39ab5df0b1163bfa8a2728c37a3e81dc14a5ee910dcd33f49d46132f26bc4744' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-it-en',
    revision: 'fd0b89b9c052adc1f2f64152f555aa17353728be',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '4b82a23b7a91b213a934db70d0a33712a739fdd7c5686b02d89642d7dcfc7ac4' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 60773278, sha256: 'a025d2d85c90da23880116b67175e43e71921d8d2bf446b9f1eacdc86015aa4c' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 68147852, sha256: 'aebc2789cd2ef8062fbda020bac90b61e68458ba98a4c43cea63c1d2310ba2b8' },
        { file: 'generation_config.json', bytes: 293, sha256: 'bab9fcae043547da07e13c701f77cf55b6b1517d6f73848c5c4476e7255da512' },
        { file: 'tokenizer.json', bytes: 7942314, sha256: 'c19e1dac8287ec5c5d47a0d81be5e0fd11755666b996c764ef4d13bb8117e3a2' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'b0039f5c755ca180319fc4cd689398a62cd4a67042538158271f199437f0cccd' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '4b82a23b7a91b213a934db70d0a33712a739fdd7c5686b02d89642d7dcfc7ac4' },
        { file: 'onnx/encoder_model.onnx', bytes: 241432364, sha256: '89f9ba4c549438d78606622334f070565b23ff4408e43b7e2b0c2ddf67c15389' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 267394892, sha256: '62bebc21b22a969a674458bb26a2b2188e0fc4e89321df3ef0890d7902643152' },
        { file: 'generation_config.json', bytes: 293, sha256: 'bab9fcae043547da07e13c701f77cf55b6b1517d6f73848c5c4476e7255da512' },
        { file: 'tokenizer.json', bytes: 7942314, sha256: 'c19e1dac8287ec5c5d47a0d81be5e0fd11755666b996c764ef4d13bb8117e3a2' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'b0039f5c755ca180319fc4cd689398a62cd4a67042538158271f199437f0cccd' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-nl',
    revision: 'c3a0541231a7329b4492809fc2bd7ab7d2ceb0bc',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '3469caf791a6a038451e418d4254434087c94afc7d9676c03d38b9c64ce258c5' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 53937565, sha256: '0febb990f8ca8ed9fd3e0017dfcb55ec5293999f20ead81d2bb4370e9e3120ff' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 61258735, sha256: '5f8034fddc4cdcb6fa6c3b64a06e1cd9b1955c0c6dcd13e0e47610ab99ac4a99' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd22743c9c80fd838a33581944bdbe6f86b1374ec5d851d954430dd3f2d2552d1' },
        { file: 'tokenizer.json', bytes: 6433167, sha256: 'c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '75fc8adb60ba4b1d9fd242e0c73e1e38e9571e6822a2601ab78dd917fddaadfe' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '3469caf791a6a038451e418d4254434087c94afc7d9676c03d38b9c64ce258c5' },
        { file: 'onnx/encoder_model.onnx', bytes: 214089516, sha256: '7694d0270f143ad4c2faf4865552272629826e3babe5dee2a0b86b674cf9e8b7' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 239998640, sha256: 'e8c860569f64844dfe9a70c3859675ad9864c09541038dd5a9139f3794e68dc1' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd22743c9c80fd838a33581944bdbe6f86b1374ec5d851d954430dd3f2d2552d1' },
        { file: 'tokenizer.json', bytes: 6433167, sha256: 'c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '75fc8adb60ba4b1d9fd242e0c73e1e38e9571e6822a2601ab78dd917fddaadfe' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-nl-en',
    revision: '82c42d95d1508037cbe7172d85fd4e940a2f3584',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: 'e03f36d5475954f1c09b08d0da68d6ea06a051e299a399e740554ed768d2a99c' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 53937566, sha256: '7b8b1e9071bed8e2394e3bd2f65b952700b1dd1293d087141134c8bac018653b' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 61258736, sha256: 'ad4df9a08f16952c0d9ee06807f54d62fcd07a9109c2c0b8ea05a4422d7bf4d7' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b11b1ae60dbb7656d021197a8883e81004dbdb74652df9d113f2efe2ca0dd974' },
        { file: 'tokenizer.json', bytes: 6433167, sha256: 'c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '7e7b5a6712709169fe3bcd7fe1bfb851310e09b4ef70a7e39b176de30e420657' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: 'e03f36d5475954f1c09b08d0da68d6ea06a051e299a399e740554ed768d2a99c' },
        { file: 'onnx/encoder_model.onnx', bytes: 214089516, sha256: 'a52bc3d8940c1304d616ecd9b04a6440aa5ed22e9196ece10f4bdd1046899207' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 239998640, sha256: '92d017a39a5e24541fd93744c92c5c31c0e27591af8691cf327572e74586b7f1' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b11b1ae60dbb7656d021197a8883e81004dbdb74652df9d113f2efe2ca0dd974' },
        { file: 'tokenizer.json', bytes: 6433167, sha256: 'c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '7e7b5a6712709169fe3bcd7fe1bfb851310e09b4ef70a7e39b176de30e420657' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-ru',
    revision: 'e050376e960175e8ddc5cff85025dc8436cddd68',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: 'db16bf0ea7bac239273214c3b9ab44577884227371a9a25e0191b7baf8d6f167' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51628446, sha256: '97f28d8295d231b7da721ded06fa8c034787df2122cd8f85b904abdc4d15bd53' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58931576, sha256: '7efefcd793a5663bc204224a92a123524f3dfe2ffad59e5f73d6734d1b11ad04' },
        { file: 'generation_config.json', bytes: 293, sha256: '885345001ac4f978b5e295a04eb6bd6c346ebc7381e30d5b3dd927b178d8a5ef' },
        { file: 'tokenizer.json', bytes: 7205388, sha256: '981cd3d9fef6bb4dda8082afda716b65deb6717cb3ef35ac0b57002c09dec2bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'cafb5494f14bc8d395cc02ddaeeb0f8d85b0d9e20fd48371b5edc104cc2020ba' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: 'db16bf0ea7bac239273214c3b9ab44577884227371a9a25e0191b7baf8d6f167' },
        { file: 'onnx/encoder_model.onnx', bytes: 204853036, sha256: '88f255c26c365b6fa392decec648ab9fc78f558900b395c5245f998e694b66ba' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 230744120, sha256: '0686150fa652d177b0a9eee70f81851d921d2ad169535697a109e3c9878be581' },
        { file: 'generation_config.json', bytes: 293, sha256: '885345001ac4f978b5e295a04eb6bd6c346ebc7381e30d5b3dd927b178d8a5ef' },
        { file: 'tokenizer.json', bytes: 7205388, sha256: '981cd3d9fef6bb4dda8082afda716b65deb6717cb3ef35ac0b57002c09dec2bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'cafb5494f14bc8d395cc02ddaeeb0f8d85b0d9e20fd48371b5edc104cc2020ba' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-ru-en',
    revision: 'afe8c6c738ec81b6d033fd8f44f9678a639a7c67',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '60dc7d0906dbe42a1d740cdd7e84ce1534685b81fbe16005a0301adac69086ce' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51628446, sha256: 'c10df0466540534bb70c4402d539c349b8bfa9968184cad89f51408cf13e7eb7' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58931576, sha256: '25e7ff97b201bce64ab9c39749761d657b70b8602bcbc1ce01c67f713e90ffdf' },
        { file: 'generation_config.json', bytes: 293, sha256: '9bcb507fa6117b07870df6627294b878b0710a55bc3abc9cf0db980e0c48fe2c' },
        { file: 'tokenizer.json', bytes: 7205388, sha256: '981cd3d9fef6bb4dda8082afda716b65deb6717cb3ef35ac0b57002c09dec2bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'c0710ba5ee70ccb2d0e6b0092139d00f370b9c4783c4b077584cb3cc8f7ac4e0' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '60dc7d0906dbe42a1d740cdd7e84ce1534685b81fbe16005a0301adac69086ce' },
        { file: 'onnx/encoder_model.onnx', bytes: 204853036, sha256: '0663f554a1dc9db914d8ca30fd779803bc5f41a5cd41acd838130be2f41eedeb' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 230744120, sha256: '6488b9b9591c5b61b221b14ab1fa5c0683da6a8c42071241ca36b63d82b5ab11' },
        { file: 'generation_config.json', bytes: 293, sha256: '9bcb507fa6117b07870df6627294b878b0710a55bc3abc9cf0db980e0c48fe2c' },
        { file: 'tokenizer.json', bytes: 7205388, sha256: '981cd3d9fef6bb4dda8082afda716b65deb6717cb3ef35ac0b57002c09dec2bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'c0710ba5ee70ccb2d0e6b0092139d00f370b9c4783c4b077584cb3cc8f7ac4e0' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-zh',
    revision: '046f55aec303cdee3e0318604406d4df20f1e8ea',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1503, sha256: '4727d1229a04f95bf6f39abf949d8080615433d99d6ebd85f81c09edd247d5fa' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 52899742, sha256: 'd3b7912bf6a9bd27e4c074c2df91d4ff3d5b4bc5f7f6c8d7cc9c805c98fbafee' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 60212804, sha256: '023be4f841f4c47cd65fffcbaa81c0d99d7f7e0138f7ba0e03fa220a4e688aff' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6380952, sha256: 'd0c7da27056e8f42adce9e76d8e792e5daa64e15f5acd2e7aabf0121877dd4c1' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'a914596e6bff113a8428d4793b586da87cd0b95697a0e72aba90cc1d95858481' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1503, sha256: '4727d1229a04f95bf6f39abf949d8080615433d99d6ebd85f81c09edd247d5fa' },
        { file: 'onnx/encoder_model.onnx', bytes: 209938220, sha256: '6948db6bbc4869581eddf935d8486ca96388e4395c06a86c35e4051cb11373b9' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 235839236, sha256: '5cb22f9ac32429b8211ae45e5940d9c05dfd66cf5847fd349ac6e391cd671e1d' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6380952, sha256: 'd0c7da27056e8f42adce9e76d8e792e5daa64e15f5acd2e7aabf0121877dd4c1' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'a914596e6bff113a8428d4793b586da87cd0b95697a0e72aba90cc1d95858481' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-zh-en',
    revision: '39d480d52a9ea3065a1f117adfe4dbc55de10e6f',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1389, sha256: '293d318fce41dbf04114eac45037bb88a32d7c4ee21011a75e24a8b98ca45ad1' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 52899742, sha256: '84d5e171b626bc8b6b220d022ac58696e9528c25deeacca62b5cbf4364547a99' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 60212804, sha256: 'c6b7f04ff1ba0fbd1bf6852599b4c0cad6fe512d57cd887f44ef36cf705424cb' },
        { file: 'generation_config.json', bytes: 293, sha256: '8dc29fef0fe82109f94ef3c2e6ea6bded3215d357b226c34cf7b4630726766c9' },
        { file: 'tokenizer.json', bytes: 6381339, sha256: 'b306d0301cf280bfd647d7067b5ade2a97b987e6d678df110703c002433643ff' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '08849acc0a539c4749d8665e9d6217735503a97871ccebeea8a762d5fba1acf7' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1389, sha256: '293d318fce41dbf04114eac45037bb88a32d7c4ee21011a75e24a8b98ca45ad1' },
        { file: 'onnx/encoder_model.onnx', bytes: 209938220, sha256: '555761f7077f36ee3e8349a8892002ae9995fa572381ebc6dbca322f99f6cd72' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 235839236, sha256: 'f1851afa4323c5218cc8da0585c4f4e73aa1ea675de62138016ca4173ba85aff' },
        { file: 'generation_config.json', bytes: 293, sha256: '8dc29fef0fe82109f94ef3c2e6ea6bded3215d357b226c34cf7b4630726766c9' },
        { file: 'tokenizer.json', bytes: 6381339, sha256: 'b306d0301cf280bfd647d7067b5ade2a97b987e6d678df110703c002433643ff' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '08849acc0a539c4749d8665e9d6217735503a97871ccebeea8a762d5fba1acf7' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-ar',
    revision: '034a684356c19021a187cda4d7f823298b913921',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1389, sha256: '8135d646cd810090349e8833b7ba593ac3b72d632f8858cb34925bdbcb6a1bea' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51773854, sha256: '53c354d87ced44b39085fe8a46a25f09ea4578d442dbce9663f3977228f8a04e' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 59078120, sha256: 'c0e553b0c26611780c70417c9b4c1ca7169e9cdb18ba9e649197efb017af9f02' },
        { file: 'generation_config.json', bytes: 293, sha256: 'fb6be7759d385eea2d9f79f767fa80669e9ba74ba02de1db6ec9dbc950cf20f0' },
        { file: 'tokenizer.json', bytes: 6748848, sha256: '109bb62e1c598287f5960616c869e15be54785a3c2906903dafe044241d50b61' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '2ab016d442c2d3271a04547586a68322e9aedb65097349482d5374fe6d8abde2' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1389, sha256: '8135d646cd810090349e8833b7ba593ac3b72d632f8858cb34925bdbcb6a1bea' },
        { file: 'onnx/encoder_model.onnx', bytes: 205434668, sha256: 'ec4d2c96f062a310868aeddbed74717109db4a6ceebf9e19dc39208199e59912' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 231326888, sha256: 'eaaff5593905594e6712d18b8fcdf22da0a6320dea7f0b3696c362b823dd7876' },
        { file: 'generation_config.json', bytes: 293, sha256: 'fb6be7759d385eea2d9f79f767fa80669e9ba74ba02de1db6ec9dbc950cf20f0' },
        { file: 'tokenizer.json', bytes: 6748848, sha256: '109bb62e1c598287f5960616c869e15be54785a3c2906903dafe044241d50b61' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '2ab016d442c2d3271a04547586a68322e9aedb65097349482d5374fe6d8abde2' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-ar-en',
    revision: '09c7556866400dcc53562ba8d7035119e7d9a2c1',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '451ee0da95b01fe58d78f05c47e9ad89f0a17a4c03dcecb389136a12248ef9aa' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51790238, sha256: 'd9b0d612acff86cf87634b49bda566d1ef39b312837de549786ea18fecefc708' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 59094632, sha256: 'cdb25ae736afe9d48035b0ea311ab4b25f315810fab7f3c6f6cb0d8d87af35fa' },
        { file: 'generation_config.json', bytes: 293, sha256: '6e240dc18d20cceb870d47706c90126a801f246db6009f9e02171795e9f93772' },
        { file: 'tokenizer.json', bytes: 6734647, sha256: '86c78b55d2428e4479e21ce4c27266f7c5e1d52bcabcadff29bfda77f6ad3200' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '3d4d5af649635fabf681f0618849ada5b872f72d025d6297896d46ddf5ce3770' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '451ee0da95b01fe58d78f05c47e9ad89f0a17a4c03dcecb389136a12248ef9aa' },
        { file: 'onnx/encoder_model.onnx', bytes: 205500204, sha256: '1e32a06d492e9c8e909f96c7ef1dfbbb86199ec506b66ec27f6655eebeac5b2b' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 231392552, sha256: 'b0113ffe211c4d84afbb7f537900aa47b526dc276bfb57826458040515578f18' },
        { file: 'generation_config.json', bytes: 293, sha256: '6e240dc18d20cceb870d47706c90126a801f246db6009f9e02171795e9f93772' },
        { file: 'tokenizer.json', bytes: 6734647, sha256: '86c78b55d2428e4479e21ce4c27266f7c5e1d52bcabcadff29bfda77f6ad3200' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '3d4d5af649635fabf681f0618849ada5b872f72d025d6297896d46ddf5ce3770' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-hi',
    revision: '7aad72006a1588a9c3485ed6203aed99eebbc872',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1389, sha256: '2f7015bbf571018afd1a365d1ade99a648bc89edf3146be93ec0e23cbffd6302' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51337630, sha256: '3045cd6eaf06db96cff853204d6f0ffeb0c5af238a4f5a87a19fcaa94f7493c4' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58638488, sha256: '8baba43a14b15ca4543d30ab36e7d34f2e516fb9af7e0b83b77a5e6a6f66d198' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd5ed4557b625766a952b6840deb40ec48fb7fb7e3a26014fa5f677e78bed0404' },
        { file: 'tokenizer.json', bytes: 6679560, sha256: 'f493d2d245a353cf9cb3d7f92ef60fd8d65f88efc91d73a1e22ee0f714a68928' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'afb1524d71a7f14b031f41bd0e72c994b48a447c95ac565aba3fdb1f2707ebfe' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1389, sha256: '2f7015bbf571018afd1a365d1ade99a648bc89edf3146be93ec0e23cbffd6302' },
        { file: 'onnx/encoder_model.onnx', bytes: 203689772, sha256: '24e38987e9dd8726575e57298ad94f18a76f963bfe9d60dd48a9b2158a6eb908' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 229578584, sha256: '756edc56805b3a0cacb6b3b1388182f5ac4cd26d926d585e4ec5bea79830b7c1' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd5ed4557b625766a952b6840deb40ec48fb7fb7e3a26014fa5f677e78bed0404' },
        { file: 'tokenizer.json', bytes: 6679560, sha256: 'f493d2d245a353cf9cb3d7f92ef60fd8d65f88efc91d73a1e22ee0f714a68928' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: 'afb1524d71a7f14b031f41bd0e72c994b48a447c95ac565aba3fdb1f2707ebfe' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-hi-en',
    revision: '99853100ed9d932987a6816e8cf7b1b6742a6116',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '871af963159a6d00721312fc21782633a389461b6dab23c76cd7c0e68236764d' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 50916254, sha256: 'dc5a1b084a83019bbb9798809dea5f2d16cc30a9a257238ec93120b3c2892ebf' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58213820, sha256: '52655659006c8ce742cc761282d49b3be4e73bfbf080f1b6a546aa96170d5813' },
        { file: 'generation_config.json', bytes: 293, sha256: 'be22547557d41d19e39168d15ff37b0ed4accc2c2875f9ab7172df10ac558b95' },
        { file: 'tokenizer.json', bytes: 6578153, sha256: 'bcf130f7fd0c371040618d74b6f19cf252d73c6734443676016302e4b94d78bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'c70075dfbc0b9811f62f81f6220eeb7b9733d263018087bf4ddee9d92eb2e14f' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '871af963159a6d00721312fc21782633a389461b6dab23c76cd7c0e68236764d' },
        { file: 'onnx/encoder_model.onnx', bytes: 202004268, sha256: 'b8a616375f15409afc17b87722aebd420114562ef7417f8762b66ea93291452e' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 227889788, sha256: 'a593643aed05d3a9df0199870033552e3af419dca95453bb8d50dd00478decab' },
        { file: 'generation_config.json', bytes: 293, sha256: 'be22547557d41d19e39168d15ff37b0ed4accc2c2875f9ab7172df10ac558b95' },
        { file: 'tokenizer.json', bytes: 6578153, sha256: 'bcf130f7fd0c371040618d74b6f19cf252d73c6734443676016302e4b94d78bb' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'c70075dfbc0b9811f62f81f6220eeb7b9733d263018087bf4ddee9d92eb2e14f' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-fi',
    revision: '4e5799273dbd7cce94c1e99cc9d3acb9f191b8eb',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1356, sha256: 'ae3b9d95d8e812898f9fdf6b18d0c8a594b2514b604dfb391947bf1086093be4' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 52899742, sha256: '874d962be7b3d5dadae3e98a156b2df0344febaa17809f6f0411ce23a59ff4c3' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 60212804, sha256: '58759988d510656029ef9ea744efdda9fd66dbfb689333abe7fb29bca7b239f3' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6315513, sha256: 'de8ac950e41165f4592c7ee3b2f5a42e34d948090b806f5d74b9a8e0e5822bf6' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '4904427e3a5d6085671b478a13746ab173632a861b0da9962c4ef6473d3dfd19' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1356, sha256: 'ae3b9d95d8e812898f9fdf6b18d0c8a594b2514b604dfb391947bf1086093be4' },
        { file: 'onnx/encoder_model.onnx', bytes: 209938220, sha256: '7b599fcaf4c3d4bb4983be5eac093128ba3eb38153dd0ecf4c76c9572a390ee2' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 235839236, sha256: '9010a890e540f69db9a8fa2708b11acc41189b685abb59755ef8383ff5399ce0' },
        { file: 'generation_config.json', bytes: 293, sha256: 'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803' },
        { file: 'tokenizer.json', bytes: 6315513, sha256: 'de8ac950e41165f4592c7ee3b2f5a42e34d948090b806f5d74b9a8e0e5822bf6' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '4904427e3a5d6085671b478a13746ab173632a861b0da9962c4ef6473d3dfd19' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-fi-en',
    revision: 'a623e4812687be788e3ab720c8a950ab64704793',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1389, sha256: '9ff0e3a1c47345550bc568858b9e2817011f20a798886e31f2610d4d179d370d' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 50164638, sha256: '3891d400cfe8693a6f590078302dabc15cbc7289e194a9261d90eceee573dc82' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 57456332, sha256: '320fb97fed0f0989a3a1a4777f77a8b236f41c2b59c4503f659f5eea5b5f01c6' },
        { file: 'generation_config.json', bytes: 293, sha256: 'deef95e5cfc235e8a322b0037159c2a62ab2efe577271da88537a9ff67170cba' },
        { file: 'tokenizer.json', bytes: 5772430, sha256: 'bcd82fcb3b9137047f6391e38a787e14935e9c24f99858845275acbac8443f76' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '02146e5a41e4ce121a8b3615563d513b284d42dc3923e617d1885a9cba366c10' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1389, sha256: '9ff0e3a1c47345550bc568858b9e2817011f20a798886e31f2610d4d179d370d' },
        { file: 'onnx/encoder_model.onnx', bytes: 198997804, sha256: '52046f14da1415b1ca24a1f093495184e7aa2f6cac1a5e3e2c9c9ada3c1cbbca' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 224877452, sha256: '84c27d0c6f373ac705ecb227a88b034b56f811019f785cdd144bfda5696bb049' },
        { file: 'generation_config.json', bytes: 293, sha256: 'deef95e5cfc235e8a322b0037159c2a62ab2efe577271da88537a9ff67170cba' },
        { file: 'tokenizer.json', bytes: 5772430, sha256: 'bcd82fcb3b9137047f6391e38a787e14935e9c24f99858845275acbac8443f76' },
        { file: 'tokenizer_config.json', bytes: 282, sha256: '02146e5a41e4ce121a8b3615563d513b284d42dc3923e617d1885a9cba366c10' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-uk',
    revision: 'e6ca587292984b343fd829b6430ed55858496525',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: 'ebc0566353109870e23f338060577d54803ca5d6eb97f1752d53f7402ab92dfb' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51151774, sha256: '234c3738c258b3b7c913452a4ab6203b1a24f459355af8ef563dd4d94792d087' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58451180, sha256: '0892312ea1d359fb749b16deb5005246eb17974bd2b5424344b0e9ae83e0a142' },
        { file: 'generation_config.json', bytes: 293, sha256: '7a2d44fec0c90d2131a5d7c7097122a0679c5525d2b43709a26e261784b5b264' },
        { file: 'tokenizer.json', bytes: 6922026, sha256: '48957126b17d9c51d0331a64da2761a83f359d5b1365d629bb1599ae64269530' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '99508ffbf78bddc5d872e78d93de3905e133c6a68a923730b9402a0ec28ce0c9' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: 'ebc0566353109870e23f338060577d54803ca5d6eb97f1752d53f7402ab92dfb' },
        { file: 'onnx/encoder_model.onnx', bytes: 202946348, sha256: 'c19ceebde08e5bd62de1e5badd618d1f2ed092b8397aaf5a60f450da54533e90' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 228833708, sha256: '1c2373ce4a47c70a30d94a831f4575dd73dcd9b442d7228b6e87d8b7c815f170' },
        { file: 'generation_config.json', bytes: 293, sha256: '7a2d44fec0c90d2131a5d7c7097122a0679c5525d2b43709a26e261784b5b264' },
        { file: 'tokenizer.json', bytes: 6922026, sha256: '48957126b17d9c51d0331a64da2761a83f359d5b1365d629bb1599ae64269530' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '99508ffbf78bddc5d872e78d93de3905e133c6a68a923730b9402a0ec28ce0c9' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-uk-en',
    revision: 'b2ad6afa424aaeff8913ff350860b7a7b7c0a607',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '40aceb41a0b2d5822100b08cf6b80f13a246e1104ec4bdf0904d62661b75063a' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 51151774, sha256: '5e8c4c7e88742efa0a8e013f3897f17e29357d54b8c86a13472669546d6ed561' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 58451180, sha256: 'ffa6d28d5fa0ff4ed930969d9ca4bac2d80ff11172198e93dc6332db49ddb36b' },
        { file: 'generation_config.json', bytes: 293, sha256: '9a6f914ef5d416c657006f95d60d09acea0b804cf428ac802f4ce80bc89ae369' },
        { file: 'tokenizer.json', bytes: 6922026, sha256: '48957126b17d9c51d0331a64da2761a83f359d5b1365d629bb1599ae64269530' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '00457d284068498f364aae9ad88ea377f3fc28cb11a27f5847af56704b88df81' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '40aceb41a0b2d5822100b08cf6b80f13a246e1104ec4bdf0904d62661b75063a' },
        { file: 'onnx/encoder_model.onnx', bytes: 202946348, sha256: 'a9d387cbd71b38e0b5ee9dc97e7177e8e55a5cba6d0eb597e43c718c7ba6d49f' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 228833708, sha256: '31748a42ea6ee3be92fa5fa7aec3a75bdc2daa144b8a3af4803f55a6caf5a72e' },
        { file: 'generation_config.json', bytes: 293, sha256: '9a6f914ef5d416c657006f95d60d09acea0b804cf428ac802f4ce80bc89ae369' },
        { file: 'tokenizer.json', bytes: 6922026, sha256: '48957126b17d9c51d0331a64da2761a83f359d5b1365d629bb1599ae64269530' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: '00457d284068498f364aae9ad88ea377f3fc28cb11a27f5847af56704b88df81' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-en-sv',
    revision: '33d522d806c041cdebecd549c558d22a2b9b4ea4',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: '5e2d3cf07dc92aa6c6dd82b9d552a4c1d7ef43f60c5054804ac2e4ee232e552d' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 48513438, sha256: '2477c172f2001ee486f2d21e452c4d74838af973dfb58d00cf53632c2e3f3dba' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 55792232, sha256: '9aa80d76a5c67a89e208367cb0b3315dffbedcc685ce86da0ef9b99442695ee3' },
        { file: 'generation_config.json', bytes: 293, sha256: '8fed8ec9cfe554d1ecdb910ad34401db8d74e4242eee1881cb35e9414aa81c3b' },
        { file: 'tokenizer.json', bytes: 5450794, sha256: '63498964420ffe2b50435706b4bf7873ea7083103a82dff908b21a6d50a6ebf0' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e6d2a6283e54807ebb63d1136d8383e8ad5fd1543cd3071fea6d29cc19e037e6' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: '5e2d3cf07dc92aa6c6dd82b9d552a4c1d7ef43f60c5054804ac2e4ee232e552d' },
        { file: 'onnx/encoder_model.onnx', bytes: 192393004, sha256: '8d16d3fa8e93123a5b50a0f8ddd32a469b1839f3d92a35fd2c94dc83e4f528b1' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 218259752, sha256: '901d7521f06d014225aac6da7df057057e853482a5cd7f6350717f398bd87cb7' },
        { file: 'generation_config.json', bytes: 293, sha256: '8fed8ec9cfe554d1ecdb910ad34401db8d74e4242eee1881cb35e9414aa81c3b' },
        { file: 'tokenizer.json', bytes: 5450794, sha256: '63498964420ffe2b50435706b4bf7873ea7083103a82dff908b21a6d50a6ebf0' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e6d2a6283e54807ebb63d1136d8383e8ad5fd1543cd3071fea6d29cc19e037e6' },
      ],
    },
  },
  {
    repo: 'Xenova/opus-mt-sv-en',
    revision: '63a40256869b6a2b29a84e47aa7f03524fa5f3a2',
    dtypes: {
      q8: [
        { file: 'config.json', bytes: 1376, sha256: 'dfcd75781057f34a0fe027f3c85336b88b8a0c9ae788575bb8057281872623d5' },
        { file: 'onnx/encoder_model_quantized.onnx', bytes: 48513438, sha256: '07ae6446ef6520117da869986e396ee55b05c471124ff851399701253fb306cc' },
        { file: 'onnx/decoder_model_merged_quantized.onnx', bytes: 55792232, sha256: '29973afcd575cc61d17133d432fa1a81d8ba1f4b717b247384c2eb11342a472d' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd23b5d0f0db412f5034e879bc454b8dafc2390bc06b3c6ec5acb54d54634067b' },
        { file: 'tokenizer.json', bytes: 5450794, sha256: '63498964420ffe2b50435706b4bf7873ea7083103a82dff908b21a6d50a6ebf0' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e982871087cf02c3c3765a5747b48e0d4e3fa31c17cb52c45cb74819eb239bb2' },
      ],
      fp32: [
        { file: 'config.json', bytes: 1376, sha256: 'dfcd75781057f34a0fe027f3c85336b88b8a0c9ae788575bb8057281872623d5' },
        { file: 'onnx/encoder_model.onnx', bytes: 192393004, sha256: '01bade2787bd89a59ddc366b4eeedeaa79e3b1b4ee0555bbdfa67078a6719b19' },
        { file: 'onnx/decoder_model_merged.onnx', bytes: 218259752, sha256: '302d30373d3afef8be538d692b5a30ed447fcfebc91a46c708aad3904c465d5a' },
        { file: 'generation_config.json', bytes: 293, sha256: 'd23b5d0f0db412f5034e879bc454b8dafc2390bc06b3c6ec5acb54d54634067b' },
        { file: 'tokenizer.json', bytes: 5450794, sha256: '63498964420ffe2b50435706b4bf7873ea7083103a82dff908b21a6d50a6ebf0' },
        { file: 'tokenizer_config.json', bytes: 280, sha256: 'e982871087cf02c3c3765a5747b48e0d4e3fa31c17cb52c45cb74819eb239bb2' },
      ],
    },
  },
];

/** The MediaPipe language detector: model file, its digest, and the pinned WASM path of tasks-text. */
export const PINNED_MEDIAPIPE_LANGUAGE_DETECTOR = {
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite',
  modelBytes: 315294,
  modelSha256: '7db4f23dfe1ad8966b050b419a865da451143fd43eb6b606a256aadeeb1e5417',
  wasmBasePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-text@0.10.35/wasm',
  tasksTextVersion: '0.10.35',
} as const;
