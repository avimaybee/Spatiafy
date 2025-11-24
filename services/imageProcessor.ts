import { ProcessedImage } from '../types';
import { GoogleGenAI } from "@google/genai";

// Initialize the API clients
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// API Server base. In Vercel deploy the serverless functions live under `/api`,
// so default to an empty base which makes requests target `/api/*` on the same origin.
// Allow overriding with `VITE_API_SERVER` if needed (e.g. external API host).
const API_SERVER = import.meta.env.VITE_API_SERVER || '';

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
          // Step 1: Background Removal (Cloud)
          logCallback('Analyzing image with AI...');
          await sleep(100);

          // Get smart mask and foreground
          const { url: foregroundUrl, mask } = await createSmartForeground(originalBase64, logCallback);

          // Step 2: Background Generation (Gemini Inpainting)
          logCallback('Generating seamless background...');
          let rawBackgroundUrl = originalBase64;

          try {
            if (process.env.API_KEY) {
              // Use Gemini for high-quality inpainting
              rawBackgroundUrl = await generateBackgroundWithGemini(originalBase64.split(',')[1], file.type, logCallback);
            } else {
              throw new Error("No API Key");
            }
          } catch (err) {
            console.warn("GenAI inpainting failed or no key, using fallback", err);
            logCallback('Using fallback background synthesis...');
            rawBackgroundUrl = await createBlurredBackground(img);
          }

          // Step 3: Depth Map Generation (Cloud)
          logCallback('Mapping 3D depth structure...');
          const depthMapUrl = await createDepthMap(originalBase64, logCallback);

          // Step 4: Composite Perfect Background
          logCallback('Finalizing spatial layers...');
          const finalBackgroundUrl = await compositeBackground(img, rawBackgroundUrl, mask);
          await sleep(200);

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
// Smart Segmentation (via Backend API)
// ------------------------------------------------------------------

const createSmartForeground = async (imageUrl: string, log: (m: string) => void): Promise<{ url: string, mask: HTMLCanvasElement }> => {
  log('Removing background with RMBG-2.0...');

  // Convert base64 to blob
  const blob = await fetch(imageUrl).then(r => r.blob());

  // Call our backend API (which proxies to Hugging Face)
  const response = await fetch(`${API_SERVER}/api/segment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: blob,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Segmentation failed: ${error}`);
  }

  // Response is the segmented image (PNG with alpha channel)
  const resultBlob = await response.blob();
  const resultUrl = URL.createObjectURL(resultBlob);

  // Load into canvas to extract mask
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      
      // Create mask canvas from alpha channel
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;
      const mCtx = maskCanvas.getContext('2d');
      
      if (mCtx) {
        mCtx.drawImage(img, 0, 0);
      }

      resolve({
        url: canvas.toDataURL('image/png'),
        mask: maskCanvas
      });
    };
    img.onerror = () => reject(new Error('Failed to load segmented image'));
    img.src = resultUrl;
  });
};

// ------------------------------------------------------------------
// Depth Estimation (via Backend API)
// ------------------------------------------------------------------

const createDepthMap = async (imageUrl: string, log: (m: string) => void): Promise<string> => {
  log('Computing depth map with Depth-Anything-V2...');

  // Convert base64 to blob
  const blob = await fetch(imageUrl).then(r => r.blob());

  // Call our backend API (which proxies to Hugging Face)
  const response = await fetch(`${API_SERVER}/api/depth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: blob,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Depth estimation failed: ${error}`);
  }

  // Response is the depth map image (grayscale)
  const resultBlob = await response.blob();
  const resultUrl = URL.createObjectURL(resultBlob);

  // Convert to base64 for consistent format
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load depth map'));
    img.src = resultUrl;
  });
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