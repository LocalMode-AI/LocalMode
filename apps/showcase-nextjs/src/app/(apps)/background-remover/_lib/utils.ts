/**
 * @file utils.ts
 * @description Utility functions for the background-remover application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Apply a segmentation mask to an image, making the background transparent.
 * Uses an offscreen canvas to composite the image with the mask as an alpha channel.
 *
 * @param imageDataUrl - Original image as a data URL
 * @param mask - Segmentation mask (ImageData or Uint8Array)
 * @returns Promise resolving to a data URL of the transparent PNG
 */
export async function applyMaskToImage(
  imageDataUrl: string,
  mask: ImageData | Uint8Array
): Promise<string> {
  // Load the original image
  const img = await loadImage(imageDataUrl);
  const { naturalWidth: w, naturalHeight: h } = img;

  // Create canvas and draw original image
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Get image pixel data
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // Determine mask dimensions and data
  let maskData: Uint8ClampedArray | Uint8Array;
  let maskWidth: number;
  let maskHeight: number;

  if (mask instanceof ImageData) {
    maskData = mask.data;
    maskWidth = mask.width;
    maskHeight = mask.height;
  } else {
    // Uint8Array mask: assume it's a flat array of values (0 or 255)
    maskData = mask;
    maskWidth = w;
    maskHeight = h;
  }

  // Apply mask as alpha channel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const imgIdx = (y * w + x) * 4;

      // Map coordinates to mask space if dimensions differ
      const mx = Math.floor((x / w) * maskWidth);
      const my = Math.floor((y / h) * maskHeight);

      let alpha: number;
      if (mask instanceof ImageData) {
        // For ImageData, use the first channel (R) as the mask value
        const maskIdx = (my * maskWidth + mx) * 4;
        alpha = maskData[maskIdx];
      } else {
        // For Uint8Array, each value is the mask intensity
        const maskIdx = my * maskWidth + mx;
        alpha = maskData[maskIdx];
      }

      // Apply alpha: 0 = transparent (background), 255 = opaque (foreground)
      pixels[imgIdx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Load an image from a data URL
 * @param src - Image source URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
