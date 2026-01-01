import { highlight } from 'fumadocs-core/highlight';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

interface HighlightedCodeProps {
  code: string;
  lang: string;
  title?: string;
  icon?: React.ReactNode;
}

export async function HighlightedCode({ code, lang, title, icon }: HighlightedCodeProps) {
  const highlighted = await highlight(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
  });

  return (
    <CodeBlock title={title} icon={icon}>
      <Pre>{highlighted}</Pre>
    </CodeBlock>
  );
}
