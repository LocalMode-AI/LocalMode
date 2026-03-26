/**
 * @file constants.ts
 * @description Constants for the LangChain RAG application
 */

/** Embedding model for vector search */
export const EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';

/** Embedding model download size */
export const EMBEDDING_MODEL_SIZE = '33MB';

/** LLM model for answer generation */
export const LLM_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

/** LLM model download size */
export const LLM_MODEL_SIZE = '~1GB';

/** Embedding dimensions for bge-small-en-v1.5 */
export const EMBEDDING_DIMENSIONS = 384;

/** VectorDB database name */
export const DB_NAME = 'langchain-rag-db';

/** Default chunk size for text splitting (characters) */
export const DEFAULT_CHUNK_SIZE = 512;

/** Default overlap between chunks (characters) */
export const DEFAULT_OVERLAP = 50;

/** Number of top results to retrieve for context */
export const DEFAULT_TOP_K = 3;

/** Default system prompt for RAG generation */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based only on the provided context. If the context does not contain enough information to answer, say so honestly. Be concise and accurate.`;

/** Sample document for quick demo */
export const SAMPLE_DOCUMENT = `The Transformer architecture was introduced in the 2017 paper "Attention Is All You Need" by Vaswani et al. Unlike previous sequence-to-sequence models that relied on recurrent neural networks (RNNs) or convolutional neural networks (CNNs), Transformers use a self-attention mechanism that allows the model to weigh the importance of different parts of the input sequence simultaneously.

The key innovation of the Transformer is the multi-head attention mechanism. Instead of processing tokens sequentially like RNNs, attention allows each token to attend to every other token in the sequence in parallel. This makes training much more efficient on modern GPU hardware. The architecture consists of an encoder and decoder, each made up of stacked layers containing multi-head attention and feed-forward neural networks.

BERT (Bidirectional Encoder Representations from Transformers) was released by Google in 2018 and uses only the encoder portion of the Transformer. BERT is pre-trained on masked language modeling and next sentence prediction tasks, making it excellent for understanding tasks like classification, question answering, and named entity recognition.

GPT (Generative Pre-trained Transformer), developed by OpenAI, uses only the decoder portion. GPT models are autoregressive, meaning they generate text one token at a time by predicting the next token. GPT-2 demonstrated that large language models could generate remarkably coherent text, while GPT-3 showed that scaling to 175 billion parameters enabled few-shot learning capabilities.

Modern large language models like LLaMA, Mistral, and Qwen have pushed the boundaries further. LLaMA, released by Meta, demonstrated that smaller models trained on more data can match or exceed the performance of larger models. Mistral introduced innovations like sliding window attention for handling longer sequences efficiently. These open-source models have democratized access to powerful AI capabilities.

Running AI models locally in the browser has become possible through technologies like WebAssembly (WASM) and WebGPU. Libraries such as Transformers.js and WebLLM enable inference directly on the user's device, ensuring privacy since no data leaves the browser. This approach eliminates API costs and latency while maintaining user privacy.`;

/** Sample questions for the demo */
export const SAMPLE_QUESTIONS = [
  'What is the key innovation of the Transformer?',
  'How does BERT differ from GPT?',
  'What are the benefits of running AI locally?',
];
