/**
 * @file page.tsx
 * @description Public `/blocks/chat` — the ChatBlock body wrapped in block
 * chrome (install command + Preview/Code tabs). The flagship multi-provider
 * chat: transformers / WebLLM / wllama / LiteRT catalog, custom GGUF URLs,
 * vision attachments, reasoning display, semantic cache, and agent mode —
 * all fully on-device. No model bytes download until an explicit action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ChatBlock } from './chat';

export const metadata: Metadata = {
  title: 'Chat block - LocalMode UI',
  alternates: { canonical: '/blocks/chat' },
  openGraph: {
    title: 'Chat',
    description: 'Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one.',
    url: '/blocks/chat',
    type: 'website',
    images: [ogImageUrl({ title: 'Chat', description: 'Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chat',
    description: 'Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one.',
    images: [ogImageUrl({ title: 'Chat', description: 'Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ChatBlockPage() {
  return (
    <BlockShell
      title="Chat"
      description="Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one."
      name="chat"
      source={readBlockSource('chat')}
    >
      <ChatBlock />
    </BlockShell>
  );
}
