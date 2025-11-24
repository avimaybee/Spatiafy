import { ProcessedImage } from '../types';
import { GoogleGenAI } from "@google/genai";
import { pipeline, env } from '@xenova/transformers';

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Configure Transformers.js
// We use CDN models, disallow local to prevent path errors in this env
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton for the segmenter and depth estimator
let segmenter: any = null;
let depthEstimator: any = null;

export const processImage = async (file: File, logCallback: (msg: string) => void): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      if (!e.target?.result) return reject('Failed to read file');

      const originalBase64 = e.target.result as string;
      const img = new Image();
      img.src = originalBase64;

      img.onload = async () => {
        try {
          // Step 1: Initialize & Segmentation
          logCallback('Loading neural vision model (RMBG-1.4)...');
          await sleep(100);

          // Get smart mask and foreground
          const { url: foregroundUrl, mask } = await createSmartForeground(originalBase64, logCallback);

          // Step 2: Background Generation (Inpainting)
          logCallback('Synthesizing deep background layer...');
          let rawBackgroundUrl = originalBase64;

          try {
            if (process.env.API_KEY) {
              // Try Gemini for "True" inpainting
              rawBackgroundUrl = await generateBackgroundWithGemini(originalBase64.split(',')[1], file.type, logCallback);
            } else {
              throw new Error("No API Key");
            }
          } catch (err) {
            console.warn("GenAI inpainting failed or no key, using fallback", err);
            logCallback('Using local context synthesis...');
            rawBackgroundUrl = await createBlurredBackground(img);
          }

          // Step 3: Depth Map Generation
          logCallback('Calculating depth topology...');
          const depthMapUrl = await createDepthMap(originalBase64, logCallback);

          // Step 4: Composite Perfect Background
          // This ensures the background behind the subject is filled, but the rest remains sharp/original
          logCallback('Composing seamless spatial layers...');
          const finalBackgroundUrl = await compositeBackground(img, rawBackgroundUrl, mask);
          await sleep(300);

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
          reject(error);
        }
      };

      img.onerror = () => reject('Failed to load image data');
    };

    reader.readAsDataURL(file);
  });
};

// ------------------------------------------------------------------
// Smart Segmentation (Client Side)
// ------------------------------------------------------------------

const createSmartForeground = async (imageUrl: string, log: (m: string) => void): Promise<{ url: string, mask: HTMLCanvasElement }> => {
  if (!segmenter) {
    log('Initializing AI Model...');
    // Use Xenova/u2net as fallback for RMBG-1.4 (which gave 401 errors)
    segmenter = await pipeline('image-segmentation', 'Xenova/u2net');
  }

  log('Extracting subject...');

  // Predict
  const result = await segmenter(imageUrl);

  // The result is usually a RawImage, convert to canvas
  // Transformers.js v2.17+ returns an object with `mask` and `image` depending on task, 
  // but for image-segmentation it returns the mask or RGBA image. 
  // For RMBG-1.4 specifically in transformers.js, it returns the RGBA image (subject).

  const resultCanvas = document.createElement('canvas');
  // result can be converted to canvas directly if it's a RawImage
  const processedImg = result.toCanvas ? result.toCanvas() : result;

  resultCanvas.width = processedImg.width;
  resultCanvas.height = processedImg.height;
  const rCtx = resultCanvas.getContext('2d');
  if (!rCtx) throw new Error('Context lost');
  rCtx.drawImage(processedImg, 0, 0);

  // Create a clean mask canvas for compositing logic
  // We need to extract the Alpha channel from the resultCanvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = resultCanvas.width;
  maskCanvas.height = resultCanvas.height;
  const mCtx = maskCanvas.getContext('2d');

  if (mCtx) {
    mCtx.drawImage(resultCanvas, 0, 0);
    // The resultCanvas already has the subject with alpha.
    // So this clone serves as our "Subject Mask Source".
  }

  return {
    url: resultCanvas.toDataURL(),
    mask: maskCanvas
  };
};

// ------------------------------------------------------------------
// Depth Estimation (Client Side)
// ------------------------------------------------------------------

const createDepthMap = async (imageUrl: string, log: (m: string) => void): Promise<string> => {
  if (!depthEstimator) {
    log('Initializing Depth Model...');
    // Use depth-anything-small-hf via Xenova
    depthEstimator = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
  }

  log('Scanning 3D structure...');
  const result = await depthEstimator(imageUrl);

  // result is { depth: Tensor, predicted_depth: Tensor } or similar depending on version
  // For depth-estimation pipeline, it typically returns an object with a 'depth' property which is a RawImage or similar

  // Convert to canvas
  // The pipeline output for depth-estimation usually contains a `depth` property which is the grayscale image
  const depthImage = result.depth;

  const canvas = document.createElement('canvas');
  const processedImg = depthImage.toCanvas ? depthImage.toCanvas() : depthImage;

  canvas.width = processedImg.width;
  canvas.height = processedImg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Context lost');

  ctx.drawImage(processedImg, 0, 0);

  return canvas.toDataURL();
};


// ------------------------------------------------------------------
// Background Compositing
// ------------------------------------------------------------------

const compositeBackground = (originalImg: HTMLImageElement, inpaintedBase64: string, subjectCanvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    const bgImg = new Image();
    bgImg.src = inpaintedBase64;
    bgImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = originalImg.width;
      canvas.height = originalImg.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(inpaintedBase64);

      // 1. Draw the Inpainted Background (The "Hole Filler") - Bottom Layer
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

      // 2. Draw the Original Image on top
      // We want to keep the original background pixels where they are valid, 
      // and only show the Inpainted Background where the subject USED to be.
      ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

      // 3. Cut the hole in the Original Image layer
      // We use the subject (which has alpha) to ERASE the subject pixels from the top layer (Original),
      // revealing the Inpainted Background underneath.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(subjectCanvas, 0, 0, canvas.width, canvas.height);

      // Reset
      ctx.globalCompositeOperation = 'source-over';

      resolve(canvas.toDataURL());
    };
  });
};


// ------------------------------------------------------------------
// Generative Fill
// ------------------------------------------------------------------

const generateBackgroundWithGemini = async (base64Data: string, mimeType: string, log: (m: string) => void): Promise<string> => {
  log('Generative fill (Cloud)...');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        {
          text: "Remove the main foreground subject. Fill the gap with the natural background texture and scene. Return only the image."
        }
      ]
    }
  });

  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        log('Background layer synthesis complete.');
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("No image generated");
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Fallback
const createBlurredBackground = (img: HTMLImageElement): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(img.src);
    canvas.width = img.width;
    canvas.height = img.height;

    // Heavy blur + scale to create depth ambiance
    ctx.filter = 'blur(40px) brightness(0.9)';
    ctx.drawImage(img, -20, -20, canvas.width + 40, canvas.height + 40);

    resolve(canvas.toDataURL());
  });
};