'use client';

/**
 * @file code-block-demo.tsx
 * @description Docs preview for `CodeBlock`. Highlighted TypeScript with a
 * working copy control.
 */
import { CodeBlock } from './code-block';

const CODE = `import { generateText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const { text } = await generateText({
  model: webllm.languageModel('Llama-3.2-1B-Instruct'),
  prompt: 'Explain local-first AI in one sentence.',
});
console.log(text);`;

export default function CodeBlockDemo() {
  return (
    <div className="w-full max-w-2xl">
      <CodeBlock language="ts" code={CODE} />
    </div>
  );
}
