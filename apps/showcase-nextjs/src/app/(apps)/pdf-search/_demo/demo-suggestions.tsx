/**
 * @file _demo/demo-suggestions.tsx
 * @description Self-contained demo suggestions component
 */
'use client';

import { Sparkles } from 'lucide-react';
import { DEMO_QUESTIONS, isDemoDocument } from './index';
import { usePDFStore } from '../_store/pdf.store';
import { useChatStore } from '../_store/chat.store';
import { usePDFSearch } from '../_hooks';

/**
 * Self-contained demo suggestions that appear above the chat input
 * Handles its own visibility logic based on demo document and message state
 */
export function DemoSuggestions() {
  const { documents } = usePDFStore();
  const { messages, isSearching } = useChatStore();
  const { askQuestion } = usePDFSearch();

  // Check if demo document is loaded
  const hasDemoDocument = documents.some((doc) => isDemoDocument(doc.filename));

  // Check if user has asked any questions yet
  const hasUserMessages = messages.some((m) => m.role === 'user');

  // Only show when demo is active and no user questions yet
  if (!hasDemoDocument || hasUserMessages || documents.length === 0) {
    return null;
  }

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-poster-accent-teal" />
        <span className="text-xs font-medium text-poster-text-sub">Try a question:</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEMO_QUESTIONS.map((question, index) => (
          <button
            key={index}
            onClick={() => askQuestion(question)}
            disabled={isSearching}
            className="px-3 py-1.5 text-xs rounded-full bg-poster-surface/80 border border-poster-border/30 hover:border-poster-primary/50 hover:bg-poster-primary/10 text-poster-text-main hover:text-poster-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
