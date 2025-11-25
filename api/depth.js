const {
  readRaw,
  callRouter,
  setCorsHeaders,
  handlePreflight,
} = require('./_lib/hf');

const DEPTH_TASK = 'depth-estimation';
const DEPTH_MODEL = 'depth-anything/Depth-Anything-V2-Small-hf';

/**
 * Vercel Serverless Function – Depth Estimation via Depth-Anything-V2
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log('[depth] 🗺️ Incoming request');
  console.log(`[depth]    Method: ${req.method}`);
  console.log(`[depth]    URL: ${req.url}`);
  console.log(`[depth]    Headers: ${JSON.stringify(req.headers['content-type'] || 'none')}`);

  setCorsHeaders(res);

  if (handlePreflight(req, res)) {
    console.log('[depth] ↩️ Preflight handled');
    return;
  }

  if (req.method !== 'POST') {
    console.warn(`[depth] ⚠️ Invalid method: ${req.method}`);
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
  console.log(`[depth] 🔑 HUGGINGFACE_TOKEN: ${HF_TOKEN ? 'present' : 'MISSING'}`);
  if (!HF_TOKEN) {
    console.error('[depth] ❌ Missing HUGGINGFACE_TOKEN env var');
    return res.status(500).json({ error: 'Server misconfigured: missing HUGGINGFACE_TOKEN' });
  }

  try {
    const body = await readRaw(req, 'depth');
    if (!body.length) {
      console.warn('[depth] ⚠️ Empty request body');
      return res.status(400).json({ error: 'Empty request body' });
    }
    console.log(`[depth] 📦 Payload ready: ${body.length} bytes`);

    console.log(`[depth] 🚀 Calling Depth-Anything-V2 model...`);
    const hfRes = await callRouter(DEPTH_TASK, DEPTH_MODEL, body, HF_TOKEN, 'depth');

    if (!hfRes.ok) {
      const text = await hfRes.text();
      console.error(`[depth] ❌ HF error ${hfRes.status}: ${text}`);
      return res.status(hfRes.status).json({ error: text || 'Hugging Face request failed' });
    }

    console.log('[depth] 📥 Reading response buffer...');
    const arrayBuffer = await hfRes.arrayBuffer();
    console.log(`[depth] ✅ Got ${arrayBuffer.byteLength} bytes from HF`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');

    const elapsed = Date.now() - startTime;
    console.log(`[depth] 🎉 Success! Total time: ${elapsed}ms`);
    console.log('═'.repeat(60));
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[depth] 💥 Error after ${elapsed}ms:`);
    console.error(`[depth]    Name: ${err.name}`);
    console.error(`[depth]    Message: ${err.message}`);
    console.error(`[depth]    Stack: ${err.stack}`);
    const message = err.name === 'AbortError' ? 'Request timed out' : err.message;
    return res.status(500).json({ error: message });
  }
};
