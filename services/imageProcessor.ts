import { ProcessedImage } from '../types';
import { removeBackground, estimateDepth, preloadModels } from './clientML';

/**
 * Process an image using client-side ML (Transformers.js).
 * No backend server required - runs entirely in the browser!
 */
export const processImage = async (
  file: File,
  logCallback: (msg: string) => void
): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      if (!e.target?.result) return reject('Failed to read file');

      const originalBase64 = e.target.result as string;
      const img = new Image();
      img.src = originalBase64;

      img.onload = async () => {
        try {
          const startTime = Date.now();
          
          // Step 1: Background Removal (Client-side ML)
          logCallback('🧠 Loading AI model for background removal...');
          console.log('[Process] Starting background removal...');
          
          const { foregroundUrl, mask } = await removeBackground(
            originalBase64,
            (progress, status) => {
              logCallback(status);
              console.log(`[Process] Segmentation: ${progress}% - ${status}`);
            }
          );
          
          console.log('[Process] ✅ Background removal complete');

          // Step 2: Create background layer (blur fallback - fast & reliable)
          logCallback('🎨 Creating background layer...');
          const backgroundUrl = await createBlurredBackground(img);
          
          // Step 3: Composite the final background
          logCallback('🔧 Compositing layers...');
          const finalBackgroundUrl = await compositeBackground(img, backgroundUrl, mask);

          // Step 4: Depth Map Generation (Client-side ML)
          logCallback('🗺️ Loading AI model for depth mapping...');
          console.log('[Process] Starting depth estimation...');
          
          const depthMapUrl = await estimateDepth(
            originalBase64,
            (progress, status) => {
              logCallback(status);
              console.log(`[Process] Depth: ${progress}% - ${status}`);
            }
          );
          
          console.log('[Process] ✅ Depth estimation complete');

          const totalTime = Date.now() - startTime;
          logCallback(`✅ Processing complete! (${(totalTime / 1000).toFixed(1)}s)`);
          console.log(`[Process] Total processing time: ${totalTime}ms`);

          resolve({
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
            name: file.name,
            originalUrl: originalBase64,
            foregroundUrl: foregroundUrl,
            backgroundUrl: finalBackgroundUrl,
            depthMapUrl: depthMapUrl,
            aspectRatio: img.width / img.height,
            width: img.width,
            height: img.height
          });

        } catch (error) {
          console.error('[Process] ❌ Processing failed:', error);
          reject(error);
        }
      };

      img.onerror = () => reject('Failed to load image data');
    };

    reader.onerror = () => reject('Failed to read file');
    reader.readAsDataURL(file);
  });
};

/**
 * Preload ML models in background for faster first-image processing.
 * Call this when the app loads.
 */
export { preloadModels };

// ------------------------------------------------------------------
// Background Compositing
// ------------------------------------------------------------------

const compositeBackground = (
  originalImg: HTMLImageElement,
  backgroundBase64: string,
  subjectMask: HTMLCanvasElement
): Promise<string> => {
  return new Promise((resolve) => {
    const bgImg = new Image();
    bgImg.src = backgroundBase64;
    bgImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = originalImg.width;
      canvas.height = originalImg.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(backgroundBase64);

      // 1. Draw the Background (blur layer) - Bottom
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

      // 2. Draw the Original Image on top
      ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

      // 3. Cut out the subject area using the mask
      // This reveals the blurred background where the subject was
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(subjectMask, 0, 0, canvas.width, canvas.height);

      // Reset composite mode
      ctx.globalCompositeOperation = 'source-over';

      resolve(canvas.toDataURL('image/png'));
    };
    bgImg.onerror = () => resolve(backgroundBase64);
  });
};

// ------------------------------------------------------------------
// Fallback Background (Blur)
// ------------------------------------------------------------------

const createBlurredBackground = (img: HTMLImageElement): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(img.src);
    
    canvas.width = img.width;
    canvas.height = img.height;

    // Heavy blur + slight darkening to create depth ambiance
    ctx.filter = 'blur(40px) brightness(0.9)';
    ctx.drawImage(img, -20, -20, canvas.width + 40, canvas.height + 40);
    ctx.filter = 'none';

    resolve(canvas.toDataURL('image/png'));
  });
};