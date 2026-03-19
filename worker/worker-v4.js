// ═══════════════════════════════════════════════════════════════════════
// ② API Gateway Layer — ANN Proxy Worker v4.2
//    Cloudflare Worker 멀티모델 팩트체크 라우터
//
// HTTP 라우트:
//   GET  /api/health           → 헬스체크
//   GET  /api/v4/health        → v4 헬스체크
//   GET  /api/cmc              → CoinMarketCap 시세 프록시
//   GET  /api/v4/news/feed     → AI News 조회 (Firebase)
//   POST /api/verify           → ANN Verify 팩트체크 v1
//   POST /api/claude           → Anthropic 직접 프록시
//   POST /api/analyze          → ONPROOF Listing 분석
//   POST /api/v4/claude        → v4 Claude
//   POST /api/v4/openai        → v4 GPT-4o
//   POST /api/v4/grok          → v4 Grok
//   POST /api/v4/deberta       → v4 DeBERTa NLI
//   POST /api/v4/news/generate → AI News 수동 생성/배포 (관리자)
//
// Cron 스케줄:
//   0 0  * * * → KR 09:00 KST 생성
//   0 1  * * * → KR 10:00 KST 배포
//   0 14 * * * → US 09:00 EST 생성
//   0 15 * * * → US 10:00 EST 배포
//
// Secrets: ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, HF_API_KEY,
//          CMC_API_KEY, FIREBASE_SA_JSON
// ═══════════════════════════════════════════════════════════════════════

import { corsHeaders, isOriginAllowed, json } from './utils/cors.js';
import { checkRateLimit }                      from './utils/rateLimit.js';
import { handleHealth, handleV4Health, handleV4Diagnose } from './routes/health.js';
import { handleCMC }                           from './routes/cmc.js';
import { handleVerify }                        from './routes/verify.js';
import { handleClaude, handleAnalyze }         from './routes/claude.js';
import { handleV4Claude }                      from './routes/v4/claude.js';
import { handleV4OpenAI }                      from './routes/v4/openai.js';
import { handleV4Grok }                        from './routes/v4/grok.js';
import { handleV4DeBERTa }                     from './routes/v4/deberta.js';
import { handleV4NewsFeed, handleV4NewsGenerate, handleV4NewsCleanup, runNewsPipeline } from './routes/v4/news.js';
import { handleV4PartnerFeed, handleV4PartnerRefresh, runPartnerPipeline } from './routes/v4/partner.js';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors   = corsHeaders(origin);

    // OPTIONS preflight
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });

    // Rate limit
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(clientIP))
      return json({ error: "Rate limit exceeded. Max 30 requests/minute." }, 429, cors);

    // Origin check
    if (!isOriginAllowed(origin))
      return json({ error: "Origin not allowed" }, 403, cors);

    const url = new URL(request.url);

    try {
      // ── GET 라우트 ────────────────────────────────────────────────
      if (url.pathname === "/api/health")        return handleHealth(cors);
      if (url.pathname === "/api/v4/health")     return handleV4Health(env, cors);
      if (url.pathname === "/api/v4/diagnose")   return await handleV4Diagnose(env, cors);
      if (url.pathname === "/api/cmc")           return handleCMC(url, env, cors);
      if (url.pathname === "/api/v4/news/feed")     return await handleV4NewsFeed(request, env, cors);
      if (url.pathname === "/api/v4/partner/feed") return await handleV4PartnerFeed(request, env, cors);

      // ── POST 전용 이하 ────────────────────────────────────────────
      if (request.method !== "POST")
        return json({ error: "Method not allowed" }, 405, cors);

      if (url.pathname === "/api/verify")      return await handleVerify(request, env, cors);
      if (url.pathname === "/api/claude")      return await handleClaude(request, env, cors);
      if (url.pathname === "/api/analyze")     return await handleAnalyze(request, env, cors);
      if (url.pathname === "/api/v4/claude")   return await handleV4Claude(request, env, cors);
      if (url.pathname === "/api/v4/openai")   return await handleV4OpenAI(request, env, cors);
      if (url.pathname === "/api/v4/grok")     return await handleV4Grok(request, env, cors);
      if (url.pathname === "/api/v4/deberta")       return await handleV4DeBERTa(request, env, cors);
      if (url.pathname === "/api/v4/news/generate")    return await handleV4NewsGenerate(request, env, cors, ctx);
      if (url.pathname === "/api/v4/news/cleanup")     return await handleV4NewsCleanup(request, env, cors);
      if (url.pathname === "/api/v4/partner/refresh") return await handleV4PartnerRefresh(request, env, cors);

      return json({ error: "Not found" }, 404, cors);

    } catch (err) {
      return json({ error: "Internal error", detail: err.message }, 500, cors);
    }
  },

  // ── Cron Scheduled Handler ───────────────────────────────────────
  // AI News: 매시간 1건 합성 파이프라인
  // Partner News: UTC 00:00 / 13:00 2회 RSS 갱신
  async scheduled(_event, env) {
    const hour = new Date().getUTCHours();
    const tasks = [runNewsPipeline(env)];
    if (hour === 0 || hour === 13) tasks.push(runPartnerPipeline(env));
    await Promise.allSettled(tasks);
  },
};
