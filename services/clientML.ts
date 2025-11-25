/**
 * Client-side ML service using Transformers.js
 * Runs models directly in the browser – no backend required!
 */

import { pipeline, env, RawImage } from '@huggingface/transformers';

// Configure Transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton pipelines (loaded once, reused)
let segmentationPipeline: any = null;
let depthPipeline: any = null;

// Loading state
let isLoadingSegmentation = false;
let isLoadingDepth = false;

// ------------------------------------------------------------------
// Helper functions for image conversion
// ------------------------------------------------------------------

/**
 * Load an image URL into an HTMLCanvasElement
 */
function loadImageToCanvas(imageUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Failed to get canvas context'));
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

/**
 * Convert a RawImage (from Transformers.js) to HTMLCanvasElement
 */
function rawImageToCanvas(rawImage: any): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rawImage.width;
  canvas.height = rawImage.height;
  const ctx = canvas.getContext('2d')!;
  
  // RawImage has width, height, channels, and data (Uint8Array or similar)
  const imageData = ctx.createImageData(rawImage.width, rawImage.height);
  
  if (rawImage.channels === 1) {
    // Grayscale - expand to RGBA
    for (let i = 0; i < rawImage.data.length; i++) {
      const val = rawImage.data[i];
      imageData.data[i * 4] = val;     // R
      imageData.data[i * 4 + 1] = val; // G
      imageData.data[i * 4 + 2] = val; // B
      imageData.data[i * 4 + 3] = 255; // A
    }
  } else if (rawImage.channels === 3) {
    // RGB - add alpha
    for (let i = 0; i < rawImage.width * rawImage.height; i++) {
      imageData.data[i * 4] = rawImage.data[i * 3];     // R
      imageData.data[i * 4 + 1] = rawImage.data[i * 3 + 1]; // G
      imageData.data[i * 4 + 2] = rawImage.data[i * 3 + 2]; // B
      imageData.data[i * 4 + 3] = 255; // A
    }
  } else if (rawImage.channels === 4) {
    // RGBA - direct copy
    imageData.data.set(rawImage.data);
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ------------------------------------------------------------------
// Pipeline loaders
// ------------------------------------------------------------------

/**
 * Get or initialize the segmentation pipeline.
 * Uses RMBG model optimized for background removal.
 */
export async function getSegmentationPipeline(onProgress?: (progress: number, status: string) => void) {
  if (segmentationPipeline) return segmentationPipeline;
  if (isLoadingSegmentation) {
    // Wait for existing load to complete
    while (isLoadingSegmentation) {
      await new Promise(r => setTimeout(r, 100));
    }
    return segmentationPipeline;
  }

  isLoadingSegmentation = true;
  onProgress?.(0, 'Loading background removal model...');

  try {
    console.log('[ML] Loading segmentation model...');
    // Use MODNet which is optimized for portrait/human background removal via Transformers.js
    segmentationPipeline = await pipeline(
      'image-segmentation',
      'Xenova/modnet',
      {
        progress_callback: (progress: any) => {
          if (progress.status === 'progress' && progress.total) {
            const pct = Math.round((progress.loaded / progress.total) * 100);
            onProgress?.(pct, `Downloading model: ${pct}%`);
            console.log(`[ML] Download progress: ${pct}%`);
          }
        }
      }
    );
    console.log('[ML] ✅ Segmentation model loaded');
    return segmentationPipeline;
  } finally {
    isLoadingSegmentation = false;
  }
}

/**
 * Get or initialize the depth estimation pipeline.
 * Uses DPT model for monocular depth estimation.
 */
export async function getDepthPipeline(onProgress?: (progress: number, status: string) => void) {
  if (depthPipeline) return depthPipeline;
  if (isLoadingDepth) {
    while (isLoadingDepth) {
      await new Promise(r => setTimeout(r, 100));
    }
    return depthPipeline;
  }

  isLoadingDepth = true;
  onProgress?.(0, 'Loading depth estimation model...');

  try {
    console.log('[ML] Loading depth model...');
    depthPipeline = await pipeline(
      'depth-estimation',
      'Xenova/depth-anything-small-hf', // Fast and accurate depth
      {
        progress_callback: (progress: any) => {
          if (progress.status === 'progress') {
            const pct = Math.round((progress.loaded / progress.total) * 100);
            onProgress?.(pct, `Downloading model: ${pct}%`);
            console.log(`[ML] Download progress: ${pct}%`);
          }
        }
      }
    );
    console.log('[ML] ✅ Depth model loaded');
    return depthPipeline;
  } finally {
    isLoadingDepth = false;
  }
}

/**
 * Remove background from an image using client-side ML.
 * Returns the foreground image with transparent background.
 */
export async function removeBackground(
  imageUrl: string,
  onProgress?: (progress: number, status: string) => void
): Promise<{ foregroundUrl: string; mask: HTMLCanvasElement }> {
  console.log('[ML] 🎯 Starting background removal...');
  
  onProgress?.(10, 'Initializing segmentation model...');
  const segmenter = await getSegmentationPipeline(onProgress);
  
  onProgress?.(50, 'Processing image...');
  console.log('[ML] Running segmentation...');
  
  // MODNet and similar models return segmentation results
  const results = await segmenter(imageUrl);
  console.log('[ML] Segmentation results:', results);
  console.log('[ML] Results type:', Array.isArray(results) ? 'array' : typeof results);
  if (Array.isArray(results) && results.length > 0) {
    console.log('[ML] First result keys:', Object.keys(results[0]));
  }
  
  onProgress?.(80, 'Creating foreground layer...');
  
  // Load original image using RawImage for consistency
  const originalImage = await RawImage.fromURL(imageUrl);
  console.log('[ML] Original image:', originalImage.width, 'x', originalImage.height, 'channels:', originalImage.channels);
  
  // The segmentation pipeline typically returns an array of objects with:
  // - label: string (e.g., "foreground", "background", "person")
  // - score: number
  // - mask: RawImage (grayscale mask where 255=object, 0=background)
  
  // Find the foreground/person mask
  let maskRawImage: any = null;
  
  if (Array.isArray(results)) {
    // Look for a mask - could be labeled "foreground", "person", or just the first mask
    for (const result of results) {
      console.log('[ML] Result item:', { label: result.label, score: result.score, hasMask: !!result.mask });
      if (result.mask) {
        // Use the first valid mask we find (MODNet typically returns one mask)
        maskRawImage = result.mask;
        break;
      }
    }
  } else if (results && results.mask) {
    maskRawImage = results.mask;
  }
  
  if (!maskRawImage) {
    throw new Error('No mask found in segmentation results');
  }
  
  console.log('[ML] Mask:', maskRawImage.width, 'x', maskRawImage.height, 'channels:', maskRawImage.channels);
  
  // Create mask canvas at original image size
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = originalImage.width;
  maskCanvas.height = originalImage.height;
  const maskCtx = maskCanvas.getContext('2d')!;
  
  // Convert RawImage mask to canvas, scaling to original size
  const tempMaskCanvas = rawImageToCanvas(maskRawImage);
  maskCtx.drawImage(tempMaskCanvas, 0, 0, maskCanvas.width, maskCanvas.height);
  
  // Create foreground canvas with transparency
  const foregroundCanvas = document.createElement('canvas');
  foregroundCanvas.width = originalImage.width;
  foregroundCanvas.height = originalImage.height;
  const fgCtx = foregroundCanvas.getContext('2d')!;
  
  // Draw the original image onto foreground canvas
  const originalCanvas = rawImageToCanvas(originalImage);
  fgCtx.drawImage(originalCanvas, 0, 0);
  
  // Get pixel data from both canvases
  const fgData = fgCtx.getImageData(0, 0, foregroundCanvas.width, foregroundCanvas.height);
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  
  // Apply mask as alpha channel
  // Mask is grayscale: 255 = foreground (keep), 0 = background (transparent)
  for (let i = 0; i < fgData.data.length; i += 4) {
    // Use the red channel of the mask as alpha (grayscale, so R=G=B)
    fgData.data[i + 3] = maskData.data[i]; // Set alpha from mask
  }
  
  fgCtx.putImageData(fgData, 0, 0);
  
  onProgress?.(100, 'Background removal complete!');
  console.log('[ML] ✅ Background removal complete');
  
  return {
    foregroundUrl: foregroundCanvas.toDataURL('image/png'),
    mask: maskCanvas
  };
}

/**
 * Estimate depth from an image using client-side ML.
 * Returns a grayscale depth map.
 */
export async function estimateDepth(
  imageUrl: string,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  console.log('[ML] 🗺️ Starting depth estimation...');
  
  onProgress?.(10, 'Initializing depth model...');
  const depthEstimator = await getDepthPipeline(onProgress);
  
  onProgress?.(50, 'Computing depth map...');
  console.log('[ML] Running depth estimation...');
  
  const result = await depthEstimator(imageUrl);
  console.log('[ML] Depth result:', {
    hasDepth: !!result.depth,
    hasPredicted: !!result.predicted_depth,
    depthType: result.depth?.constructor?.name,
    depthKeys: result.depth ? Object.keys(result.depth) : []
  });
  
  onProgress?.(90, 'Finalizing depth map...');
  
  // Convert the depth RawImage to canvas
  const depthCanvas = rawImageToCanvas(result.depth);
  
  onProgress?.(100, 'Depth estimation complete!');
  console.log('[ML] ✅ Depth estimation complete');
  
  return depthCanvas.toDataURL('image/png');
}

/**
 * Preload all models in the background.
 * Call this early to improve UX.
 */
export async function preloadModels(onProgress?: (status: string) => void) {
  console.log('[ML] 🚀 Preloading models...');
  onProgress?.('Loading AI models...');
  
  try {
    await Promise.all([
      getSegmentationPipeline(),
      getDepthPipeline()
    ]);
    console.log('[ML] ✅ All models preloaded');
    onProgress?.('Models ready!');
  } catch (err) {
    console.error('[ML] ❌ Failed to preload models:', err);
    onProgress?.('Model preload failed');
  }
}

/**
 * Check if models are already loaded.
 */
export function areModelsLoaded(): boolean {
  return segmentationPipeline !== null && depthPipeline !== null;
}
