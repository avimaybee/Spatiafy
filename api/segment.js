import fetch from 'node-fetch';

const HF_ROUTER_BASE = 'https://router.huggingface.co/pipeline';
const SEGMENTATION_TASK = 'image-segmentation';
const SEGMENTATION_MODEL = 'briaai/RMBG-2.0';

const readRaw = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

export default async function handler(req, res) {
  try {
    const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return res.status(500).json({ error: 'Missing HUGGINGFACE_TOKEN' });

    const body = await readRaw(req);

    const hfRes = await fetch(`${HF_ROUTER_BASE}/${SEGMENTATION_TASK}/${SEGMENTATION_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
    });

    if (!hfRes.ok) {
      const text = await hfRes.text();
      return res.status(hfRes.status).send(text);
    }

    const arrayBuffer = await hfRes.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('segment error', err);
    res.status(500).json({ error: err.message });
  }
}
