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


// Tavily 웹 검색 (5초 타임아웃)
async function fetchTavilyResults(query, apiKey) {
  if (!apiKey) return null;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
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
      signal: ctrl.signal,
    });
    clearTimeout(timer);
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
    clearTimeout(timer);
    return null;
  }
}

// URL에서 기사 텍스트 추출 (6초 타임아웃)
async function fetchArticleText(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ANNVerify/1.0)" },
      cf: { timeout: 6000 },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
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
    clearTimeout(timer);
    return null;
  }
}

export async function handleVerify(request, env, cors) {
  const body = await request.json();
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

  // 응답 언어 지시문
  const LANG_NAMES = { ko: 'Korean (한국어)', ja: 'Japanese (日本語)', zh: 'Chinese (中文)', de: 'German', fr: 'French', es: 'Spanish', ar: 'Arabic' };
  const langNote = (body.response_lang && body.response_lang !== 'en' && LANG_NAMES[body.response_lang])
    ? ` CRITICAL LANGUAGE RULE: Every single descriptive string value in the JSON response MUST be written in ${LANG_NAMES[body.response_lang]}. This includes: executive_summary, overall_verdict, claims[].sentence, claims[].verdict, claims[].evidence_link, key_evidence.supporting[] items, key_evidence.contradicting[] items, key_evidence.neutral[] items, layer_analysis[].name, layer_analysis[].summary, layer_analysis[].detail, and any other text string. Only JSON field names (keys) must remain in English.`
    : '';

  // 시스템 프롬프트 — RESPONSE_SCHEMA 제거 (cloud IP 403 방지), 어시스턴트 프리필로 JSON 강제
  const buildSystem = () =>
    `Fact-checking assistant. Today: ${today}. Analyze the claim and output a JSON object with these fields: verified_status, overall_verdict, overall_score (0-100), overall_grade, verdict_class (one of: VERIFIED LIKELY_TRUE PARTIALLY_TRUE UNVERIFIED CONTEXT_MISSING MISLEADING OUTDATED FALSE OPINION), confidence (0-1), metrics (factual logic source_quality cross_validation recency each 0-100), executive_summary, layer_analysis (7 objects L1-L7 with layer name score summary detail), claims (array with sentence status verdict evidence_link), key_evidence (supporting contradicting neutral arrays), web_citations (array), temporal (timeframe freshness expiry_risk recheck_recommended), bisl_hash, gate_mode.${langNote}`;

  // 유저 메시지 — 클레임 + 컨텍스트만 포함
  const buildUserMsg = (tavilyCtx = "") =>
    `CLAIM: "${claim || "(see image)"}"
Genre: ${body.genre || "general"} | Depth: ${body.depth || "standard"}
Guide: ${GENRE_GUIDE[body.genre] || GENRE_GUIDE.general}${gateNote}${tavilyCtx}`;

  const buildMessages = (userMsg) => body.image_b64
    ? [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: body.image_mime || "image/jpeg", data: body.image_b64 } },
        { type: "text", text: userMsg },
      ]}]
    : [{ role: "user", content: userMsg }];

  // ── Tavily 웹 검색으로 최신 컨텍스트 보강 ─────────────────────────
  const tavilyResult = await fetchTavilyResults(
    (body.claim || claim).slice(0, 400), env.TAVILY_API_KEY
  );
  const tavilyCtx = tavilyResult
    ? `\n\nWEB SEARCH RESULTS:\n${tavilyResult}` : "";

  let res, data;
  try {
    res  = await callAnthropic({
      model:      "claude-sonnet-4-6",
      max_tokens: 6000,
      system:     buildSystem(),
      messages:   buildMessages(buildUserMsg(tavilyCtx)),
    }, env.ANTHROPIC_API_KEY);
    data = await res.json();
  } catch (fetchErr) {
    return json({ error: "Anthropic fetch failed", detail: fetchErr.message, model: "claude-sonnet-4-6" }, 502, cors);
  }

  // Anthropic API 에러 시 상세 메시지 반환
  if (!res.ok) {
    const errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data);
    return json({ error: errMsg, status: res.status, raw: data, model: "claude-sonnet-4-6" }, res.status, cors);
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
