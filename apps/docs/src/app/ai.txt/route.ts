export const revalidate = false;

const content = `# ai.txt for localmode.dev
# https://www.ai-visibility.org.uk/specifications/ai-txt/

User-Agent: *
Allow-Training: No
Allow-RAG: Yes
Allow-Inference: Yes
`;

export function GET() {
  return new Response(content.trim(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
