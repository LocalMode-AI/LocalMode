/**
 * @file page.tsx
 * @description /bench/tasks - an unlinked, unindexed page for control runs of
 * Chrome's built-in task APIs (the chrome-ai-tasks control kind). Opened only
 * with a session query string; nothing loads until Run is pressed, and a run
 * is kept with Export JSON only, never uploaded.
 */
import type { Metadata } from 'next';
import { TaskRunner } from '@/components/bench/task-runner';

export const metadata: Metadata = {
  title: 'Task API control run - LocalMode UI',
  description: 'Control runs of Chrome built-in task APIs against on-device fallbacks; never published.',
  robots: { index: false, follow: false },
};

export default function BenchTasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Task API control run</h1>
      <TaskRunner />
    </main>
  );
}
