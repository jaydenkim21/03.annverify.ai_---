// ③ ML Core Layer — v4 Claude Route
// POST /api/v4/claude — L1(Claim Parse) · L2(Source Strategy) · L6(Verdict) · L7(BISL)
// web_search 지원, 멀티모델 화이트리스트 적용

import { json }           from '../../utils/cors.js';
import { callAnthropic } from '../../utils/anthropic.js';

const ALLOWED_CLAUDE = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
];

export async function handleV4Claude(request, env, cors) {
  const body = await request.json();
  if (!body.messages || !Array.isArray(body.messages))
    return json({ error: "messages array required" }, 400, cors);

  const model = ALLOWED_CLAUDE.includes(body.model)
    ? body.model
    : "claude-sonnet-4-6";

  const anthropicBody = {
    model,
    max_tokens: Math.min(body.max_tokens || 2500, 6000),
    messages:   body.messages,
  };
  if (body.system) anthropicBody.system = body.system;
  if (body.tools)  anthropicBody.tools  = body.tools;

  const hasWebSearch = Array.isArray(anthropicBody.tools) &&
    anthropicBody.tools.some(t => t.type && t.type.startsWith('web_search'));
  const extraHeaders = hasWebSearch
    ? { "anthropic-beta": "web-search-2025-03-05" }
    : {};

  const res  = await callAnthropic(anthropicBody, env.ANTHROPIC_API_KEY, extraHeaders);
  const data = await res.json();
  return json(data, res.status, cors);
}
