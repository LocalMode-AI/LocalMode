'use client';

import { useState } from 'react';
import { ParameterSlider } from './parameter-slider';

/**
 * Demo for ParameterSlider, used by the docs live preview. Three sliders model
 * the common generation knobs; the live readout updates as you drag, and the
 * values are exactly what you would pass to `useGenerateText` / `useChat`. Pure
 * UI — no model download.
 */
export default function ParameterSliderDemo() {
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(256);
  const [nGpuLayers, setNGpuLayers] = useState(32);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <ParameterSlider
        label="Temperature"
        value={temperature}
        onChange={setTemperature}
        min={0}
        max={2}
        step={0.1}
        precision={1}
        description="Higher = more random output."
      />
      <ParameterSlider
        label="Max tokens"
        value={maxTokens}
        onChange={setMaxTokens}
        min={16}
        max={2048}
        step={16}
        unit="tokens"
      />
      <ParameterSlider
        label="GPU layers"
        value={nGpuLayers}
        onChange={setNGpuLayers}
        min={0}
        max={64}
        step={1}
        description="Layers offloaded to the GPU (wllama)."
      />
    </div>
  );
}
