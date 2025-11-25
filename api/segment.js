const HF_ROUTER_BASE = 'https://router.huggingface.co/pipeline';
const SEGMENTATION_TASK = 'image-segmentation';
const SEGMENTATION_MODEL = 'briaai/RMBG-2.0';
const MAX_ROUTER_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function callRouter(task, model, body, token, attempt = 0) {
  const response = await fetch(`${HF_ROUTER_BASE}/${task}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body,
  });

  if ((response.status === 202 || response.status === 503) && attempt < MAX_ROUTER_RETRIES) {
    let waitMs = 1500;
    try {
      const payload = await response.json();
      if (typeof payload?.estimated_time === 'number') {
        waitMs = Math.max(payload.estimated_time * 1000, 1000);
      }
    } catch (err) {
      console.warn(`[segment] Warmup payload parse failed: ${err.message}`);
    }
    console.log(`[segment] Model warming up (${attempt + 1}/${MAX_ROUTER_RETRIES}). Retrying in ${waitMs}ms`);
    await sleep(waitMs);
    return callRouter(task, model, body, token, attempt + 1);
  }

  return response;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return res.status(500).json({ error: 'Missing HUGGINGFACE_TOKEN' });

    const body = await readRaw(req);
    const hfRes = await callRouter(SEGMENTATION_TASK, SEGMENTATION_MODEL, body, HF_TOKEN);

    if (!hfRes.ok) {
      const text = await hfRes.text();
      console.error(`[segment] HF error ${hfRes.status}: ${text}`);
      return res.status(hfRes.status).send(text);
    }

    const arrayBuffer = await hfRes.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('segment error', err);
    res.status(500).json({ error: err.message });
  }
};
