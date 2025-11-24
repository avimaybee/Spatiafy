<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Spatiafy - 3D Spatial Photo Converter

Turn any 2D photo into an Apple-like spatial memory with parallax effects. Built for **speed and quality** using cloud-based AI.



## 🚀 Features

- **AI Background Removal** - RMBG-2.0 via Hugging Face
- **Depth Mapping** - Depth-Anything-V2 for accurate 3D structure
- **Smart Inpainting** - Gemini 2.5 Flash for seamless backgrounds
- **3D Parallax Effect** - Gyroscope (mobile) + Mouse controls (desktop)
- **Fast Processing** - Cloud-based for best results in minimal time

## Run Locally

**Prerequisites:** Node.js + API Keys

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with your API keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   HUGGINGFACE_TOKEN=your_hf_token
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

## Tech Stack

- React 19 + TypeScript + Vite
- Three.js + React Three Fiber for 3D rendering
- Hugging Face Inference API for AI models
- Google Gemini API for inpainting
- Tailwind CSS for styling
