/**
 * Health check endpoint for debugging deployment issues.
 * Returns environment status without exposing secrets.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const NODE_ENV = process.env.NODE_ENV;
  const VERCEL_ENV = process.env.VERCEL_ENV;
  const VERCEL_REGION = process.env.VERCEL_REGION;

  const status = {
    ok: Boolean(HF_TOKEN),
    timestamp: new Date().toISOString(),
    environment: {
      node: NODE_ENV || 'unknown',
      vercel: VERCEL_ENV || 'unknown',
      region: VERCEL_REGION || 'unknown',
    },
    secrets: {
      HUGGINGFACE_TOKEN: HF_TOKEN ? `${HF_TOKEN.slice(0, 8)}...` : 'MISSING ❌',
      GEMINI_API_KEY: GEMINI_KEY ? `${GEMINI_KEY.slice(0, 8)}...` : 'MISSING (optional)',
    },
    nodeVersion: process.version,
  };

  console.log('[health] Status check:', JSON.stringify(status, null, 2));

  res.status(status.ok ? 200 : 503).json(status);
};
