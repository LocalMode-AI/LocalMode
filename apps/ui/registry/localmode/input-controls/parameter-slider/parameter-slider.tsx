'use client';

import { useId } from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Props for {@link ParameterSlider}. */
export interface ParameterSliderProps {
  /** Visible label (e.g. "Temperature", "Max tokens", "GPU layers"). */
  label: string;
  /** Current value (controlled). */
  value: number;
  /** Fired with the new value while dragging. */
  onChange: (value: number) => void;
  /** Minimum value. */
  min: number;
  /** Maximum value. */
  max: number;
  /**
   * Step granularity.
   * @default 1
   */
  step?: number;
  /**
   * Decimal places to show in the live readout (useful for temperature/top-p).
   * @default 0
   */
  precision?: number;
  /** Optional unit suffix shown after the value (e.g. "tokens"). */
  unit?: string;
  /** Optional one-line description shown under the label. */
  description?: string;
  /** Disable the slider. */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * An inline range slider with a live value readout for reversible adjustment of
 * a local generation parameter — temperature, top-k, top-p, max tokens,
 * GPU layers, KV-cache quant, etc. Fully controlled; the emitted value feeds
 * straight into your next local generation call.
 *
 * Built on the shadcn/ui `Slider` primitive, so it inherits the consumer's
 * theme. Wire `value`/`onChange` into the options you pass to
 * `useGenerateText()` / `useChat()`.
 *
 * @example
 * ```tsx
 * const [temp, setTemp] = useState(0.7);
 * <ParameterSlider
 *   label="Temperature"
 *   value={temp}
 *   onChange={setTemp}
 *   min={0}
 *   max={2}
 *   step={0.1}
 *   precision={1}
 * />
 * // …then: useGenerateText({ model, temperature: temp })
 * ```
 */
export function ParameterSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  unit,
  description,
  disabled = false,
  className,
}: ParameterSliderProps) {
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {value.toFixed(precision)}
          {unit && <span className={unit === '%' ? 'opacity-70' : 'ml-1 opacity-70'}>{unit}</span>}
        </span>
      </div>
      {/* Rendered on the Radix Slider primitive directly (rather than a wrapped
          `<Slider>`) so the accessible name + formatted readout land on the
          Thumb — the focusable `role="slider"` element. Radix ignores
          `aria-label` on the Root, so a wrapper cannot forward them. */}
      <SliderPrimitive.Root
        data-slot="slider"
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className="relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute h-full bg-primary"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label={label}
          aria-valuetext={`${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`}
          className="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Root>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
