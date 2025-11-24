# 🚀 Quick Start Guide

## Prerequisites
- Node.js v18+ installed
- Hugging Face account with API token
- Google Gemini API key

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create `.env.local` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
HUGGINGFACE_TOKEN=your_hf_token_here
```

**Get your keys:**
- Gemini API: https://aistudio.google.com/apikey
- Hugging Face: https://huggingface.co/settings/tokens

### 3. Start the Application
```bash
npm run dev
```

This will start:
- ✅ Backend API Server on `http://localhost:3002`
- ✅ Frontend Vite Dev Server on `http://localhost:3000` (or 3001 if 3000 is busy)

### 4. Open in Browser
Navigate to the URL shown in the terminal (usually http://localhost:3000)

## Architecture

```
┌─────────────────┐
│   Frontend      │  React + Vite
│  (Port 3000)    │  
└────────┬────────┘
         │
         │ /api/* requests
         │ (proxied by Vite)
         ↓
┌─────────────────┐
│  Backend API    │  Express Server
│  (Port 3002)    │  
└────────┬────────┘
         │
         ├──→ Hugging Face API (segmentation + depth)
         └──→ Google Gemini API (inpainting)
```

## Troubleshooting

### Port Already in Use
If port 3000 or 3002 is busy, the app will automatically try the next available port.

### CORS Errors
Make sure the backend server is running before starting the frontend.

### API Errors
- Check that your API keys are correctly set in `.env.local`
- Verify your Hugging Face token has "Read" permissions
- Ensure your Gemini API key is active

### Dependencies Issues
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## Development Scripts

```bash
# Start both frontend and backend
npm run dev

# Start only frontend
npm run client

# Start only backend
npm run server

# Build for production
npm run build

# Preview production build
npm run preview
```

## Production Deployment

For production, you'll need to:
1. Deploy the Express backend (server.js) to a Node.js hosting service
2. Update `API_SERVER` in `imageProcessor.ts` with your production API URL
3. Build and deploy the frontend to a static hosting service

Example deployment platforms:
- Backend: Railway, Render, Fly.io, Heroku
- Frontend: Vercel, Netlify, Cloudflare Pages

## Tech Stack
- **Frontend**: React 19, TypeScript, Three.js, Vite
- **Backend**: Express.js, Node.js
- **AI Services**: Hugging Face Inference API, Google Gemini
- **Styling**: Tailwind CSS
