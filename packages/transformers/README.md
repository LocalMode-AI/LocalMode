# @localmode/transformers

HuggingFace Transformers.js provider for LocalMode — run ML models locally in the browser.

[![npm](https://img.shields.io/npm/v/@localmode/transformers)](https://www.npmjs.com/package/@localmode/transformers)
[![license](https://img.shields.io/npm/l/@localmode/transformers)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/transformers)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- **Browser-Native** - Run ML models directly in the browser with WebGPU/WASM
- **Privacy-First** - All processing happens locally, no data leaves the device
- **Model Caching** - Models are cached in IndexedDB for instant subsequent loads
- **Optimized** - Uses quantized models for smaller size and faster inference

## Installation

```bash
pnpm install @localmode/transformers @localmode/core
```

## Overview

`@localmode/transformers` provides model implementations for the interfaces defined in `@localmode/core`. It wraps HuggingFace Transformers.js to enable local ML inference in the browser.

---

## Provider API

All models are created via the `transformers` provider object. Each factory method returns a model implementing a `@localmode/core` interface.

### Embeddings — [Docs](https://localmode.dev/docs/transformers/embeddings)

```typescript
import { embed, embedMany } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const embeddingModel = transformers.embedding('Xenova/bge-small-en-v1.5');

const { embedding } = await embed({ model: embeddingModel, value: 'Hello world' });
const { embeddings } = await embedMany({ model: embeddingModel, values: ['Hello', 'World'] });
```

| Method | Interface | Description |
| ------ | --------- | ----------- |
| `transformers.embedding(modelId)` | `EmbeddingModel` | Text embeddings |

**Recommended Models:**

- `Xenova/all-MiniLM-L6-v2` - Fast, general-purpose (~22MB)
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` - 50+ languages

### Multimodal Embeddings (CLIP/SigLIP) — [Docs](https://localmode.dev/docs/transformers/multimodal-embeddings)

Embed both text and images into the same vector space for cross-modal search.

```typescript
import { embed, embedImage, cosineSimilarity } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const model = transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32');

// Text embedding
const { embedding: textVec } = await embed({ model, value: 'a photo of a cat' });

// Image embedding (same vector space)
const { embedding: imgVec } = await embedImage({ model, image: catImageBlob });

// Cross-modal similarity
const similarity = cosineSimilarity(textVec, imgVec);
```

| Method                                       | Interface                    | Description              |
| -------------------------------------------- | ---------------------------- | ------------------------ |
| `transformers.multimodalEmbedding(modelId)`  | `MultimodalEmbeddingModel`   | Text + image embeddings  |

**Recommended Models:**

- `Xenova/clip-vit-base-patch32` - Fast, 512 dimensions
- `Xenova/clip-vit-base-patch16` - Better accuracy, 512 dimensions

### Reranking — [Docs](https://localmode.dev/docs/transformers/reranking)

```typescript
import { rerank } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const rerankerModel = transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2');

const { results } = await rerank({
  model: rerankerModel,
  query: 'What is machine learning?',
  documents: ['ML is a subset of AI...', 'Python is a language...'],
  topK: 5,
});
```

| Method | Interface | Description |
| ------ | --------- | ----------- |
| `transformers.reranker(modelId)` | `RerankerModel` | Document reranking |

### Classification & NLP — [Docs](https://localmode.dev/docs/transformers/classification)

```typescript
import { classify, extractEntities } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const sentiment = await classify({
  model: transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english'),
  text: 'I love this product!',
});

const entities = await extractEntities({
  model: transformers.ner('Xenova/bert-base-NER'),
  text: 'John works at Microsoft in Seattle',
});
```

| Method | Interface | Description |
| ------ | --------- | ----------- |
| `transformers.classifier(modelId)` | `ClassificationModel` | Text classification |
| `transformers.zeroShot(modelId)` | `ZeroShotClassificationModel` | Zero-shot text classification |
| `transformers.ner(modelId)` | `NERModel` | Named Entity Recognition |

### Translation & Summarization

| Method | Interface | Description | Docs |
| ------ | --------- | ----------- | ---- |
| `transformers.translator(modelId)` | `TranslationModel` | Text translation | [Docs](https://localmode.dev/docs/transformers/translation) |
| `transformers.summarizer(modelId)` | `SummarizationModel` | Text summarization | [Docs](https://localmode.dev/docs/transformers/summarization) |
| `transformers.fillMask(modelId)` | `FillMaskModel` | Masked token prediction | [Docs](https://localmode.dev/docs/transformers/fill-mask) |
| `transformers.questionAnswering(modelId)` | `QuestionAnsweringModel` | Extractive QA | [Docs](https://localmode.dev/docs/transformers/question-answering) |

### Audio

```typescript
import { transcribe, synthesizeSpeech } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const transcription = await transcribe({
  model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
  audio: audioBlob,
  returnTimestamps: true,
});

const { audio, sampleRate } = await synthesizeSpeech({
  model: transformers.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX'),
  text: 'Hello, how are you?',
});
```

| Method | Interface | Description | Docs |
| ------ | --------- | ----------- | ---- |
| `transformers.speechToText(modelId)` | `SpeechToTextModel` | Speech-to-text transcription | [Docs](https://localmode.dev/docs/transformers/speech-to-text) |
| `transformers.textToSpeech(modelId)` | `TextToSpeechModel` | Text-to-speech synthesis | [Docs](https://localmode.dev/docs/transformers/text-to-speech) |
| `transformers.audioClassifier(modelId)` | `AudioClassificationModel` | Audio classification | |
| `transformers.zeroShotAudioClassifier(modelId)` | `ZeroShotAudioClassificationModel` | Zero-shot audio classification | |

### Vision

```typescript
import { classifyImage, captionImage } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const classification = await classifyImage({
  model: transformers.imageClassifier('Xenova/vit-base-patch16-224'),
  image: imageBlob,
});

const caption = await captionImage({
  model: transformers.captioner('onnx-community/Florence-2-base-ft'),
  image: imageBlob,
});
```

| Method | Interface | Description | Docs |
| ------ | --------- | ----------- | ---- |
| `transformers.imageClassifier(modelId)` | `ImageClassificationModel` | Image classification | [Docs](https://localmode.dev/docs/transformers/image-classification) |
| `transformers.zeroShotImageClassifier(modelId)` | `ZeroShotImageClassificationModel` | Zero-shot image classification | [Docs](https://localmode.dev/docs/transformers/zero-shot-image) |
| `transformers.captioner(modelId)` | `ImageCaptionModel` | Image captioning | [Docs](https://localmode.dev/docs/transformers/image-captioning) |
| `transformers.segmenter(modelId)` | `SegmentationModel` | Image segmentation | [Docs](https://localmode.dev/docs/transformers/image-segmentation) |
| `transformers.objectDetector(modelId)` | `ObjectDetectionModel` | Object detection | [Docs](https://localmode.dev/docs/transformers/object-detection) |
| `transformers.imageFeatures(modelId)` | `ImageFeatureModel` | Image feature extraction | [Docs](https://localmode.dev/docs/transformers/image-features) |
| `transformers.imageToImage(modelId)` | `ImageToImageModel` | Image super resolution | [Docs](https://localmode.dev/docs/transformers/image-to-image) |
| `transformers.depthEstimator(modelId)` | `DepthEstimationModel` | Monocular depth estimation | |

### OCR & Document QA

| Method | Interface | Description | Docs |
| ------ | --------- | ----------- | ---- |
| `transformers.ocr(modelId)` | `OCRModel` | OCR (TrOCR) | [Docs](https://localmode.dev/docs/transformers/ocr) |
| `transformers.documentQA(modelId)` | `DocumentQAModel` | Document/Table question answering | [Docs](https://localmode.dev/docs/transformers/document-qa) |

### Text Generation (Experimental) — [Docs](https://localmode.dev/docs/transformers/text-generation)

> **Experimental**: Uses Transformers.js v4 (preview release). The API may change.

Run ONNX-format language models in the browser with WebGPU acceleration:

```typescript
import { generateText, streamText } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const model = transformers.languageModel('onnx-community/Qwen3.5-0.8B-ONNX');

// Single-shot generation
const { text } = await generateText({ model, prompt: 'What is 2+2?' });

// Streaming generation
const result = await streamText({ model, prompt: 'Write a haiku' });
for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

| Method | Interface | Description |
| ------ | --------- | ----------- |
| `transformers.languageModel(modelId)` | `LanguageModel` | Text generation (ONNX, WebGPU/WASM) |

**Recommended ONNX LLMs:**

| Model | Size | Context | Vision |
| ----- | ---- | ------- | ------ |
| `onnx-community/Qwen3.5-0.8B-ONNX` | ~500MB | 32K | Yes |
| `onnx-community/Qwen3.5-2B-ONNX` | ~1.5GB | 32K | Yes |
| `onnx-community/Qwen3.5-4B-ONNX` | ~2.5GB | 32K | Yes |
| `onnx-community/SmolLM2-360M-Instruct` | ~200MB | 2K | No |
| `onnx-community/SmolLM2-135M-Instruct` | ~80MB | 2K | No |

**Vision support**: Qwen3.5 models support image input via their built-in vision encoder. Check `model.supportsVision` for feature detection. See [Vision docs](https://localmode.dev/docs/transformers#vision-image-input--experimental) for usage.

---

## Model Utilities

```typescript
import { preloadModel, isModelCached, getModelStorageUsage } from '@localmode/transformers';

const cached = await isModelCached('Xenova/bge-small-en-v1.5');

await preloadModel('Xenova/bge-small-en-v1.5', {
  onProgress: (p) => console.log(`${p.progress}% loaded`),
});

const usage = await getModelStorageUsage();
```

---

## Recommended Models

### Embeddings

| Model | Description |
| ----- | ----------- |
| `Xenova/bge-small-en-v1.5` | Fast, general-purpose (~22MB, 384d) |
| `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 50+ languages (~120MB, 384d) |
| `Xenova/all-mpnet-base-v2` | Higher quality (~420MB, 768d) |
| `Snowflake/snowflake-arctic-embed-xs` | Tiny retrieval embeddings (~23MB, 384d) |

### Reranking

| Model | Description |
| ----- | ----------- |
| `Xenova/ms-marco-MiniLM-L-6-v2` | Fast, small (~23MB, recommended) |

### Text Classification

| Model | Description |
| ----- | ----------- |
| `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | Sentiment analysis |
| `Xenova/twitter-roberta-base-sentiment-latest` | Twitter sentiment |

### Zero-Shot Classification

| Model | Description |
| ----- | ----------- |
| `Xenova/mobilebert-uncased-mnli` | Fast, mobile-friendly (~21MB) |
| `Xenova/nli-deberta-v3-xsmall` | Mid-tier accuracy (~90MB) |

### Named Entity Recognition

| Model | Description |
| ----- | ----------- |
| `Xenova/bert-base-NER` | Standard NER (PER, ORG, LOC, MISC) |

### Translation

| Model | Description |
| ----- | ----------- |
| `Xenova/opus-mt-en-de` | English to German |
| `Xenova/opus-mt-en-fr` | English to French |
| `Xenova/opus-mt-en-es` | English to Spanish |

### Summarization

| Model | Description |
| ----- | ----------- |
| `Xenova/distilbart-cnn-6-6` | Best quality browser summarizer (~284MB) |

### Fill-Mask

| Model | Description |
| ----- | ----------- |
| `onnx-community/ModernBERT-base-ONNX` | General purpose (mask: `[MASK]`) |

### Question Answering

| Model | Description |
| ----- | ----------- |
| `Xenova/distilbert-base-cased-distilled-squad` | SQuAD trained (~65MB) |

### Speech-to-Text

| Model | Description |
| ----- | ----------- |
| `onnx-community/moonshine-tiny-ONNX` | Fast, edge-optimized (~50MB) |
| `onnx-community/moonshine-base-ONNX` | Best quality/size ratio (~237MB) |

### Text-to-Speech

| Model | Description |
| ----- | ----------- |
| `onnx-community/Kokoro-82M-v1.0-ONNX` | Natural speech, 28 voices (~86MB) |

### Image Classification

| Model | Description |
| ----- | ----------- |
| `Xenova/vit-base-patch16-224` | General image classification |
| `Xenova/siglip-base-patch16-224` | Zero-shot image classification (~400MB) |

### Image Captioning

| Model | Description |
| ----- | ----------- |
| `onnx-community/Florence-2-base-ft` | High-quality captions (~223MB) |

### Image Segmentation

| Model | Description |
| ----- | ----------- |
| `Xenova/segformer-b0-finetuned-ade-512-512` | Semantic segmentation (ADE20K) |

### Object Detection

| Model | Description |
| ----- | ----------- |
| `onnx-community/dfine_n_coco-ONNX` | State-of-the-art, tiny (~4.5MB) |
| `Xenova/yolos-tiny` | Fast detection |

### Image Features

| Model | Description |
| ----- | ----------- |
| `Xenova/siglip-base-patch16-224` | Image embeddings (768d) |
| `onnx-community/dinov2-base-ONNX` | Self-supervised features |

### Image Super Resolution

| Model | Description |
| ----- | ----------- |
| `Xenova/swin2SR-lightweight-x2-64` | 2x upscale, fast |
| `Xenova/swin2SR-classical-sr-x4-64` | 4x upscale |

### OCR

| Model | Description |
| ----- | ----------- |
| `Xenova/trocr-small-printed` | Printed text (~120MB) |
| `Xenova/trocr-small-handwritten` | Handwritten text (~120MB) |

### Document QA

| Model | Description |
| ----- | ----------- |
| `onnx-community/Florence-2-base-ft` | Document QA (~223MB) |
| `Xenova/donut-base-finetuned-docvqa` | Donut (~218MB) |

---

## Model Constants

All recommended models are exported as constants for easy reference:

```typescript
import {
  MODELS,                      // All models organized by task
  EMBEDDING_MODELS,
  CLASSIFICATION_MODELS,
  ZERO_SHOT_MODELS,
  NER_MODELS,
  RERANKER_MODELS,
  SPEECH_TO_TEXT_MODELS,
  TEXT_TO_SPEECH_MODELS,
  IMAGE_CLASSIFICATION_MODELS,
  ZERO_SHOT_IMAGE_MODELS,
  IMAGE_CAPTION_MODELS,
  TRANSLATION_MODELS,
  SUMMARIZATION_MODELS,
  FILL_MASK_MODELS,
  QUESTION_ANSWERING_MODELS,
  OBJECT_DETECTION_MODELS,
  SEGMENTATION_MODELS,
  OCR_MODELS,
  DOCUMENT_QA_MODELS,
  IMAGE_TO_IMAGE_MODELS,
  IMAGE_FEATURE_MODELS,
} from '@localmode/transformers';

// Use with provider
const model = transformers.embedding(EMBEDDING_MODELS.BGE_SMALL_EN);
```

---

## Advanced Usage

### Custom Model Options

```typescript
const model = transformers.embedding('Xenova/bge-small-en-v1.5', {
  quantized: true, // Use quantized model (smaller, faster)
  device: 'webgpu', // Use WebGPU for acceleration (falls back to WASM)
});
```

### Provider Options

Pass provider-specific options to core functions:

```typescript
const { embedding } = await embed({
  model: transformers.embedding('Xenova/bge-small-en-v1.5'),
  value: 'Hello world',
  providerOptions: {
    transformers: {
      // Any Transformers.js specific options
    },
  },
});
```

### Preloading Models

For better UX, preload models before use:

```typescript
import { preloadModel, isModelCached } from '@localmode/transformers';
import { embed } from '@localmode/core';

if (!(await isModelCached('Xenova/bge-small-en-v1.5'))) {
  await preloadModel('Xenova/bge-small-en-v1.5', {
    onProgress: (p) => console.log(`Loading: ${p.progress}%`),
  });
}

// Subsequent calls are instant (loaded from cache)
const embeddingModel = transformers.embedding('Xenova/bge-small-en-v1.5');
const { embedding } = await embed({ model: embeddingModel, value: 'Hello' });
```

## Exported Implementation Classes

For advanced use cases, implementation classes are available:

```typescript
import {
  TransformersEmbeddingModel,
  TransformersClassificationModel,
  TransformersZeroShotModel,
  TransformersNERModel,
  TransformersRerankerModel,
  TransformersSpeechToTextModel,
  TransformersImageClassificationModel,
  TransformersZeroShotImageModel,
  TransformersCaptionModel,
} from '@localmode/transformers';
```

Additional implementation classes can be imported from the implementations subpath:

```typescript
import {
  TransformersSegmentationModel,
  TransformersObjectDetectionModel,
  TransformersImageFeatureModel,
  TransformersImageToImageModel,
  TransformersTextToSpeechModel,
  TransformersAudioClassificationModel,
  TransformersZeroShotAudioClassificationModel,
  TransformersTranslationModel,
  TransformersSummarizationModel,
  TransformersFillMaskModel,
  TransformersQuestionAnsweringModel,
  TransformersOCRModel,
  TransformersDocumentQAModel,
  TransformersDepthEstimationModel,
} from '@localmode/transformers/implementations';
```

## Browser Compatibility

| Browser     | WebGPU | WASM | Notes                        |
| ----------- | ------ | ---- | ---------------------------- |
| Chrome 113+ | ✅     | ✅   | Best performance with WebGPU |
| Edge 113+   | ✅     | ✅   | Same as Chrome               |
| Firefox     | ❌     | ✅   | WASM only                    |
| Safari 18+  | ✅     | ✅   | WebGPU available             |
| iOS Safari  | ✅     | ✅   | WebGPU available (iOS 26+)   |

## Performance Tips

1. **Use quantized models** - Smaller and faster with minimal quality loss
2. **Preload models** - Load during app init for instant inference
3. **Use WebGPU when available** - 3-5x faster than WASM
4. **Batch operations** - Process multiple inputs together

## Acknowledgments

This package is built on [Transformers.js](https://github.com/huggingface/transformers.js) by [HuggingFace](https://huggingface.co/) — state-of-the-art ML models running in the browser via ONNX Runtime.

## License

[MIT](../../LICENSE)
