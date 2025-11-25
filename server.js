import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3002;

// ─────────────────────────────────────────────────────────────────────────────
// CORS – allow common local dev origins
// ─────────────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Request logging middleware – assigns unique request ID
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.id}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
const HF_ROUTER_BASE = 'https://router.huggingface.co/pipeline';
const SEGMENTATION_TASK = 'image-segmentation';
const DEPTH_TASK = 'depth-estimation';
const SEGMENTATION_MODEL = 'briaai/RMBG-2.0';
const DEPTH_MODEL = 'depth-anything/Depth-Anything-V2-Small-hf';
const MAX_ROUTER_RETRIES = 5;
const HF_TIMEOUT_MS = 120_000; // 2 minutes

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call Hugging Face Inference Router with automatic retry on model warm-up.
 */
const callRouter = async (task, model, body, reqId, attempt = 0) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const response = await fetch(`${HF_ROUTER_BASE}/${task}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(body),
      signal: controller.signal,
    });

    if ((response.status === 202 || response.status === 503) && attempt < MAX_ROUTER_RETRIES) {
      let estimated = 1;
      try {
        const payload = await response.json();
        if (typeof payload?.estimated_time === 'number') {
          estimated = payload.estimated_time;
        }
      } catch {
        // ignore parse errors – use default wait
      }

      const waitMs = Math.max(estimated * 1000, 1000);
      console.log(`[${reqId}] ⏳ Model warming up (attempt ${attempt + 1}/${MAX_ROUTER_RETRIES}), retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      return callRouter(task, model, body, reqId, attempt + 1);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
};

if (!HF_TOKEN) {
  console.warn('⚠️  Missing HUGGINGFACE_TOKEN. Cloud processing will fail until this is configured.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    hfToken: HF_TOKEN ? 'configured' : 'missing',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Background removal endpoint
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/segment', async (req, res) => {
  try {
    if (!HF_TOKEN) {
      console.error(`[${req.id}] ❌ Segmentation blocked: missing HUGGINGFACE_TOKEN`);
      return res.status(500).json({ error: 'Missing HUGGINGFACE_TOKEN on API server' });
    }
    console.log(`[${req.id}] 📸 Segmentation request received`);

    const payload = Buffer.from(req.body);
    if (!payload.length) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    const response = await callRouter(SEGMENTATION_TASK, SEGMENTATION_MODEL, payload, req.id);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[${req.id}] ❌ Segmentation failed:`, error);
      return res.status(response.status).json({ error });
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(buffer));
    console.log(`[${req.id}] ✅ Segmentation complete`);
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Request timed out' : error.message;
    console.error(`[${req.id}] ❌ Segmentation error:`, error);
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Depth estimation endpoint
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/depth', async (req, res) => {
  try {
    if (!HF_TOKEN) {
      console.error(`[${req.id}] ❌ Depth estimation blocked: missing HUGGINGFACE_TOKEN`);
      return res.status(500).json({ error: 'Missing HUGGINGFACE_TOKEN on API server' });
    }
    console.log(`[${req.id}] 🗺️ Depth estimation request received`);

    const payload = Buffer.from(req.body);
    if (!payload.length) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    const response = await callRouter(DEPTH_TASK, DEPTH_MODEL, payload, req.id);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[${req.id}] ❌ Depth estimation failed:`, error);
      return res.status(response.status).json({ error });
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(buffer));
    console.log(`[${req.id}] ✅ Depth estimation complete`);
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Request timed out' : error.message;
    console.error(`[${req.id}] ❌ Depth estimation error:`, error);
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Start server with graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`
🚀 Spatiafy API Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🔑 HF Token: ${HF_TOKEN ? '✓ Configured' : '✗ Missing'}
🌐 CORS: localhost:3000, localhost:3001, 127.0.0.1:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received – shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections linger
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
