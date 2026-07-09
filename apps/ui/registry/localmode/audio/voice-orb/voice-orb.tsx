'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/** Discrete voice-agent states the orb visualizes. */
export type VoiceOrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted';

/** Props for {@link VoiceOrb}. */
export interface VoiceOrbProps {
  /**
   * The current agent state. Drives the orb's base animation independently of
   * any audio source.
   * @default "idle"
   */
  state?: VoiceOrbState;
  /**
   * Returns the current input (microphone) volume in `[0, 1]`. Called on every
   * animation frame. Wire it to `useVoiceRecorder().getVolume()` (or a local
   * Web Audio `AnalyserNode` over `getUserMedia`) so the listening state pulses
   * with real mic loudness. The orb never touches the audio source itself.
   */
  getInputVolume?: () => number;
  /**
   * Returns the current output (agent speech) volume in `[0, 1]`. Drives the
   * speaking state. Wire it to an `AnalyserNode` on the TTS output node.
   */
  getOutputVolume?: () => number;
  /**
   * Diameter in pixels.
   * @default 128
   */
  size?: number;
  /** Core color (CSS color). @default "var(--primary)" */
  color?: string;
  /** Outer gradient/glow color (CSS color). @default same as `color` */
  glowColor?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Per-state idle pulse speed (Hz) and base radius fraction. */
const STATE_CONFIG: Record<VoiceOrbState, { speed: number; base: number; reactsTo: 'input' | 'output' | 'none' }> = {
  idle: { speed: 0.4, base: 0.5, reactsTo: 'none' },
  connecting: { speed: 1.6, base: 0.52, reactsTo: 'none' },
  listening: { speed: 0.8, base: 0.55, reactsTo: 'input' },
  thinking: { speed: 1.2, base: 0.5, reactsTo: 'none' },
  speaking: { speed: 1.0, base: 0.6, reactsTo: 'output' },
  muted: { speed: 0.3, base: 0.45, reactsTo: 'none' },
};

/**
 * An animated voice-agent orb (canvas) that reflects discrete agent states
 * (`idle` / `connecting` / `listening` / `thinking` / `speaking` / `muted`) and
 * reacts to input/output audio volume via `getInputVolume()` /
 * `getOutputVolume()` callbacks. Visual state is fully decoupled from the audio
 * source — the orb reads volume through the callbacks, which the app feeds from
 * `useVoiceRecorder().getVolume()` (input) or a local `AnalyserNode` (output).
 *
 * Drive `state` from `useLiveTranscribe()` / `useTurnTaker()`, `getInputVolume`
 * from `useVoiceRecorder().getVolume()`, and `getOutputVolume` from a Web Audio
 * analyser on the TTS output node.
 *
 * @example
 * ```tsx
 * const recorder = useVoiceRecorder();
 * <VoiceOrb
 *   state={agentState}
 *   getInputVolume={recorder.getVolume}
 *   getOutputVolume={() => ttsAnalyser.getVolume()}
 * />
 * ```
 */
export function VoiceOrb({
  state = 'idle',
  getInputVolume,
  getOutputVolume,
  size = 128,
  color = 'var(--primary)',
  glowColor,
  className,
}: VoiceOrbProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  // Keep the latest props in refs so the rAF loop reads fresh values without
  // restarting the animation on every render.
  const stateRef = React.useRef(state);
  const inputRef = React.useRef(getInputVolume);
  const outputRef = React.useRef(getOutputVolume);
  const colorRef = React.useRef(color);
  const glowRef = React.useRef(glowColor ?? color);

  // Sync latest props into refs AFTER render (not during) so the rAF loop reads
  // fresh values without restarting the animation on every render.
  React.useEffect(() => {
    stateRef.current = state;
    inputRef.current = getInputVolume;
    outputRef.current = getOutputVolume;
    colorRef.current = color;
    glowRef.current = glowColor ?? color;
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const start = performance.now();
    // Smoothed volume so the orb doesn't jitter on noisy analyser frames.
    let smoothed = 0;

    // Resolve a CSS color string against the live canvas (handles var(--x)).
    const resolve = (c: string) => {
      if (!c.startsWith('var(')) return c;
      const name = c.slice(4, -1).trim();
      const value = getComputedStyle(canvas).getPropertyValue(name).trim();
      return value || '#6366f1';
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const cfg = STATE_CONFIG[stateRef.current];

      let vol = 0;
      if (cfg.reactsTo === 'input') vol = inputRef.current?.() ?? 0;
      else if (cfg.reactsTo === 'output') vol = outputRef.current?.() ?? 0;
      vol = Math.max(0, Math.min(1, vol));
      smoothed += (vol - smoothed) * 0.2;

      const cx = size / 2;
      const cy = size / 2;
      const maxR = size / 2;

      // Base radius breathes by state; volume adds reactive amplitude.
      const pulse = Math.sin(t * cfg.speed * Math.PI * 2) * 0.05;
      const radius = maxR * (cfg.base + pulse + smoothed * 0.3);

      ctx.clearRect(0, 0, size, size);

      const core = resolve(colorRef.current);
      const glow = resolve(glowRef.current);

      // Outer glow.
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, maxR);
      grad.addColorStop(0, glow);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = stateRef.current === 'muted' ? 0.25 : 0.55;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fill();

      // Core orb.
      ctx.globalAlpha = stateRef.current === 'muted' ? 0.4 : 1;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, radius), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Voice agent: ${state}`}
      data-state={state}
      style={{ width: size, height: size }}
      className={cn('block', className)}
    />
  );
}
