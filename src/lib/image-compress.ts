'use client';

import { IMAGE_RULES } from './plans';

const TARGET_BYTES = 350_000;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Resizes and re-encodes a photo in the browser (WebP where supported, JPEG otherwise) before upload.
 * This keeps R2 storage and bandwidth tiny and strips EXIF metadata such as GPS location.
 */
export async function compressImage(file: File, maxDimension = IMAGE_RULES.maxDimension): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 25_000_000) throw new Error('That photo is too large. Choose one under 25 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image could not be read. Try a JPEG or PNG photo.');
  }
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not process this image.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let best: Blob | null = null;
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await toBlob(canvas, type, quality);
      // Browsers without WebP encoding silently return PNG — skip to the JPEG fallback.
      if (!blob || blob.type !== type) break;
      best = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
    if (best) break;
  }
  if (!best || best.size > IMAGE_RULES.maxBytes) throw new Error('This image could not be compressed enough. Try a smaller photo.');
  return best;
}
