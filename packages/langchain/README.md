# @localmode/langchain

[![npm](https://img.shields.io/npm/v/@localmode/langchain)](https://www.npmjs.com/package/@localmode/langchain)
[![license](https://img.shields.io/npm/l/@localmode/langchain)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/langchain)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

LangChain.js adapters for [LocalMode](https://localmode.dev) — drop-in local inference for existing LangChain applications. Swap 3 imports and go fully local.

## Installation

```bash
pnpm install @localmode/langchain @localmode/core @localmode/transformers
```

## Adapters

| LangChain Class | LocalMode Adapter | Wraps |
|----------------|-------------------|-------|
| `Embeddings` | `LocalModeEmbeddings` | `EmbeddingModel` |
| `BaseChatModel` | `ChatLocalMode` | `LanguageModel` |
| `VectorStore` | `LocalModeVectorStore` | `VectorDB` |
| `BaseDocumentCompressor` | `LocalModeReranker` | `RerankerModel` |

## Quick Start

### Full RAG Chain

```typescript
import { LocalModeEmbeddings, ChatLocalMode, LocalModeVectorStore } from '@localmode/langchain';
import { transformers } from '@localmode/transformers';
import { webllm } from '@localmode/webllm';
import { createVectorDB } from '@localmode/core';
import { RetrievalQAChain } from 'langchain/chains';

const embeddings = new LocalModeEmbeddings({
  model: transformers.embedding('Xenova/bge-small-en-v1.5'),
});
const llm = new ChatLocalMode({
  model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
});
const db = await createVectorDB({ name: 'docs', dimensions: 384 });
const store = new LocalModeVectorStore(embeddings, { db });

// Add documents
await store.addDocuments([
  { pageContent: 'LocalMode runs AI in the browser', metadata: { source: 'docs' } },
]);

// Query
const chain = RetrievalQAChain.fromLLM(llm, store.asRetriever());
const result = await chain.call({ query: 'What is LocalMode?' });
```

### Reranker

```typescript
import { LocalModeReranker } from '@localmode/langchain';
import { transformers } from '@localmode/transformers';

const reranker = new LocalModeReranker({
  model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
  topK: 5,
});

const reranked = await reranker.compressDocuments(documents, 'search query');
```

## Migration from Cloud

```diff
- import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
- import { PineconeStore } from '@langchain/pinecone';
+ import { ChatLocalMode, LocalModeEmbeddings, LocalModeVectorStore } from '@localmode/langchain';
+ import { transformers } from '@localmode/transformers';
+ import { webllm } from '@localmode/webllm';

- const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
- const embeddings = new OpenAIEmbeddings();
- const store = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });
+ const llm = new ChatLocalMode({ model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC') });
+ const embeddings = new LocalModeEmbeddings({ model: transformers.embedding('Xenova/bge-small-en-v1.5') });
+ const db = await createVectorDB({ name: 'docs', dimensions: 384 });
+ const store = new LocalModeVectorStore(embeddings, { db });
```

The chain code (`RetrievalQAChain.fromLLM`) is identical. Only provider instantiation changes.

## Documentation

Full documentation at [localmode.dev/docs/langchain](https://localmode.dev/docs/langchain).

## Acknowledgments

This package is built on [LangChain.js](https://github.com/langchain-ai/langchainjs) by [LangChain](https://langchain.com/) — a framework for building applications powered by language models.

## License

MIT
