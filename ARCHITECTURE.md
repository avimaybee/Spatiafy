# Spatiafy Architecture

## 🎯 Goal
**Best results in minimal time** - Using cloud-based AI for quality and speed.

## 🏗️ Processing Pipeline

### 1. Background Removal
- **Model**: `briaai/RMBG-2.0`
- **Method**: Hugging Face Inference API
- **Output**: Foreground with alpha channel + mask
- **Speed**: ~2-3 seconds

### 2. Background Inpainting
- **Model**: Google Gemini 2.5 Flash Image
- **Method**: Generative AI (cloud)
- **Prompt**: "Remove the main foreground subject. Fill the gap with natural background texture"
- **Fallback**: Client-side blur (40px Gaussian)
- **Speed**: ~3-5 seconds

### 3. Depth Estimation
- **Model**: `depth-anything/Depth-Anything-V2-Small-hf`
- **Method**: Hugging Face Inference API
- **Output**: Grayscale depth map
- **Speed**: ~2-4 seconds

### 4. Layer Compositing
- **Method**: Canvas API (client-side)
- **Output**: Final background with subject removed
- **Speed**: <1 second

**Total Processing Time**: ~7-13 seconds

## 🔑 API Requirements

### Hugging Face Token
- Used for: Background removal + Depth estimation
- Get token: https://huggingface.co/settings/tokens
- Permissions: Read access to inference API

### Gemini API Key
- Used for: Background inpainting (generative fill)
- Get key: https://aistudio.google.com/apikey
- Fallback: Blur effect if unavailable

## 🎨 3D Rendering

### Layer System
```
Background Layer (z = -1.5)
  ├─ Inpainted background
  ├─ Scale: 1.2x (prevent edges)
  └─ Depth: Pushed back

Foreground Layer (z = 0)
  ├─ Segmented subject
  ├─ Alpha channel transparency
  └─ Displacement: Depth map (0.5 scale)
```

### Controls
- **Mobile**: DeviceOrientation API (gyroscope)
- **Desktop**: Mouse position tracking
- **Smooth**: Lerp interpolation (delta * 3)

## 📦 Tech Stack

### Core
- React 19 + TypeScript
- Vite (build tool)
- Three.js + React Three Fiber

### AI Services
- Hugging Face Inference API
- Google Gemini API

### UI
- Tailwind CSS (via CDN)
- Lucide React (icons)
- Custom neo-brutalist design system

## 🚀 Performance Optimizations

### Current
- Cloud-based AI (no model downloads)
- Async processing with progress logs
- Canvas-based compositing
- GPU-accelerated 3D rendering (Three.js)

### Future
- Image resizing before upload (max 1920px)
- Parallel API calls (segmentation + depth)
- Result caching (IndexedDB)
- Progressive image loading

## 🔐 Privacy & Security

- **API Keys**: Client-side only (not exposed in build)
- **Images**: Sent to cloud APIs for processing
- **Storage**: Memory-based (no server upload)
- **Future**: Option for local processing

## 📊 Quality vs Speed Trade-offs

| Approach | Speed | Quality | Device Load |
|----------|-------|---------|-------------|
| **Cloud AI** (current) | ⚡⚡⚡ Fast | ⭐⭐⭐ Excellent | 🔋 Low |
| Client-side AI | 🐌 Slow | ⭐⭐ Good | 🔥 High |
| Hybrid | ⚡⚡ Medium | ⭐⭐⭐ Excellent | 🔋 Medium |

**Current choice**: Cloud AI for best results with minimal wait time.
