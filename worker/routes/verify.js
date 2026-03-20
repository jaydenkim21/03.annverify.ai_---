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
  let detectedLang = null;
  if (urlPattern.test(claim.trim())) {
    const articleText = await fetchArticleText(claim.trim());
    if (articleText) {
      // 기사 본문에서 언어 자동 감지 (한국어 문자 포함 여부)
      if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(articleText)) detectedLang = 'ko';
      claim = `[Article URL: ${claim.trim()}]\n\n${articleText}`;
    }
  }

  const { gateMode, gateNote } = evaluateGate(claim);
  const today = new Date().toISOString().slice(0, 10);

  // 응답 언어: 클라이언트 지정 → 서버 자동 감지 순으로 적용
  const LANG_NAMES = { ko: 'Korean (한국어)', ja: 'Japanese (日本語)', zh: 'Chinese (中文)', de: 'German', fr: 'French', es: 'Spanish', ar: 'Arabic' };
  const effectiveLang = (body.response_lang && body.response_lang !== 'en') ? body.response_lang : (detectedLang || null);
  const langName = (effectiveLang && LANG_NAMES[effectiveLang]) || null;

  // 언어 지시문 — 시스템 프롬프트 앞에 배치해 영문 컨텍스트에 묻히지 않도록
  const langPrefix = langName
    ? `LANGUAGE RULE (HIGHEST PRIORITY): You MUST write every descriptive text value in ${langName}. This applies to ALL string fields: executive_summary, overall_verdict, claims[].sentence, claims[].verdict, claims[].evidence_link, key_evidence items, layer_analysis[].name/summary/detail, and all other text. Only JSON keys remain in English.\n\n`
    : '';

  // 시스템 프롬프트 — 언어 지시문을 맨 앞에 배치
  const buildSystem = () =>
    `${langPrefix}You are a fact-checking assistant. Today: ${today}. CRITICAL: You MUST respond with ONLY a raw JSON object. No explanations, no markdown, no text before or after the JSON. Output ONLY the JSON object starting with { and ending with }.

Required JSON fields: verified_status, overall_verdict, overall_score (0-100), overall_grade, verdict_class (one of: VERIFIED LIKELY_TRUE PARTIALLY_TRUE UNVERIFIED CONTEXT_MISSING MISLEADING OUTDATED FALSE OPINION), confidence (0-1), metrics (object: factual logic source_quality cross_validation recency each 0-100), executive_summary (string), layer_analysis (array of 7 objects L1-L7 each with: layer name score summary detail), claims (array of objects with: sentence status verdict evidence_link), key_evidence (object with: supporting contradicting neutral arrays of strings), web_citations (array of strings), temporal (object with: timeframe freshness expiry_risk recheck_recommended), bisl_hash (string), gate_mode (string).`;

  // 유저 메시지 — 비영어 기사는 메시지 앞에도 언어 지시문 추가
  const buildUserMsg = (tavilyCtx = "") =>
    `${langName ? `[RESPOND IN ${langName.toUpperCase()} - ALL descriptive text values must be in ${langName}]\n` : ''}OUTPUT FORMAT: JSON object ONLY. No other text allowed.

CLAIM: "${claim || "(see image)"}"
Genre: ${body.genre || "general"} | Depth: ${body.depth || "standard"}
Guide: ${GENRE_GUIDE[body.genre] || GENRE_GUIDE.general}${gateNote}${tavilyCtx}`;

  // 어시스턴트 프리필 "{" → Claude가 반드시 JSON으로 시작하도록 강제
  const buildMessages = (userMsg) => {
    const userTurn = body.image_b64
      ? { role: "user", content: [
          { type: "image", source: { type: "base64", media_type: body.image_mime || "image/jpeg", data: body.image_b64 } },
          { type: "text", text: userMsg },
        ]}
      : { role: "user", content: userMsg };
    return [userTurn, { role: "assistant", content: "{" }];
  };

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

  // JSON 파싱 헬퍼 — 프리필 "{" 보상 + 텍스트 내 JSON 추출 시도
  function tryParseJson(text) {
    const cleaned = text.replace(/```json|```/g, "").trim();
    // 1차: 프리필 "{" 보상
    const s1 = cleaned.startsWith("{") ? cleaned : "{" + cleaned;
    try { return JSON.parse(s1); } catch (_) {}
    // 2차: 텍스트 안에서 {…} 블록 추출
    const m = /\{[\s\S]*\}/.exec(cleaned);
    if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
    return null;
  }

  // gate_mode 주입 — 파싱 실패 시 1회 자동 재시도
  function injectGateMode(responseData) {
    const tb = Array.isArray(responseData.content) && responseData.content.find(b => b.type === "text");
    if (!tb || !tb.text) return false;
    const parsed = tryParseJson(tb.text);
    if (!parsed) return false;
    parsed.gate_mode = gateMode;
    tb.text = JSON.stringify(parsed);
    return true;
  }

  if (!injectGateMode(data)) {
    // 1차 파싱 실패 → 1회 재시도
    try {
      const retryRes  = await callAnthropic({
        model:      "claude-sonnet-4-6",
        max_tokens: 6000,
        system:     buildSystem(),
        messages:   buildMessages(buildUserMsg(tavilyCtx)),
      }, env.ANTHROPIC_API_KEY);
      const retryData = await retryRes.json();
      if (injectGateMode(retryData)) data = retryData;
    } catch (_) {}
  }

  return json(data, res.status, cors);
}
