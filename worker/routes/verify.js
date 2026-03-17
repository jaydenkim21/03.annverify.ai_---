// ② API Gateway Layer — ANN Verify Route
// POST /api/verify — v1 Dual-Gate 팩트체크 (기존 HTML 완전 호환)

import { json }           from '../utils/cors.js';
import { callAnthropic } from '../utils/anthropic.js';

// ③ ML Core Layer 연동 — 장르별 검증 가이드 (L1 Claim Parse 참고)
const GENRE_GUIDE = {
  general:   "Comprehensive verification with authoritative sources.",
  politics:  "Check voting records, official statements vs summaries, media bias.",
  economy:   "Verify BLS/IMF/World Bank data, base year, seasonal adjustments.",
  health:    "Clinical trial phase, sample size, peer review status, FDA/WHO stance.",
  science:   "Peer review status, replication, p-value, confidence intervals.",
  law:       "Case law, statute text, jurisdiction specifics.",
  corporate: "SEC/DART filings, earnings reports, official disclosures.",
  social:    "Trace claim origin, map viral spread, check Snopes/PolitiFact.",
};

// Dual-Gate 로직 — FALSE_GUARD / PARTIAL_AWARE / STANDARD
function evaluateGate(claim) {
  const t  = (claim || "").toLowerCase();
  const g2 = /microchip|chemtrail|mind.?control|faked moon|hoax|bleach cure|flat earth|autism.{0,10}vaccine|vaccine.{0,10}autism|5g cause|moon.{0,5}fake|crisis actor|deep state|plandemic/.test(t);

  let g1s = 0;
  if (/\b(as of|currently|in \d{4}|today|recent|latest|still|now)\b/.test(t))               g1s += 35;
  if (/\b(always|never|all|every|entirely|completely|only|solely|100%)\b/.test(t))            g1s += 30;
  if (/\b(causes?|leads? to|results? in|increases?|decreases?|linked to)\b/.test(t))         g1s += 20;
  if (/\b(health|diet|nutrition|mental health|social media|climate|economy|ai|job)\b/.test(t)) g1s += 15;

  const gateMode = g2 ? "FALSE_GUARD" : g1s >= 35 ? "PARTIAL_AWARE" : "STANDARD";
  const gateNote = g2
    ? "\n⚠️ FALSE GUARD ACTIVE: Do NOT classify as PARTIALLY_TRUE without overwhelming mixed evidence. Default to FALSE or MISLEADING."
    : g1s >= 35
    ? "\n⚡ PARTIAL SIGNAL ACTIVE: Temporal/absolute language detected. Carefully evaluate PARTIALLY_TRUE."
    : "";

  return { gateMode, gateNote };
}

const RESPONSE_SCHEMA = '{"verified_status":"VERIFIED HIGH ACCURACY","overall_verdict":"string","overall_score":85,"overall_grade":"A+","verdict_class":"VERIFIED","confidence":0.92,"metrics":{"factual":88,"logic":85,"source_quality":90,"cross_validation":82,"recency":87},"executive_summary":"2-3 sentence summary","layer_analysis":[{"layer":"L1","name":"Origin Tracking","score":88,"summary":"brief","detail":"explanation"},{"layer":"L2","name":"Semantic Context","score":85,"summary":"brief","detail":"explanation"},{"layer":"L3","name":"Cross-Reference","score":90,"summary":"brief","detail":"explanation"},{"layer":"L4","name":"Statistical Analysis","score":82,"summary":"brief","detail":"explanation"},{"layer":"L5","name":"Neural Synthesis","score":87,"summary":"brief","detail":"explanation"},{"layer":"L6","name":"Human Consensus","score":84,"summary":"brief","detail":"explanation"},{"layer":"L7","name":"Final Verdict & Hash","score":89,"summary":"brief","detail":"explanation"}],"claims":[{"sentence":"exact quoted claim","status":"CONFIRMED","verdict":"explanation","evidence_link":""}],"key_evidence":{"supporting":["fact 1","fact 2"],"contradicting":[],"neutral":["context"]},"web_citations":["source 1"],"temporal":{"timeframe":"when","freshness":"current/outdated","expiry_risk":"LOW","recheck_recommended":false},"bisl_hash":"sha256-placeholder","gate_mode":"STANDARD"}';

