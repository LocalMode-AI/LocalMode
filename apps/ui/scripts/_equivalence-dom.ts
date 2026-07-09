/**
 * @file _equivalence-dom.ts
 * @description Minimal jsdom render/act harness shared by the interactive
 * equivalence tests. The leading underscore + no `.test.ts` suffix keep Vitest
 * from globbing it as a suite. It drives the promoted primitives through their
 * REAL client render + synthetic-event path with React 19's own `createRoot` +
 * `act` — no testing-library, no mocked component boundary.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React's act() requires this flag to be set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  root: Root;
  render(el: ReactElement): Promise<void>;
  unmount(): Promise<void>;
  /** Flush pending microtasks/state updates (e.g. after an async click handler). */
  flush(): Promise<void>;
}

/** Mount a React element into a fresh container attached to document.body. */
export async function mount(el: ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(el);
  });
  return {
    container,
    root,
    async render(next: ReactElement) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
    async flush() {
      await act(async () => {});
    },
  };
}

/** Dispatch a bubbling click through React's synthetic event system, inside act. */
export async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/**
 * Set a controlled `<input>`/`<textarea>` value the way React's value tracker
 * requires (native prototype setter defeats the tracker), then fire `input` so
 * the component's `onChange` runs — the real user-typing path.
 */
export async function typeInto(
  el: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): Promise<void> {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Run inside act so a state update triggered by an external effect is flushed. */
export async function inAct(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
  });
}
