const {
  readRaw,
  callRouter,
  setCorsHeaders,
  handlePreflight,
} = require('./_lib/hf');

const SEGMENTATION_TASK = 'image-segmentation';
const SEGMENTATION_MODEL = 'briaai/RMBG-2.0';

/**
 * Vercel Serverless Function – Background Removal via RMBG-2.0
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log('[segment] 📸 Incoming request');
  console.log(`[segment]    Method: ${req.method}`);
  console.log(`[segment]    URL: ${req.url}`);
  console.log(`[segment]    Headers: ${JSON.stringify(req.headers['content-type'] || 'none')}`);

  setCorsHeaders(res);

  if (handlePreflight(req, res)) {
    console.log('[segment] ↩️ Preflight handled');
    return;
  }

  if (req.method !== 'POST') {
    console.warn(`[segment] ⚠️ Invalid method: ${req.method}`);
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
  console.log(`[segment] 🔑 HUGGINGFACE_TOKEN: ${HF_TOKEN ? 'present' : 'MISSING'}`);
  if (!HF_TOKEN) {
    console.error('[segment] ❌ Missing HUGGINGFACE_TOKEN env var');
    return res.status(500).json({ error: 'Server misconfigured: missing HUGGINGFACE_TOKEN' });
  }

  try {
    const body = await readRaw(req, 'segment');
    if (!body.length) {
      console.warn('[segment] ⚠️ Empty request body');
      return res.status(400).json({ error: 'Empty request body' });
    }
    console.log(`[segment] 📦 Payload ready: ${body.length} bytes`);

    console.log(`[segment] 🚀 Calling RMBG-2.0 model...`);
    const hfRes = await callRouter(SEGMENTATION_TASK, SEGMENTATION_MODEL, body, HF_TOKEN, 'segment');

    if (!hfRes.ok) {
      const text = await hfRes.text();
      console.error(`[segment] ❌ HF error ${hfRes.status}: ${text}`);
      return res.status(hfRes.status).json({ error: text || 'Hugging Face request failed' });
    }

    console.log('[segment] 📥 Reading response buffer...');
    const arrayBuffer = await hfRes.arrayBuffer();
    console.log(`[segment] ✅ Got ${arrayBuffer.byteLength} bytes from HF`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');

    const elapsed = Date.now() - startTime;
    console.log(`[segment] 🎉 Success! Total time: ${elapsed}ms`);
    console.log('═'.repeat(60));
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[segment] 💥 Error after ${elapsed}ms:`);
    console.error(`[segment]    Name: ${err.name}`);
    console.error(`[segment]    Message: ${err.message}`);
    console.error(`[segment]    Stack: ${err.stack}`);
    const message = err.name === 'AbortError' ? 'Request timed out' : err.message;
    return res.status(500).json({ error: message });
  }
};
