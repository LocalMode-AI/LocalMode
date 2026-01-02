# @localmode/transformers

HuggingFace Transformers.js provider for LocalMode AI Engine - run ML models locally in the browser.

[![npm](https://img.shields.io/npm/v/@localmode/transformers)](https://www.npmjs.com/package/@localmode/transformers)
[![license](https://img.shields.io/npm/l/@localmode/transformers)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- 🚀 **Browser-Native** - Run ML models directly in the browser with WebGPU/WASM
- 🔒 **Privacy-First** - All processing happens locally, no data leaves the device
- 📦 **Model Caching** - Models are cached in IndexedDB for instant subsequent loads
- ⚡ **Optimized** - Uses quantized models for smaller size and faster inference

## Installation

```bash
pnpm install @localmode/transformers @localmode/core
```

## Overview

`@localmode/transformers` provides model implementations for the interfaces defined in `@localmode/core`. It wraps HuggingFace Transformers.js to enable local ML inference in the browser.

---

## ✅ Live Features

These features are production-ready and actively used in applications.

### Embeddings

Generate text embeddings for semantic search, clustering, and similarity.

```typescript
import { embed, embedMany } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const embeddingModel = transformers.embedding('Xenova/all-MiniLM-L6-v2');

// Single embedding
const { embedding } = await embed({
  model: embeddingModel,
  value: 'Hello world',
});

// Batch embeddings
const { embeddings } = await embedMany({
  model: embeddingModel,
  values: ['Hello', 'World', 'How are you?'],
});
```

| Method                            | Interface        | Description     |
| --------------------------------- | ---------------- | --------------- |
| `transformers.embedding(modelId)` | `EmbeddingModel` | Text embeddings |

**Recommended Models:**

- `Xenova/all-MiniLM-L6-v2` - Fast, general-purpose (~22MB)
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` - 50+ languages

### Reranking

Improve RAG accuracy by reranking search results.

```typescript
import { rerank } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const rerankerModel = transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2');

const { results } = await rerank({
  model: rerankerModel,
  query: 'What is machine learning?',
  documents: ['ML is a subset of AI...', 'Python is a language...', 'Neural networks...'],
  topK: 5,
});

console.log(results); // Sorted by relevance score
```

| Method                           | Interface       | Description        |
| -------------------------------- | --------------- | ------------------ |
| `transformers.reranker(modelId)` | `RerankerModel` | Document reranking |

**Recommended Models:**

- `Xenova/ms-marco-MiniLM-L-6-v2` - Document reranking for RAG

### Model Utilities

Manage model loading and caching.

```typescript
import { preloadModel, isModelCached, getModelStorageUsage } from '@localmode/transformers';

// Check if model is cached
const cached = await isModelCached('Xenova/all-MiniLM-L6-v2');

// Preload model with progress
await preloadModel('Xenova/all-MiniLM-L6-v2', {
  onProgress: (p) => console.log(`${p.progress}% loaded`),
});

// Check storage usage
const usage = await getModelStorageUsage();
```

---

## 🚧 Coming Soon

These features have interfaces defined and implementations available, but are under active development and testing.

### Classification & NLP

| Method                                     | Interface                     | Description                   |
| ------------------------------------------ | ----------------------------- | ----------------------------- |
| `transformers.classifier(modelId)`         | `ClassificationModel`         | Text classification           |
| `transformers.zeroShotClassifier(modelId)` | `ZeroShotClassificationModel` | Zero-shot text classification |
| `transformers.ner(modelId)`                | `NERModel`                    | Named Entity Recognition      |

```typescript
import { classify, extractEntities } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Text Classification
const sentiment = await classify({
  model: transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english'),
  text: 'I love this product!',
});
console.log(sentiment.label); // 'POSITIVE'

// Named Entity Recognition
const entities = await extractEntities({
  model: transformers.ner('Xenova/bert-base-NER'),
  text: 'John works at Microsoft in Seattle',
});
console.log(entities.entities);
// [{ entity: 'John', type: 'PER', ... }, { entity: 'Microsoft', type: 'ORG', ... }, ...]
```

### Translation & Summarization

| Method                                    | Interface                | Description             |
| ----------------------------------------- | ------------------------ | ----------------------- |
| `transformers.translator(modelId)`        | `TranslationModel`       | Text translation        |
| `transformers.summarizer(modelId)`        | `SummarizationModel`     | Text summarization      |
| `transformers.fillMask(modelId)`          | `FillMaskModel`          | Masked token prediction |
| `transformers.questionAnswering(modelId)` | `QuestionAnsweringModel` | Extractive QA           |

### Audio

| Method                               | Interface           | Description                  |
| ------------------------------------ | ------------------- | ---------------------------- |
| `transformers.speechToText(modelId)` | `SpeechToTextModel` | Speech-to-text transcription |
| `transformers.textToSpeech(modelId)` | `TextToSpeechModel` | Text-to-speech synthesis     |

```typescript
import { transcribe, synthesizeSpeech } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Speech-to-Text
const transcription = await transcribe({
  model: transformers.speechToText('Xenova/whisper-tiny'),
  audio: audioBlob,
  returnTimestamps: true,
});
console.log(transcription.text);

// Text-to-Speech
const { audio, sampleRate } = await synthesizeSpeech({
  model: transformers.textToSpeech('Xenova/speecht5_tts'),
  text: 'Hello, how are you?',
});
```

### Vision

| Method                                          | Interface                          | Description                             |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------- |
| `transformers.imageClassifier(modelId)`         | `ImageClassificationModel`         | Image classification                    |
| `transformers.zeroShotImageClassifier(modelId)` | `ZeroShotImageClassificationModel` | Zero-shot image classification          |
| `transformers.captioner(modelId)`               | `ImageCaptionModel`                | Image captioning                        |
| `transformers.segmenter(modelId)`               | `SegmentationModel`                | Image segmentation                      |
| `transformers.objectDetector(modelId)`          | `ObjectDetectionModel`             | Object detection                        |
| `transformers.imageFeatures(modelId)`           | `ImageFeatureModel`                | Image feature extraction                |
| `transformers.imageToImage(modelId)`            | `ImageToImageModel`                | Image transformation / super resolution |
| `transformers.ocr(modelId)`                     | `OCRModel`                         | OCR (TrOCR)                             |
| `transformers.documentQA(modelId)`              | `DocumentQAModel`                  | Document/Table question answering       |

```typescript
import { classifyImage, captionImage } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Image Classification
const classification = await classifyImage({
  model: transformers.imageClassifier('Xenova/vit-base-patch16-224'),
  image: imageBlob,
});
console.log(classification.predictions);

// Image Captioning
const caption = await captionImage({
  model: transformers.captioner('Xenova/blip-image-captioning-base'),
  image: imageBlob,
});
console.log(caption.caption);
```

---

## All Recommended Models

### Live Features

#### Embeddings

- `Xenova/all-MiniLM-L6-v2` - Fast, general-purpose (~22MB)
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` - 50+ languages

#### Reranking

- `Xenova/ms-marco-MiniLM-L-6-v2` - Document reranking for RAG

---

### Coming Soon Features

#### Text Classification

- `Xenova/distilbert-base-uncased-finetuned-sst-2-english` - Sentiment analysis
- `Xenova/twitter-roberta-base-sentiment-latest` - Twitter sentiment

#### Named Entity Recognition

- `Xenova/bert-base-NER` - Standard NER (PER, ORG, LOC, MISC)

#### Translation

- `Xenova/opus-mt-en-de` - English to German
- `Xenova/opus-mt-en-fr` - English to French
- `Xenova/nllb-200-distilled-600M` - 200 languages

#### Summarization

- `Xenova/bart-large-cnn` - News summarization
- `Xenova/distilbart-cnn-12-6` - Fast summarization

#### Fill-Mask

- `Xenova/bert-base-uncased` - General purpose
- `Xenova/roberta-base` - Better for some tasks

#### Question Answering

- `Xenova/distilbert-base-cased-distilled-squad` - SQuAD trained
- `Xenova/roberta-base-squad2` - SQuAD 2.0 trained

#### Speech-to-Text

- `Xenova/whisper-tiny` - Fast, smaller size (~70MB)
- `Xenova/whisper-small` - Better accuracy (~240MB)

#### Text-to-Speech

- `Xenova/speecht5_tts` - Natural speech synthesis

#### Image Classification

- `Xenova/vit-base-patch16-224` - General image classification
- `Xenova/clip-vit-base-patch32` - Zero-shot image classification

#### Image Captioning

- `Xenova/blip-image-captioning-base` - High-quality captions

#### Image Segmentation

- `Xenova/segformer-b0-finetuned-ade-512-512` - Fast segmentation
- `Xenova/detr-resnet-50-panoptic` - Panoptic segmentation

#### Object Detection

- `Xenova/detr-resnet-50` - COCO objects
- `Xenova/yolos-tiny` - Fast detection

#### Image Features

- `Xenova/clip-vit-base-patch32` - Image embeddings
- `Xenova/dinov2-small` - Self-supervised features

#### OCR

- `Xenova/trocr-base-handwritten` - Handwritten text
- `Xenova/trocr-base-printed` - Printed text

#### Document QA

- `Xenova/donut-base-finetuned-docvqa` - Document QA
- `Xenova/tapas-base-finetuned-wtq` - Table QA

## Advanced Usage

### Custom Model Options

```typescript
const model = transformers.embedding('Xenova/all-MiniLM-L6-v2', {
  quantized: true, // Use quantized model (smaller, faster)
  device: 'webgpu', // Use WebGPU for acceleration (falls back to WASM)
});
```

### Provider Options

Pass provider-specific options to core functions:

```typescript
const { embedding } = await embed({
  model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
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

// Check and preload if needed
if (!(await isModelCached('Xenova/all-MiniLM-L6-v2'))) {
  await preloadModel('Xenova/all-MiniLM-L6-v2', {
    onProgress: (p) => console.log(`Loading: ${p.progress}%`),
  });
}

// Subsequent calls are instant (loaded from cache)
const embeddingModel = transformers.embedding('Xenova/all-MiniLM-L6-v2');
const { embedding } = await embed({ model: embeddingModel, value: 'Hello' });
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

## License

[MIT](../../LICENSE)