// Tavily 웹 검색
async function fetchTavilyResults(query, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;
    let text = "";
    if (data.answer) text += `Summary: ${data.answer}\n\n`;
    text += data.results.map((r, i) =>
      `[${i+1}] ${r.title}\nURL: ${r.url}\n${(r.content || "").slice(0, 500)}`
    ).join("\n\n");
    return text;
  } catch (_) {
    return null;
  }
}

// URL에서 기사 텍스트 추출
async function fetchArticleText(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ANNVerify/1.0)" },
      cf: { timeout: 8000 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // HTML 태그 제거 후 공백 정리
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 4000);
  } catch (_) {
    return null;
  }
}

export async function handleVerify(request, env, cors) {
  const body = await request.json();
  const k = env.ANTHROPIC_API_KEY || "";
  console.log(`[KEY] len=${k.length} prefix=${k.slice(0,10)} last4=${k.slice(-4)}`);

  if (!body.claim && !body.image_b64)
    return json({ error: "claim or image_b64 required" }, 400, cors);

  // URL 입력 시 기사 내용 자동 추출
  const urlPattern = /^https?:\/\/[^\s]+$/i;
  let claim = body.claim || "";
  if (urlPattern.test(claim.trim())) {
    const articleText = await fetchArticleText(claim.trim());
    if (articleText) {
      claim = `[Article URL: ${claim.trim()}]\n\n${articleText}`;
    }
  }

  const { gateMode, gateNote } = evaluateGate(claim);
  const today = new Date().toISOString().slice(0, 10);

  // 프롬프트 빌더 (tavilyContext 주입 가능)
  const buildPrompt = (tavilyCtx = "") =>
    `You are ANN Verify — a research-grade 7-layer AI fact-checking engine.
TODAY'S DATE: ${today}. This is the real current date. Do NOT treat ${today} or any prior date as a future date or classify content with this date as invalid.

CLAIM: "${claim || "(see image)"}"
Genre: ${body.genre || "general"} | Depth: ${body.depth || "standard"}
Guide: ${GENRE_GUIDE[body.genre] || GENRE_GUIDE.general}${gateNote}${tavilyCtx}

VERDICT CLASSES: VERIFIED | LIKELY_TRUE | PARTIALLY_TRUE | UNVERIFIED | CONTEXT_MISSING | MISLEADING | OUTDATED | FALSE | OPINION
SCORING: A+(93-100) A(82-92) B+(74-81) B(64-73) C(48-63) D(30-47) F(0-29)

Respond ONLY with valid JSON:
${RESPONSE_SCHEMA}`;

  const buildMessages = (prompt) => body.image_b64
    ? [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: body.image_mime || "image/jpeg", data: body.image_b64 } },
        { type: "text", text: prompt },
      ]}]
    : [{ role: "user", content: prompt }];

  // ── Tavily 웹 검색으로 최신 컨텍스트 보강 ─────────────────────────
  const tavilyResult = await fetchTavilyResults(
    (body.claim || claim).slice(0, 400), env.TAVILY_API_KEY
  );
  const tavilyCtx = tavilyResult
    ? `\n\nWEB SEARCH RESULTS:\n${tavilyResult}` : "";

  let res, data;
  try {
    res  = await callAnthropic({
      model:      "claude-sonnet-4-5",
      max_tokens: 12000,
      temperature: 0,
      messages:   buildMessages(buildPrompt(tavilyCtx)),
    }, env.ANTHROPIC_API_KEY);
    data = await res.json();
  } catch (fetchErr) {
    return json({ error: "Anthropic fetch failed", detail: fetchErr.message, model: "claude-sonnet-4-5" }, 502, cors);
  }

  // Anthropic API 에러 시 상세 메시지 반환
  if (!res.ok) {
    const errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data);
    return json({ error: errMsg, status: res.status, raw: data, model: "claude-sonnet-4-5" }, res.status, cors);
  }

  // gate_mode 주입 — web_search 시 tool_use 블록이 먼저 올 수 있으므로 text 블록을 명시적으로 찾음
  const textBlock = Array.isArray(data.content) && data.content.find(b => b.type === "text");
  if (textBlock && textBlock.text) {
    try {
      const parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
      parsed.gate_mode = gateMode;
      textBlock.text = JSON.stringify(parsed);
    } catch (_) {}
  }

  return json(data, res.status, cors);
}
