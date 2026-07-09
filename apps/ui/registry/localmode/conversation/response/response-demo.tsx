'use client';

/**
 * @file response-demo.tsx
 * @description Docs preview for `Response`. Simulates a local token stream by
 * revealing markdown incrementally, showing the streaming cursor and partial
 * (unterminated) code-fence handling, then settling to final markdown.
 */
import * as React from 'react';
import { Response } from './response';

const FULL = `Here's a quick plan:

1. Load a model **locally** (no server).
2. Stream tokens to the UI.
3. Render \`markdown\` safely, even mid-fence:

\`\`\`ts
const reply = await generateText({ model, prompt });
\`\`\`

All on-device.`;

export default function ResponseDemo() {
  const [text, setText] = React.useState('');
  const [streaming, setStreaming] = React.useState(true);

  React.useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 3;
      setText(FULL.slice(0, i));
      if (i >= FULL.length) {
        window.clearInterval(id);
        setStreaming(false);
      }
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-4 text-card-foreground">
      <Response streaming={streaming}>{text}</Response>
    </div>
  );
}
