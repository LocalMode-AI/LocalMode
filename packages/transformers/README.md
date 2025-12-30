# @localmode/transformers

HuggingFace Transformers.js provider for LocalMode AI Engine - run ML models locally in the browser.

[![npm](https://img.shields.io/npm/v/@localmode/transformers)](https://www.npmjs.com/package/@localmode/transformers)
[![license](https://img.shields.io/npm/l/@localmode/transformers)](../../LICENSE)

## Features

- 🚀 **Browser-Native** - Run ML models directly in the browser with WebGPU/WASM
- 🔒 **Privacy-First** - All processing happens locally, no data leaves the device
- 📦 **Model Caching** - Models are cached in IndexedDB for instant subsequent loads
- ⚡ **Optimized** - Uses quantized models for smaller size and faster inference

## Installation

```bash
# Preferred: pnpm
pnpm install @localmode/transformers @localmode/core @xenova/transformers

# Alternative: npm
npm install @localmode/transformers @localmode/core @xenova/transformers
```

## Quick Start

```typescript
import { transformers } from '@localmode/transformers';
import {
  classify,
  extractEntities,
  transcribe,
  classifyImage,
  captionImage,
} from '@localmode/core';

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

// Speech-to-Text
const transcription = await transcribe({
  model: transformers.speechToText('Xenova/whisper-tiny'),
  audio: audioBlob,
  returnTimestamps: true,
});
console.log(transcription.text);

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

## Available Model Types

### Text/NLP Models (P1)

| Method                                     | Interface                     | Description                   |
| ------------------------------------------ | ----------------------------- | ----------------------------- |
| `transformers.classifier(modelId)`         | `ClassificationModel`         | Text classification           |
| `transformers.zeroShotClassifier(modelId)` | `ZeroShotClassificationModel` | Zero-shot text classification |
| `transformers.ner(modelId)`                | `NERModel`                    | Named Entity Recognition      |
| `transformers.reranker(modelId)`           | `RerankerModel`               | Document reranking            |
| `transformers.embedding(modelId)`          | `EmbeddingModel`              | Text embeddings               |

### Text/NLP Models (P2)

| Method                                    | Interface                | Description             |
| ----------------------------------------- | ------------------------ | ----------------------- |
| `transformers.translator(modelId)`        | `TranslationModel`       | Text translation        |
| `transformers.summarizer(modelId)`        | `SummarizationModel`     | Text summarization      |
| `transformers.fillMask(modelId)`          | `FillMaskModel`          | Masked token prediction |
| `transformers.questionAnswering(modelId)` | `QuestionAnsweringModel` | Extractive QA           |

### Vision Models (P1)

| Method                                          | Interface                          | Description                    |
| ----------------------------------------------- | ---------------------------------- | ------------------------------ |
| `transformers.imageClassifier(modelId)`         | `ImageClassificationModel`         | Image classification           |
| `transformers.zeroShotImageClassifier(modelId)` | `ZeroShotImageClassificationModel` | Zero-shot image classification |
| `transformers.captioner(modelId)`               | `ImageCaptionModel`                | Image captioning               |

### Vision Models (P2)

| Method                                 | Interface              | Description                             |
| -------------------------------------- | ---------------------- | --------------------------------------- |
| `transformers.segmenter(modelId)`      | `SegmentationModel`    | Image segmentation                      |
| `transformers.objectDetector(modelId)` | `ObjectDetectionModel` | Object detection                        |
| `transformers.imageFeatures(modelId)`  | `ImageFeatureModel`    | Image feature extraction                |
| `transformers.imageToImage(modelId)`   | `ImageToImageModel`    | Image transformation / super resolution |
| `transformers.ocr(modelId)`            | `OCRModel`             | OCR (TrOCR)                             |
| `transformers.documentQA(modelId)`     | `DocumentQAModel`      | Document/Table question answering       |

### Audio Models (P1 & P2)

| Method                               | Interface           | Description                   |
| ------------------------------------ | ------------------- | ----------------------------- |
| `transformers.speechToText(modelId)` | `SpeechToTextModel` | Speech-to-text transcription  |
| `transformers.textToSpeech(modelId)` | `TextToSpeechModel` | Text-to-speech synthesis (P2) |

## Recommended Models

### Text Classification

- `Xenova/distilbert-base-uncased-finetuned-sst-2-english` - Sentiment analysis
- `Xenova/twitter-roberta-base-sentiment-latest` - Twitter sentiment

### Named Entity Recognition

- `Xenova/bert-base-NER` - Standard NER (PER, ORG, LOC, MISC)

### Reranking

- `Xenova/ms-marco-MiniLM-L-6-v2` - Document reranking for RAG

### Translation (P2)

- `Xenova/opus-mt-en-de` - English to German
- `Xenova/opus-mt-en-fr` - English to French
- `Xenova/nllb-200-distilled-600M` - 200 languages

### Summarization (P2)

- `Xenova/bart-large-cnn` - News summarization
- `Xenova/distilbart-cnn-12-6` - Fast summarization

### Fill-Mask (P2)

- `Xenova/bert-base-uncased` - General purpose
- `Xenova/roberta-base` - Better for some tasks

### Question Answering (P2)

- `Xenova/distilbert-base-cased-distilled-squad` - SQuAD trained
- `Xenova/roberta-base-squad2` - SQuAD 2.0 trained

### Speech-to-Text

- `Xenova/whisper-tiny` - Fast, smaller size (~70MB)
- `Xenova/whisper-small` - Better accuracy (~240MB)

### Text-to-Speech (P2)

- `Xenova/speecht5_tts` - Natural speech synthesis

### Image Classification

- `Xenova/vit-base-patch16-224` - General image classification
- `Xenova/clip-vit-base-patch32` - Zero-shot image classification

### Image Captioning

- `Xenova/blip-image-captioning-base` - High-quality captions

### Image Segmentation (P2)

- `Xenova/segformer-b0-finetuned-ade-512-512` - Fast segmentation
- `Xenova/detr-resnet-50-panoptic` - Panoptic segmentation

### Object Detection (P2)

- `Xenova/detr-resnet-50` - COCO objects
- `Xenova/yolos-tiny` - Fast detection

### Image Features (P2)

- `Xenova/clip-vit-base-patch32` - Image embeddings
- `Xenova/dinov2-small` - Self-supervised features

### OCR (P2)

- `Xenova/trocr-base-handwritten` - Handwritten text
- `Xenova/trocr-base-printed` - Printed text

### Document QA (P2)

- `Xenova/donut-base-finetuned-docvqa` - Document QA
- `Xenova/tapas-base-finetuned-wtq` - Table QA

### Embeddings

- `Xenova/all-MiniLM-L6-v2` - Fast, general-purpose (~22MB)
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` - 50+ languages

## P2 Feature Examples

### Translation

```typescript
import { translate } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { translatedText } = await translate({
  model: transformers.translator('Xenova/opus-mt-en-de'),
  text: 'Hello world!',
  targetLanguage: 'de',
});
console.log(translatedText); // "Hallo Welt!"
```

### Summarization

```typescript
import { summarize } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { summary } = await summarize({
  model: transformers.summarizer('Xenova/bart-large-cnn'),
  text: longArticle,
  maxLength: 100,
});
```

### Image Segmentation

```typescript
import { segmentImage } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { masks } = await segmentImage({
  model: transformers.segmenter('Xenova/segformer-b0-finetuned-ade-512-512'),
  image: imageBlob,
});

for (const mask of masks) {
  console.log(mask.label, mask.score);
}
```

### Object Detection

```typescript
import { detectObjects } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { objects } = await detectObjects({
  model: transformers.objectDetector('Xenova/detr-resnet-50'),
  image: imageBlob,
  threshold: 0.5,
});

for (const obj of objects) {
  console.log(`${obj.label}: ${obj.box.x},${obj.box.y}`);
}
```

### Text-to-Speech

```typescript
import { synthesizeSpeech } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { audio, sampleRate } = await synthesizeSpeech({
  model: transformers.textToSpeech('Xenova/speecht5_tts'),
  text: 'Hello, how are you?',
});

// Play with Web Audio API
const ctx = new AudioContext();
const buffer = ctx.createBuffer(1, audio.length, sampleRate);
buffer.getChannelData(0).set(audio);
const source = ctx.createBufferSource();
source.buffer = buffer;
source.connect(ctx.destination);
source.start();
```

### OCR

```typescript
import { extractText } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { text, regions } = await extractText({
  model: transformers.ocr('Xenova/trocr-base-printed'),
  image: documentImage,
});
console.log(text);
```

### Question Answering

```typescript
import { answerQuestion } from '@localmode/core';
import { transformers } from '@localmode/transformers';

const { answers } = await answerQuestion({
  model: transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad'),
  question: 'What is the capital of France?',
  context: 'Paris is the capital and largest city of France.',
});
console.log(answers[0].answer); // "Paris"
```

## Advanced Usage

### Custom Model Options

```typescript
const model = transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english', {
  quantized: true, // Use quantized model (smaller, faster)
  revision: 'main', // Model revision
});
```

### Provider Options

Pass provider-specific options to core functions:

```typescript
const result = await classify({
  model: transformers.classifier('Xenova/model'),
  text: 'Hello world',
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
// Models are automatically cached after first load
const classifier = transformers.classifier(
  'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
);

// First call downloads the model
const result = await classify({ model: classifier, text: 'Hello' });

// Subsequent calls are instant (loaded from cache)
const result2 = await classify({ model: classifier, text: 'World' });
```

## Browser Compatibility

| Browser     | WebGPU | WASM | Notes                        |
| ----------- | ------ | ---- | ---------------------------- |
| Chrome 113+ | ✅     | ✅   | Best performance with WebGPU |
| Edge 113+   | ✅     | ✅   | Same as Chrome               |
| Firefox     | ❌     | ✅   | WASM only                    |
| Safari 18+  | ✅     | ✅   | WebGPU available             |
| iOS Safari  | ❌     | ✅   | WASM only                    |

## Performance Tips

1. **Use quantized models** - Smaller and faster with minimal quality loss
2. **Preload models** - Load during app init for instant inference
3. **Use WebGPU when available** - 3-5x faster than WASM
4. **Batch operations** - Process multiple inputs together

## License

[MIT](../../LICENSE)
