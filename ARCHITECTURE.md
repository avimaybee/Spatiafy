# Spatiafy Architecture

## 🎯 Goal
**Best results in minimal time** - Using client-side AI for quality and cloud APIs for enhanced features.

## 🏗️ Processing Pipeline

### 1. Background Removal
- **Model**: `Xenova/modnet` (Client-side Transformers.js)
- **Method**: Client-side ML inference
- **Output**: Foreground with alpha channel + mask
- **Speed**: ~5-10 seconds (first run includes model download)

### 2. Background Generation
- **Model**: Client-side blur (fallback)
- **Optional**: Google Gemini 2.5 Flash Image (cloud inpainting)
- **Fallback**: 40px Gaussian blur on original
- **Speed**: <1 second (blur) / ~3-5 seconds (cloud)

### 3. Depth Estimation
- **Model**: `Xenova/depth-anything-small-hf` (Client-side)
- **Method**: Transformers.js monocular depth estimation
- **Output**: Grayscale depth map (white=close, black=far)
- **Speed**: ~3-5 seconds

**Total Processing Time**: ~10-20 seconds (with model caching)

## 🎨 3D Rendering - Depth Parallax Effect

### Shader-Based Fake 3D Parallax
Instead of mesh displacement, we use **UV displacement in fragment shaders**:

```glsl
// Core parallax formula
float depth = texture2D(depthMap, uv).r;
float depthOffset = (depth - 0.5) * intensity;
vec2 parallaxUV = uv + mouse * depthOffset;
vec4 color = texture2D(originalImage, parallaxUV);
```

**Why this approach?**
1. **No mesh distortion** - Pure 2D image manipulation
2. **GPU-accelerated** - All computation in shaders
3. **Facebook 3D photo effect** - Natural, smooth parallax
4. **Edge handling** - UV mirroring prevents artifacts

### Two Rendering Modes

#### Simple Parallax Mode
- Single plane with depth-displaced UV sampling
- Original image + depth map
- Great for portraits and single subjects

#### Multi-Layer Parallax Mode
- Background layer: Strong inverse parallax (far objects)
- Foreground layer: Subtle parallax with mask compositing
- Depth-of-field blur on background
- Film grain and vignette for cinematic look

### Custom Shader Uniforms
```typescript
{
  uOriginalTexture: Texture,    // Source image
  uDepthTexture: Texture,       // Grayscale depth map
  uMouse: Vector2,              // Normalized input (-1 to 1)
  uIntensity: float,            // Parallax strength (0.1-0.3)
  uDepthScale: float,           // Depth contrast multiplier
  uEnableDOF: boolean,          // Depth-of-field blur
  uEnableVignette: boolean,     // Edge darkening effect
}
```

### Controls
- **Mobile**: DeviceOrientation API (gyroscope tilt)
- **Desktop**: Mouse position tracking
- **Smooth**: Exponential lerp interpolation

## 📦 Tech Stack

### Core
- React 19 + TypeScript
- Vite (build tool)
- Three.js + React Three Fiber
- @react-three/drei (shader utilities)

### AI Services
- Transformers.js (client-side ML)
- Optional: Google Gemini API (cloud inpainting)

### UI
- Tailwind CSS
- Lucide React (icons)
- Custom neo-brutalist design system

## 🚀 Performance Optimizations

### Current
- Client-side ML (models cached after first download)
- Shader-based rendering (GPU-accelerated)
- Single geometry per mode (minimal draw calls)
- Texture mirroring (prevents edge artifacts)

### Future
- Image resizing before processing (max 1920px)
- Web Workers for ML inference
- Result caching (IndexedDB)
- Texture compression

## 🔐 Privacy & Security

- **ML Models**: Downloaded to browser cache
- **Images**: Processed client-side (no upload required)
- **API Keys**: Only used for optional cloud features
- **Storage**: Memory-based (cleared on refresh)
- **Future**: Option for local processing

## 📊 Quality vs Speed Trade-offs

| Approach | Speed | Quality | Device Load |
|----------|-------|---------|-------------|
| **Cloud AI** (current) | ⚡⚡⚡ Fast | ⭐⭐⭐ Excellent | 🔋 Low |
| Client-side AI | 🐌 Slow | ⭐⭐ Good | 🔥 High |
| Hybrid | ⚡⚡ Medium | ⭐⭐⭐ Excellent | 🔋 Medium |

**Current choice**: Cloud AI for best results with minimal wait time.
