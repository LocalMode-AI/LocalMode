import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { RagChatBlock } from './rag-chat';

export const metadata: Metadata = {
  title: 'RAG Chat block - LocalMode UI',
  alternates: { canonical: '/blocks/knowledge/rag-chat' },
  openGraph: {
    title: 'RAG Chat',
    description: 'Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start.',
    url: '/blocks/knowledge/rag-chat',
    type: 'website',
    images: [ogImageUrl({ title: 'RAG Chat', description: 'Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RAG Chat',
    description: 'Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start.',
    images: [ogImageUrl({ title: 'RAG Chat', description: 'Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function RagChatBlockPage() {
  return (
    <BlockShell
      title="RAG Chat"
      description="Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start."
      name="knowledge/rag-chat"
      source={readBlockSource('knowledge/rag-chat')}
    >
      <RagChatBlock />
    </BlockShell>
  );
}
