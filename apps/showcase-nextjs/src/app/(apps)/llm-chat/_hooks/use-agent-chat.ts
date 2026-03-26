/**
 * @file use-agent-chat.ts
 * @description Hook for agent-mode chat interactions. Wraps `useAgent` from
 * `@localmode/react` and returns the same shape as `useChat`, so the ChatView
 * component can switch between plain chat and agent chat transparently.
 *
 * Defines three built-in tools: search_web (keyword search against a static
 * knowledge base), calculate (safe math eval), and summarize (calls
 * `@localmode/core` `summarize()` via `@localmode/transformers`).
 */
'use client';

import { useState, useRef } from 'react';
import { useAgent } from '@localmode/react';
import type { ToolDefinition, AgentStep } from '@localmode/core';
import { useChatStore } from '../_store/chat.store';
import { useModelStore } from '../_store/model.store';
import { createChatModel } from '../_services/chat.service';
import {
  AGENT_CONFIG,
  AGENT_SYSTEM_PROMPT,
  AGENT_KNOWLEDGE_BASE,
} from '../_lib/constants';
import { createMessage } from '../_lib/utils';
import type { ChatMessage, AgentStepDisplay } from '../_lib/types';

// ─────────────────────────────────────────────────────────────
// Tool factories (duck-typed Zod-compatible schemas)
// ─────────────────────────────────────────────────────────────

/** Schema for the search_web tool */
function createSearchSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "query" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.query !== 'string' || !obj.query) {
        throw new Error('"query" must be a non-empty string');
      }
      return {
        query: obj.query as string,
        maxResults: typeof obj.maxResults === 'number' ? obj.maxResults : 3,
      };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 3)' },
      },
      required: ['query'],
    },
    description: 'Search parameters',
  };
}

/** Schema for the calculate tool */
function createCalculateSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "expression" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.expression !== 'string' || !obj.expression) {
        throw new Error('"expression" must be a non-empty string');
      }
      return { expression: obj.expression as string };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate' },
      },
      required: ['expression'],
    },
    description: 'Calculation parameters',
  };
}

/** Schema for the summarize tool */
function createSummarizeSchema() {
  return {
    parse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with "text" field');
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.text !== 'string' || !obj.text) {
        throw new Error('"text" must be a non-empty string');
      }
      return {
        text: obj.text as string,
        maxLength: typeof obj.maxLength === 'number' ? obj.maxLength : 100,
      };
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text to summarize' },
        maxLength: { type: 'number', description: 'Maximum summary length in tokens (default: 100)' },
      },
      required: ['text'],
    },
    description: 'Summarization parameters',
  };
}

/**
 * Create the three built-in agent tools.
 * @returns Array of ToolDefinition for search_web, calculate, and summarize
 */
