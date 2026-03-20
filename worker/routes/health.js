// ② API Gateway Layer — Health Check Routes
// GET /api/health, GET /api/v4/health

import { json } from '../utils/cors.js';

export function handleHealth(cors) {
  return json({
    status:    "operational",
    engine:    "v4.1",
    routes:    ["/api/verify", "/api/claude", "/api/analyze", "/api/cmc", "/api/v4/*"],
    timestamp: new Date().toISOString(),
  }, 200, cors);
}

export function handleV4Health(env, cors) {
  return json({
    status:  "operational",
    engine:  "v4.1",
    routes: {
      claude:  !!env.ANTHROPIC_API_KEY,
      openai:  !!env.OPENAI_API_KEY,
      grok:    !!env.XAI_API_KEY,
      deberta: !!env.HF_API_KEY,
    },
    timestamp: new Date().toISOString(),
  }, 200, cors);
}

export async function handleV4Diagnose(env, cors) {
  const key = env.ANTHROPIC_API_KEY || '';
  const res = await fetch('https://gateway.ai.cloudflare.com/v1/2b10ac43a3fe8ddb0d93bd28f06338b2/ann-verify/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  const body = await res.json();
  const respHeaders = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });
  return json({
    status:       res.status,
    key_prefix:   key.slice(0, 14),
    key_len:      key.length,
    body,
    resp_headers: respHeaders,
  }, 200, cors);
}
