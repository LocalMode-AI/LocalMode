/**
 * @file browser-utils.test.ts
 * @description Node unit tests for the pure `compositeMaskAlpha` mask→alpha
 * kernel promoted into `registry/localmode/lib/browser-utils.ts` (group 4 of
 * blocks-shared-promotions). Imports the registry source directly so it runs in
 * the existing node-env Vitest (`scripts/**\/*.test.ts` glob) with no config or
 * DOM shim — the kernel is DOM-free by design. The canvas/DOM shells that call
 * it (`applyMaskToImage` end-to-end, `imageResultToDataUrl` `toDataURL`) are a
 * documented browser-only gap, closed by the image-studio E2E PNG byte-decode
 * (`e2e/blocks/image-studio.spec.ts` — IHDR colour type 6 + real alpha variance).
 */
import { describe, it, expect } from 'vitest';
import { compositeMaskAlpha } from '../registry/localmode/lib/browser-utils';

/** Build an RGBA pixel buffer for `w×h` with a constant RGB and a 0 alpha. */
function makePixels(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = rgb[0];
    px[i * 4 + 1] = rgb[1];
    px[i * 4 + 2] = rgb[2];
    px[i * 4 + 3] = 0;
  }
  return px;
}

describe('compositeMaskAlpha — same-resolution flat (single-channel) mask', () => {
  it('copies each mask value into the matching pixel alpha byte', () => {
    // 2×2 image, flat 1-byte-per-cell mask (length 4 !== 4*4, so stride 1).
    const pixels = makePixels(2, 2, [10, 20, 30]);
    const mask = new Uint8Array([255, 0, 128, 64]);

    compositeMaskAlpha(pixels, 2, 2, mask, 2, 2);

    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([255, 0, 128, 64]);
  });

  it('leaves the RGB channels untouched', () => {
    const pixels = makePixels(2, 2, [10, 20, 30]);
    const mask = new Uint8Array([255, 0, 128, 64]);

    compositeMaskAlpha(pixels, 2, 2, mask, 2, 2);

    for (let i = 0; i < 4; i++) {
      expect([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]).toEqual([10, 20, 30]);
    }
  });

  it('mutates and returns the same pixel buffer reference', () => {
    const pixels = makePixels(1, 1, [1, 2, 3]);
    const returned = compositeMaskAlpha(pixels, 1, 1, new Uint8Array([200]), 1, 1);

    expect(returned).toBe(pixels);
    expect(pixels[3]).toBe(200);
  });
});

describe('compositeMaskAlpha — same-resolution ImageData-like (RGBA) mask', () => {
  it('reads the R channel of a 4-byte-per-cell mask (stride inferred from length)', () => {
    // 2×2 image; mask.length === 2*2*4 → stride 4 → alpha comes from the R byte.
    const pixels = makePixels(2, 2, [10, 20, 30]);
    const rBytes = [255, 0, 128, 64];
    const mask = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      mask[i * 4] = rBytes[i]; // R — the channel the kernel must read
      mask[i * 4 + 1] = 99; // G — must be ignored
      mask[i * 4 + 2] = 99; // B — must be ignored
      mask[i * 4 + 3] = 99; // A — must be ignored
    }

    compositeMaskAlpha(pixels, 2, 2, mask, 2, 2);

    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([255, 0, 128, 64]);
  });
});

describe('compositeMaskAlpha — downscaled mask (nearest-neighbour resampling)', () => {
  it('samples the nearest 2×2 mask cell for every pixel of a 4×4 image', () => {
    // 4×4 image, 2×2 flat mask [A,B,C,D]. floor((x/4)*2): x0,1→0  x2,3→1 (same for y).
    // Expected quadrants: TL→A, TR→B, BL→C, BR→D.
    const pixels = makePixels(4, 4, [5, 5, 5]);
    const A = 200,
      B = 150,
      C = 100,
      D = 50;
    const mask = new Uint8Array([A, B, C, D]);

    compositeMaskAlpha(pixels, 4, 4, mask, 2, 2);

    const alphaAt = (x: number, y: number) => pixels[(y * 4 + x) * 4 + 3];
    const expected = [
      [A, A, B, B],
      [A, A, B, B],
      [C, C, D, D],
      [C, C, D, D],
    ];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(alphaAt(x, y), `alpha at (${x},${y})`).toBe(expected[y][x]);
      }
    }
  });

  it('resamples an RGBA (stride-4) downscaled mask by its R channel', () => {
    const pixels = makePixels(4, 4, [5, 5, 5]);
    const rBytes = [200, 150, 100, 50]; // A,B,C,D
    const mask = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      mask[i * 4] = rBytes[i];
      mask[i * 4 + 1] = 7;
      mask[i * 4 + 2] = 7;
      mask[i * 4 + 3] = 7;
    }

    compositeMaskAlpha(pixels, 4, 4, mask, 2, 2);

    expect(pixels[(0 * 4 + 0) * 4 + 3]).toBe(200); // TL → A
    expect(pixels[(0 * 4 + 3) * 4 + 3]).toBe(150); // TR → B
    expect(pixels[(3 * 4 + 0) * 4 + 3]).toBe(100); // BL → C
    expect(pixels[(3 * 4 + 3) * 4 + 3]).toBe(50); // BR → D
  });
});