function createAgentTools(): ToolDefinition[] {
  /** search_web — keyword search against the static knowledge base */
  const searchTool: ToolDefinition = {
    name: 'search_web',
    description: 'Search for information on a topic. Returns relevant article snippets from a knowledge base.',
    parameters: createSearchSchema(),
    execute: async (params: unknown) => {
      const { query, maxResults } = params as { query: string; maxResults?: number };
      const limit = maxResults ?? 3;
      const queryWords = query.toLowerCase().split(/\s+/);
      const scored = AGENT_KNOWLEDGE_BASE.map((article) => {
        const text = `${article.title} ${article.content}`.toLowerCase();
        const score = queryWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
        return { article, score };
      });

      const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
          title: s.article.title,
          content: s.article.content,
          category: s.article.category,
        }));

      if (results.length === 0) {
        return 'No relevant articles found. Try different search terms.';
      }

      return results.map((r) => `[${r.title}] (${r.category})\n${r.content}`).join('\n\n');
    },
  };

  /** calculate — safe math expression evaluation */
  const calculateTool: ToolDefinition = {
    name: 'calculate',
    description: 'Evaluate a mathematical expression. Returns the numeric result.',
    parameters: createCalculateSchema(),
    execute: async (params: unknown) => {
      const { expression } = params as { expression: string };
      try {
        // Only allow digits, operators, parentheses, decimal points, and whitespace
        const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
        if (!sanitized.trim()) {
          return 'Invalid expression. Use numbers and operators: + - * / ()';
        }
        const result = new Function(`return (${sanitized})`)() as number;
        return String(result);
      } catch {
        return `Could not evaluate: ${expression}`;
      }
    },
  };

  /** summarize — calls @localmode/core summarize() via @localmode/transformers */
  const summarizeTool: ToolDefinition = {
    name: 'summarize',
    description: 'Summarize a block of text into a shorter version.',
    parameters: createSummarizeSchema(),
    execute: async (params: unknown) => {
      const { text, maxLength } = params as { text: string; maxLength?: number };
      try {
        const { summarize } = await import('@localmode/core');
        const { transformers } = await import('@localmode/transformers');
        const model = transformers.summarizer('Xenova/distilbart-cnn-6-6');
        const result = await summarize({ model, text, maxLength: maxLength ?? 100 });
        return result.summary;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Summarization failed: ${msg}`;
      }
    },
  };

  return [searchTool, calculateTool, summarizeTool];
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * Convert AgentStep[] to AgentStepDisplay[] for UI rendering.
 */
function toStepDisplays(steps: AgentStep[]): AgentStepDisplay[] {
  return steps.map((step) => ({
    index: step.index,
    type: step.type,
    toolName: step.toolName,
    toolArgs: step.toolArgs,
    observation: step.observation,
    durationMs: step.durationMs,
  }));
}

/**
 * Hook for agent-mode chat interactions.
 *
 * Returns the same interface shape as `useChat` so the ChatView can
 * switch between plain and agent mode transparently.
 */
export function useAgentChat() {
  const selectedModel = useChatStore((s) => s.selectedModel);

  // Stable tool definitions — created once
  const [tools] = useState<ToolDefinition[]>(() => createAgentTools());

  // Own message state (not persisted — agent conversations are session-only)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Pending message ID for the in-progress assistant message
  const pendingMsgId = useRef<string>(crypto.randomUUID());

  // Create model — rebuilt when selectedModel changes
  const modelRef = useRef<ReturnType<typeof createChatModel> | null>(null);
  const prevModelId = useRef('');

  if (selectedModel && selectedModel !== prevModelId.current) {
    const backend = useModelStore.getState().getModelBackend(selectedModel) ?? 'webgpu';
    modelRef.current = createChatModel(selectedModel, backend);
    prevModelId.current = selectedModel;
  }

  // Delegate to useAgent from @localmode/react
  const agent = useAgent({
    model: modelRef.current!,
    tools,
    maxSteps: AGENT_CONFIG.maxSteps,
    temperature: AGENT_CONFIG.temperature,
    systemPrompt: AGENT_SYSTEM_PROMPT,
  });

  // Update in-progress message when steps change
  const prevStepCount = useRef(0);
  if (agent.isRunning && agent.steps.length > prevStepCount.current) {
    prevStepCount.current = agent.steps.length;

    // Update the temporary assistant message with steps so far
    const tempMsg: ChatMessage = {
      id: pendingMsgId.current,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date(),
      agentSteps: toStepDisplays(agent.steps),
    };

    setMessages((prev) => {
      // Replace the last message if it's our pending message, otherwise append
      const last = prev[prev.length - 1];
      if (last && last.id === pendingMsgId.current) {
        return [...prev.slice(0, -1), tempMsg];
      }
      return [...prev, tempMsg];
    });
    setStreamingMessageId(pendingMsgId.current);
  }

  /** Send a message in agent mode */
  const sendMessage = async (text: string) => {
    if (!selectedModel || !modelRef.current) return;

    // Add user message
    const userMsg = createMessage('user', text);
    pendingMsgId.current = crypto.randomUUID();
    prevStepCount.current = 0;

    // Add user message + temporary "Thinking..." assistant message
    const thinkingMsg: ChatMessage = {
      id: pendingMsgId.current,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setStreamingMessageId(pendingMsgId.current);

    // Run the agent
    const result = await agent.run(text);

    if (result) {
      // Replace the temporary message with the final result
      const assistantMsg: ChatMessage = {
        id: pendingMsgId.current,
        role: 'assistant',
        content: result.result || '(No answer produced)',
        timestamp: new Date(),
        agentSteps: toStepDisplays(result.steps),
      };

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== pendingMsgId.current);
        return [...filtered, assistantMsg];
      });
    } else if (agent.error) {
      // Replace thinking message with error
      const errorMsg: ChatMessage = {
        id: pendingMsgId.current,
        role: 'assistant',
        content: `Agent error: ${agent.error.message}. Try a larger model for better agent support.`,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== pendingMsgId.current);
        return [...filtered, errorMsg];
      });
    }

    setStreamingMessageId(null);
  };

  /** Cancel the current agent run */
  const cancelStreaming = () => {
    agent.cancel();
    setStreamingMessageId(null);
  };

  /** Clear all messages and reset agent state */
  const clearMessages = () => {
    agent.reset();
    setMessages([]);
    setStreamingMessageId(null);
    prevStepCount.current = 0;
  };

  return {
    messages,
    isStreaming: agent.isRunning,
    streamingMessageId,
    sendMessage,
    cancelStreaming,
    clearMessages,
  };
}
