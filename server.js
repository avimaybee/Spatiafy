import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = 3002;

// Enable CORS for Vite dev server
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
const HF_ROUTER_BASE = 'https://router.huggingface.co/pipeline';
const SEGMENTATION_TASK = 'image-segmentation';
const DEPTH_TASK = 'depth-estimation';
const SEGMENTATION_MODEL = 'briaai/RMBG-2.0';
const DEPTH_MODEL = 'depth-anything/Depth-Anything-V2-Small-hf';
const MAX_ROUTER_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callRouter = async (task, model, body, attempt = 0) => {
  const response = await fetch(`${HF_ROUTER_BASE}/${task}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    body: Buffer.from(body),
  });

  if ((response.status === 202 || response.status === 503) && attempt < MAX_ROUTER_RETRIES) {
    let estimated = 1;
    try {
      const payload = await response.json();
      if (typeof payload?.estimated_time === 'number') {
        estimated = payload.estimated_time;
      }
    } catch (err) {
      console.warn('Router retry without JSON body', err.message);
    }

    const waitMs = Math.max(estimated * 1000, 1000);
    console.log(`⏳ Model warming up (attempt ${attempt + 1}/${MAX_ROUTER_RETRIES}), retrying in ${waitMs}ms...`);
    await sleep(waitMs);
    return callRouter(task, model, body, attempt + 1);
  }

  return response;
};

if (!HF_TOKEN) {
  console.warn('⚠️  Missing HUGGINGFACE_TOKEN. Cloud processing will fail until this is configured.');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Background removal endpoint
app.post('/api/segment', async (req, res) => {
  try {
    console.log('📸 Segmentation request received');
    
    const payload = Buffer.from(req.body);
    const response = await callRouter(SEGMENTATION_TASK, SEGMENTATION_MODEL, payload);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Segmentation failed:', error);
      return res.status(response.status).json({ error });
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(buffer));
    console.log('✅ Segmentation complete');
  } catch (error) {
    console.error('❌ Segmentation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Depth estimation endpoint
app.post('/api/depth', async (req, res) => {
  try {
    console.log('🗺️ Depth estimation request received');
    
    const payload = Buffer.from(req.body);
    const response = await callRouter(DEPTH_TASK, DEPTH_MODEL, payload);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Depth estimation failed:', error);
      return res.status(response.status).json({ error });
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(buffer));
    console.log('✅ Depth estimation complete');
  } catch (error) {
    console.error('❌ Depth estimation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
🚀 Spatiafy API Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🔑 HF Token: ${HF_TOKEN ? '✓ Configured' : '✗ Missing'}
🌐 CORS: Enabled for localhost:3000, localhost:3001
━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
