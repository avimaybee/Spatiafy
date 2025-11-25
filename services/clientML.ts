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
    segmentationPipeline = await pipeline(
      'image-segmentation',
      'Xenova/segformer_b2_clothes', // Good for person/background separation
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
  
  const results = await segmenter(imageUrl);
  console.log('[ML] Segmentation results:', results.map((r: any) => r.label));
  
  // Find the best foreground mask (person, or largest non-background segment)
  let bestMask = results[0];
  for (const result of results) {
    if (result.label?.toLowerCase().includes('person') || 
        result.label?.toLowerCase().includes('foreground')) {
      bestMask = result;
      break;
    }
  }
  
  onProgress?.(80, 'Creating foreground layer...');
  
  // Load original image
  const originalImage = await RawImage.fromURL(imageUrl);
  
  // Create canvas for the mask
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = originalImage.width;
  maskCanvas.height = originalImage.height;
  const maskCtx = maskCanvas.getContext('2d')!;
  
  // Draw the mask
  if (bestMask.mask) {
    const maskImage = bestMask.mask.toCanvas();
    maskCtx.drawImage(maskImage, 0, 0, maskCanvas.width, maskCanvas.height);
  }
  
  // Create foreground with transparency
  const foregroundCanvas = document.createElement('canvas');
  foregroundCanvas.width = originalImage.width;
  foregroundCanvas.height = originalImage.height;
  const fgCtx = foregroundCanvas.getContext('2d')!;
  
  // Draw original
  const originalCanvas = originalImage.toCanvas();
  fgCtx.drawImage(originalCanvas, 0, 0);
  
  // Apply mask as alpha channel
  const fgData = fgCtx.getImageData(0, 0, foregroundCanvas.width, foregroundCanvas.height);
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  
  for (let i = 0; i < fgData.data.length; i += 4) {
    // Use mask value as alpha (grayscale -> alpha)
    fgData.data[i + 3] = maskData.data[i]; // R channel of mask as alpha
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
    hasPredicted: !!result.predicted_depth
  });
  
  onProgress?.(90, 'Finalizing depth map...');
  
  // Get the depth map as canvas
  const depthCanvas = result.depth.toCanvas();
  
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
