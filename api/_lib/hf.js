/**
 * Shared Hugging Face Router utilities for Vercel serverless functions.
 */

const HF_ROUTER_BASE = 'https://router.huggingface.co/pipeline';
const MAX_RETRIES = 5;
const MIN_WAIT_MS = 1000;
const DEFAULT_WAIT_MS = 1500;
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Sleep helper.
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read raw body from Vercel/Node request stream.
 * @param {import('http').IncomingMessage} req
 * @param {string} [logPrefix='hf'] - Prefix for console logs
 * @returns {Promise<Buffer>}
 */
async function readRaw(req, logPrefix = 'hf') {
  console.log(`[${logPrefix}] Reading request body...`);
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > MAX_PAYLOAD_BYTES) {
      console.error(`[${logPrefix}] ❌ Payload too large: ${totalLength} bytes (max ${MAX_PAYLOAD_BYTES})`);
      throw new Error(`Payload exceeds ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB limit`);
    }
    chunks.push(chunk);
  }
  console.log(`[${logPrefix}] ✓ Read ${totalLength} bytes`);
  return Buffer.concat(chunks);
}

/**
 * Call Hugging Face Inference Router with automatic retry on model warm-up.
 * @param {string} task - HF pipeline task (e.g. 'image-segmentation')
 * @param {string} model - Model ID (e.g. 'briaai/RMBG-2.0')
 * @param {Buffer} body - Raw image bytes
 * @param {string} token - HF Bearer token
 * @param {string} [logPrefix='hf'] - Prefix for console logs
 * @param {number} [attempt=0] - Current retry attempt
 * @returns {Promise<Response>}
 */
async function callRouter(task, model, body, token, logPrefix = 'hf', attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
  const url = `${HF_ROUTER_BASE}/${task}/${model}`;

  console.log(`[${logPrefix}] 🌐 Calling HF Router (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
  console.log(`[${logPrefix}]    URL: ${url}`);
  console.log(`[${logPrefix}]    Body size: ${body.length} bytes`);
  console.log(`[${logPrefix}]    Token: ${token ? `${token.slice(0, 8)}...` : 'MISSING'}`);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
      signal: controller.signal,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[${logPrefix}] 📥 HF Response: ${response.status} ${response.statusText} (${elapsed}ms)`);
    console.log(`[${logPrefix}]    Content-Type: ${response.headers.get('content-type') || 'unknown'}`);
    console.log(`[${logPrefix}]    Content-Length: ${response.headers.get('content-length') || 'unknown'}`);

    // Model warming up – retry with exponential back-off
    if ((response.status === 202 || response.status === 503) && attempt < MAX_RETRIES) {
      let waitMs = DEFAULT_WAIT_MS;
      let retryReason = 'model loading';
      try {
        const payload = await response.json();
        console.log(`[${logPrefix}] 🔄 Warmup response:`, JSON.stringify(payload));
        if (typeof payload?.estimated_time === 'number') {
          waitMs = Math.max(payload.estimated_time * 1000, MIN_WAIT_MS);
        }
        if (payload?.error) {
          retryReason = payload.error;
        }
      } catch (parseErr) {
        console.warn(`[${logPrefix}] ⚠️ Could not parse warmup JSON: ${parseErr.message}`);
      }
      console.log(`[${logPrefix}] ⏳ ${retryReason} – retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(waitMs);
      return callRouter(task, model, body, token, logPrefix, attempt + 1);
    }

    if (!response.ok) {
      console.error(`[${logPrefix}] ❌ HF request failed with status ${response.status}`);
    } else {
      console.log(`[${logPrefix}] ✅ HF request succeeded`);
    }

    return response;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err.name === 'AbortError') {
      console.error(`[${logPrefix}] ⏱️ Request timed out after ${elapsed}ms`);
    } else {
      console.error(`[${logPrefix}] 💥 Fetch error after ${elapsed}ms:`, err.message);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Standard CORS headers for Vercel functions.
 * @param {import('http').ServerResponse} res
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Handle preflight OPTIONS request.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if handled
 */
function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = {
  HF_ROUTER_BASE,
  MAX_RETRIES,
  MAX_PAYLOAD_BYTES,
  sleep,
  readRaw,
  callRouter,
  setCorsHeaders,
  handlePreflight,
};
