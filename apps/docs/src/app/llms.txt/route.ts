export const revalidate = false;

const content = `# LocalMode

> LocalMode is an open-source TypeScript library for running ML models entirely in the browser. It provides embeddings, vector search, LLM chat, classification, vision, audio, OCR, and agents — all offline, all private. No servers, no API keys. Data never leaves the user's device. MIT licensed.

## Docs

- [Getting Started](https://localmode.dev/docs/getting-started): Installation and quickstart
- [Core Package](https://localmode.dev/docs/core): VectorDB, embeddings, generation, pipelines, agents, middleware
- [Transformers Provider](https://localmode.dev/docs/transformers): HuggingFace Transformers.js models (embeddings, classification, NER, vision, audio, OCR, TTS)
- [WebLLM Provider](https://localmode.dev/docs/webllm): 32 curated LLM models via WebGPU
- [Wllama Provider](https://localmode.dev/docs/wllama): GGUF models via llama.cpp WASM (30 curated + 160K+ models)
- [LiteRT Provider](https://localmode.dev/docs/litert): Google LiteRT on-device models (Gemma 4, Qwen3)
- [MediaPipe Provider](https://localmode.dev/docs/mediapipe): Hand/pose/face tracking, gestures, audio/image classification, language detection
- [React Hooks](https://localmode.dev/docs/react): 56 hooks for all core functions

## Blog

- [Blog](https://localmode.dev/blog): Guides, tutorials, and deep dives on local-first AI
- [Model Guides](https://localmode.dev/blog/models): Browser AI model documentation
- [Task Guides](https://localmode.dev/blog/tasks): AI capabilities reference
- [Comparisons](https://localmode.dev/blog/compare): Provider and tool comparisons

## Links

- [Demo Apps](https://localmode.ai): 34 live showcase apps
- [GitHub](https://github.com/user/LocalMode): Source code
- [npm](https://www.npmjs.com/org/localmode): Published packages
- [Full Documentation for AI](https://localmode.dev/llms-full.txt): Complete API reference
`;

export function GET() {
  return new Response(content.trim(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
