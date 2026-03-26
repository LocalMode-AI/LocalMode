/**
 * @file agent-view.tsx
 * @description Main view component for the research agent application.
 * Shows input, step-by-step reasoning, and final result.
 */
'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, ArrowLeft, Square, Wrench, Brain } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { StepCard } from './step-card';
import { cn } from '../_lib/utils';
import { MODEL_SIZE, SAMPLE_QUESTIONS, MAX_STEPS } from '../_lib/constants';
import { useResearchAgent } from '../_hooks/use-research-agent';

/** Rich empty state shown before any research */
function EmptyState({ onSample }: { onSample: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-poster-primary/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-primary to-poster-accent-purple flex items-center justify-center shadow-lg shadow-poster-primary/20">
          <Brain className="w-10 h-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-poster-primary animate-float" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-poster-text-main mb-2">Research Agent</h2>
      <p className="text-sm text-poster-text-sub text-center max-w-md mb-8 leading-relaxed">
        Ask a research question and watch the AI agent search, analyze, and synthesize
        an answer step-by-step — entirely in your browser.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <Wrench className="w-3.5 h-3.5 text-poster-primary" />
          Tool-Using Agent
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <Brain className="w-3.5 h-3.5 text-poster-primary" />
          ReAct Reasoning
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <Bot className="w-3.5 h-3.5 text-poster-primary" />
          Fully Offline
        </span>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-md">
        <span className="text-xs text-poster-text-sub/60 text-center mb-1">Try a sample question:</span>
        {SAMPLE_QUESTIONS.map((q, i) => (
          <button
            key={q}
            onClick={() => onSample(q)}
            className={cn(
              'text-sm text-left px-4 py-3 rounded-xl bg-poster-surface border border-poster-border/30 text-poster-text-sub',
              'hover:text-poster-primary hover:border-poster-primary/40 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)]',
              'transition-all duration-300 cursor-pointer',
              'animate-fadeIn opacity-0 [animation-fill-mode:forwards]'
            )}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Main view for the Research Agent */
export function AgentView() {
  const [input, setInput] = useState('');
  const { steps, result, isRunning, error, run, cancel, clearError, reset } = useResearchAgent();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStarted = steps.length > 0 || isRunning || result !== null;

  const handleRun = () => {
    const question = input.trim();
    if (!question || isRunning) return;
    setInput('');
    run(question);
  };

  const handleSample = (q: string) => {
    setInput('');
    run(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  };

  const handleNewResearch = () => {
    reset();
    setInput('');
  };

  // Auto-scroll as steps arrive
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, result]);

  const finishReason = result?.finishReason;
  const isComplete = result !== null && !isRunning;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <IconBox size="sm" variant="primary">
              <Brain className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Research Agent</h1>
              <p className="text-xs text-poster-text-sub">AI agent with tool-based reasoning</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              Qwen3 1.7B
              <span className="text-poster-primary">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {steps.length > 0 && (
              <span className="badge badge-sm badge-ghost text-poster-text-sub">
                {steps.length} / {MAX_STEPS} steps
              </span>
            )}
            {isComplete && (
              <Button variant="ghost" size="sm" onClick={handleNewResearch} className="hover:text-poster-primary transition-colors duration-200">
                <Sparkles className="w-4 h-4 mr-1" />
                New Research
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-primary/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col">
          <div className="max-w-3xl mx-auto flex flex-col gap-4 flex-1 w-full">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

            {/* Empty state */}
            {!hasStarted && (
              <EmptyState onSample={handleSample} />
            )}

            {/* Steps timeline */}
            <ErrorBoundary>
              {steps.length > 0 && (
                <div className="flex flex-col gap-4">
                  {/* Finish reason badge */}
                  {isComplete && finishReason && finishReason !== 'finish' && (
                    <div className="animate-fadeIn">
                      <div className={cn(
                        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                        finishReason === 'max_steps' && 'bg-warning/10 text-warning border border-warning/20',
                        finishReason === 'timeout' && 'bg-warning/10 text-warning border border-warning/20',
                        finishReason === 'loop_detected' && 'bg-error/10 text-error border border-error/20',
                        finishReason === 'error' && 'bg-error/10 text-error border border-error/20',
                      )}>
                        {finishReason === 'max_steps' && 'Reached maximum steps'}
                        {finishReason === 'timeout' && 'Timed out'}
                        {finishReason === 'loop_detected' && 'Loop detected - agent was repeating actions'}
                        {finishReason === 'error' && 'Agent encountered an error'}
                      </div>
                    </div>
                  )}

                  {steps.map((step) => (
                    <StepCard key={step.index} step={step} />
                  ))}

                  {/* Running indicator */}
                  {isRunning && (
                    <div className="flex items-center gap-3 animate-fadeIn">
                      <div className="w-8 h-8 rounded-full bg-poster-primary/10 flex items-center justify-center shrink-0">
                        <Spinner size="sm" className="text-poster-primary" />
                      </div>
                      <span className="text-sm text-poster-text-sub">Thinking...</span>
                    </div>
                  )}

                  <div ref={scrollRef} />
                </div>
              )}
            </ErrorBoundary>

            {/* Spacer */}
            <div className="flex-1" />
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-poster-border/30 bg-poster-surface/80 backdrop-blur-md px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-poster-bg/80 border border-poster-border/30 rounded-full px-4 py-1 transition-all duration-300 focus-within:border-poster-primary/50 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.08)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a research question..."
                  className="flex-1 bg-transparent text-sm text-poster-text-main placeholder:text-poster-text-sub/40 focus:outline-none py-2"
                  disabled={isRunning}
                />
              </div>
              {isRunning ? (
                <button
                  onClick={cancel}
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-error/20 text-error hover:bg-error/30 transition-all duration-300 cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!input.trim()}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                    input.trim()
                      ? 'bg-poster-primary text-white shadow-lg shadow-poster-primary/25 hover:bg-poster-primary-dark hover:scale-105 cursor-pointer'
                      : 'bg-poster-surface text-poster-text-sub/30 cursor-not-allowed'
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
              {isRunning ? 'Agent is researching... click stop to cancel' : 'Press Enter to start research'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
