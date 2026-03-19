// ③ ML Core Layer — v4 AI News Route (Beta v1.0)
// Pipeline: Topic Selection → Claude Synthesis → Quality Gate → Dedup → Firestore
//
// Beta (~2026-04-14): 12 fixed CRAWL_TOPICS, Claude training-data synthesis
// v2.0 (2026-04-15+): Tavily real-time trends + live article crawl
//
// Endpoints:
//   GET  /api/v4/news/feed     — Firestore aiNews 조회 (프론트엔드 서빙)
//   POST /api/v4/news/generate — 관리자 수동 파이프라인 트리거
// Cron: 0 * * * * (매시간, 1건/사이클)

import { json }          from '../../utils/cors.js';
import { callAnthropic } from '../../utils/anthropic.js';
import { getAccessToken, FirestoreClient, fsFilter } from '../../utils/firestore.js';

const PROJECT_ID = 'annverify-8d680';

// ── 12 고정 토픽 (베타 ~ 2026-04-14) ─────────────────────────────────
const CRAWL_TOPICS = [
  { id:  0, name: 'Artificial Intelligence & Technology',  cat: 'Tech'     },
  { id:  1, name: 'Geopolitics & International Relations', cat: 'World'    },
  { id:  2, name: 'Climate Change & Environment',          cat: 'Science'  },
  { id:  3, name: 'Healthcare & Medical Research',         cat: 'Health'   },
  { id:  4, name: 'Global Economy & Markets',              cat: 'Finance'  },
  { id:  5, name: 'Semiconductors & Chip Industry',        cat: 'Tech'     },
  { id:  6, name: 'Space Exploration & Astronomy',         cat: 'Science'  },
  { id:  7, name: 'Cybersecurity & Digital Threats',       cat: 'Security' },
  { id:  8, name: 'Energy Transition & Resources',         cat: 'Energy'   },
  { id:  9, name: 'Korean Peninsula & East Asia',          cat: 'World'    },
  { id: 10, name: 'Biotechnology & Life Sciences',         cat: 'Health'   },
  { id: 11, name: 'Food Security & Agriculture',           cat: 'Science'  },
];

// ── 18 참조 출처 (Claude 합성 시 참조) ───────────────────────────────
const CRAWL_SOURCES = [
  'Reuters', 'AP News', 'BBC News', 'The Guardian', 'Al Jazeera',
  'CNN', 'The New York Times', 'Washington Post', 'Financial Times',
  'Bloomberg', 'TechCrunch', 'Wired', 'MIT Technology Review',
  'Science Daily', 'Nature', 'Yonhap News Agency', 'Korea JoongAng Daily',
  'NPR News',
];

// ── 유틸 ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 시간 단위 인덱스로 12개 토픽 순환 (날짜 경계 무관하게 연속 순환)
function selectTopic() {
  const idx = Math.floor(Date.now() / 3600000) % CRAWL_TOPICS.length;
  return CRAWL_TOPICS[idx];
}

// 제목 중복 감지용 단순 해시
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

async function getDb(env) {
  const saJson = env.FIREBASE_SA_JSON;
  if (!saJson) { console.warn('[News] FIREBASE_SA_JSON not set'); return null; }
  const token = await getAccessToken(saJson);
  if (!token) { console.warn('[News] Token failed'); return null; }
  return new FirestoreClient(PROJECT_ID, token);
}

async function logEvent(db, date, type, data) {
  if (!db) return;
  try {
    await db.set('newsLogs', `${type}_${date}_${Date.now()}`, {
      type, date, ...data, loggedAt: new Date().toISOString(),
    });
  } catch (_) {}
}

const STORAGE_BUCKET = 'annverify-8d680.firebasestorage.app';

// ── Step 0: Cloudflare Workers AI (SDXL Lightning) 이미지 생성 → Firebase Storage ─
async function generateAndStoreImage(topic, imageId, env) {
  if (!env.AI || !env.FIREBASE_SA_JSON) return null;

  try {
    // 1. Cloudflare Workers AI — SDXL-Lightning (few-step, fast)
    const prompt =
      `Editorial news photograph: "${topic.name}" (${topic.cat}). ` +
      `Photojournalism style, dramatic lighting, high resolution, no text, no real faces.`;

    const imgStream = await env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', {
      prompt,
      num_steps: 4,
    });
    const imgBytes = await new Response(imgStream).arrayBuffer();
    if (!imgBytes || imgBytes.byteLength === 0) throw new Error('Empty image response');

    // 3. Firebase Storage 멀티파트 업로드
    //    metadata에 firebaseStorageDownloadTokens를 포함시켜 공개 URL 생성
    const storageToken = await getAccessToken(env.FIREBASE_SA_JSON, 'https://www.googleapis.com/auth/devstorage.read_write');
    if (!storageToken) throw new Error('Storage token failed');

    const dlToken     = crypto.randomUUID();
    const storagePath = `ai-news/${imageId}.png`;
    const boundary    = '----FormBoundary' + Math.random().toString(36).slice(2);

    const metaJson    = JSON.stringify({
      name:     storagePath,
      metadata: { firebaseStorageDownloadTokens: dlToken },
    });
    const metaPart  = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n`;
    const imgPart   = `--${boundary}\r\nContent-Type: image/png\r\n\r\n`;
    const closing   = `\r\n--${boundary}--`;

    const encoder  = new TextEncoder();
    const bodyParts = [encoder.encode(metaPart), encoder.encode(imgPart), new Uint8Array(imgBytes), encoder.encode(closing)];
    const totalLen  = bodyParts.reduce((s, b) => s + b.byteLength, 0);
    const bodyBuf   = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of bodyParts) { bodyBuf.set(part, offset); offset += part.byteLength; }

    const uploadRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o?uploadType=multipart`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${storageToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyBuf,
      }
    );
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Storage upload ${uploadRes.status}: ${errText.slice(0, 200)}`);
    }

    const encodedPath = encodeURIComponent(storagePath);
    const thumbUrl    = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${dlToken}`;
    console.log(`[Pipeline] Image stored: ${imageId}`);
    return thumbUrl;

  } catch (e) {
    console.warn('[Pipeline] Image generation skipped:', e.message);
    return null;
  }
}

// ── Step 1: Claude 기사 합성 ─────────────────────────────────────────
async function synthesizeArticle(topic, apiKey) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const today = new Date().toISOString().slice(0, 10);

  // 6개 랜덤 출처 선택 (매 사이클 다양성 확보)
  const shuffled    = [...CRAWL_SOURCES].sort(() => Math.random() - 0.5);
  const refSources  = shuffled.slice(0, 6).join(', ');

  const prompt = `You are an AI journalist for ANN Verify, a global fact-checking platform.
Today: ${today}

Write a comprehensive, neutral, fact-based English news article on this topic:
"${topic.name}"

Focus on a SPECIFIC current development or ongoing situation within this topic with significant social impact.
Reference these credible sources where appropriate (use at least 3): ${refSources}

STRICT RULES:
- Language: English only
- Content: social impact, potential misinformation risk, public interest, verifiability
- Exclude: advertising, personal/national defamation, unverifiable rumors
- trust_score MUST be 76–94. Values 95 or above are STRICTLY FORBIDDEN.
- trust_grade: EXACTLY "B+" if score 76–84, EXACTLY "A" if score 85–94. "A+" is STRICTLY FORBIDDEN.
- crawled_from MUST have at least 3 entries
- body MUST contain exactly 4 or 5 <p>...</p> paragraphs
- key_claims MUST have at least 3 entries

Return ONLY valid JSON. No markdown, no explanation, no code block:
{
  "title": "specific compelling headline under 100 characters",
  "category": "${topic.cat}",
  "excerpt": "2-sentence factual summary of the article",
  "body": "<p>Context and background.</p><p>Key facts and developments.</p><p>Analysis and implications.</p><p>Expert perspectives or data.</p><p>Outlook and conclusion.</p>",
  "trust_score": <integer 76-94>,
  "trust_grade": "<exactly B+ or A>",
  "key_claims": ["factual claim 1", "factual claim 2", "factual claim 3"],
  "source_label": "AI Synthesized · Source1, Source2",
  "crawled_from": ["Source1", "Source2", "Source3", "Source4"]
}`;

  const res  = await callAnthropic({
    model:       'claude-sonnet-4-6',
    max_tokens:  3000,
    temperature: 0.4,
    messages:    [{ role: 'user', content: prompt }],
  }, apiKey, {}, 25000);

  const data = await res.json();
  if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);

  const block   = Array.isArray(data.content) && data.content.find(b => b.type === 'text');
  const raw     = (block?.text || '').replace(/```json|```/g, '').trim();
  const article = JSON.parse(raw);
  return article;
}

// ── 메인 파이프라인 (매시간 Cron + 수동 트리거) ──────────────────────
export async function runNewsPipeline(env, topicOverride = null) {
  const date  = todayStr();
  const topic = topicOverride || selectTopic();
  console.log(`[Pipeline] Start | topic="${topic.name}" | date=${date}`);

  const db = await getDb(env);

  // ── 1. 기사 합성 + 이미지 생성 병렬 실행 ─────────────────────────
  const imageId = `ainews_${date}_${topic.id}_${Date.now()}`;
  let article, thumbUrl;
  try {
    [article, thumbUrl] = await Promise.all([
      synthesizeArticle(topic, env.ANTHROPIC_API_KEY),
      generateAndStoreImage(topic, imageId, env),
    ]);
    console.log(`[Pipeline] Synthesized | "${article.title}" | score=${article.trust_score} | thumb=${!!thumbUrl}`);
  } catch (e) {
    console.error('[Pipeline] Synthesis failed:', e.message);
    await logEvent(db, date, 'error', { reason: 'synthesis_failed', topic: topic.name, error: e.message });
    return { status: 'error', reason: 'synthesis_failed', error: e.message };
  }

  // ── 2. 품질 게이트: 점수 (76점 미만 → 스킵) ──────────────────────
  const score = Number(article.trust_score) || 0;
  if (score < 76) {
    console.warn(`[Pipeline] Score too low (${score}), skip`);
    await logEvent(db, date, 'skipped', { reason: 'score_too_low', topic: topic.name, score });
    return { status: 'skipped', reason: 'score_too_low', score };
  }

  // 안전 캡: 최대 94, A+ 금지
  article.trust_score = Math.min(score, 94);
  if (article.trust_grade === 'A+') article.trust_grade = 'A';

  // ── 3. 품질 게이트: 참조 출처 (3개 미만 → 스킵) ──────────────────
  if (!Array.isArray(article.crawled_from) || article.crawled_from.length < 3) {
    console.warn('[Pipeline] Insufficient sources, skip');
    await logEvent(db, date, 'skipped', { reason: 'insufficient_sources', topic: topic.name });
    return { status: 'skipped', reason: 'insufficient_sources' };
  }

  // ── 4. 중복 방지: 당일 제목 해시 비교 ───────────────────────────
  const normalized = (article.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hash       = simpleHash(normalized);

  if (db) {
    try {
      const todayDocs = await db.query('aiNews', [fsFilter('date', '==', date)], null, 100);
      const isDup     = todayDocs.some(a => {
        const h = simpleHash((a.title || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
        return h === hash;
      });
      if (isDup) {
        console.warn('[Pipeline] Duplicate title, skip');
        return { status: 'skipped', reason: 'duplicate', title: article.title };
      }
    } catch (e) {
      console.warn('[Pipeline] Dedup check failed (proceeding):', e.message);
    }
  }

  // ── 5. Firestore 저장 (aiNews 컬렉션) ────────────────────────────
  const now   = new Date().toISOString();
  const docId = `ainews_${date}_${hash}`;
  const doc   = {
    ...article,
    thumb:       thumbUrl || null,
    topic:       topic.name,
    topicId:     topic.id,
    date,
    publishedAt: now,
    deployedAt:  now,
    lang:        'en',
    _hash:       hash,
    _engine:     'ai_synthesized',
    _version:    'beta_1.0',
  };

  if (db) {
    try {
      await db.set('aiNews', docId, doc);
      console.log(`[Pipeline] Stored: ${docId}`);
      await logEvent(db, date, 'published', {
        docId, topic: topic.name, title: article.title,
        score: article.trust_score, grade: article.trust_grade,
      });
    } catch (e) {
      console.error('[Pipeline] Store failed:', e.message);
      return { status: 'error', reason: 'store_failed', error: e.message };
    }
  } else {
    console.warn('[Pipeline] DB unavailable, article not stored');
  }

  return {
    status: 'published',
    docId,
    topic:  topic.name,
    title:  article.title,
    score:  article.trust_score,
    grade:  article.trust_grade,
    thumb:  doc.thumb || null,
  };
}

// ── HTTP: GET /api/v4/news/feed — aiNews 조회 (프론트엔드 서빙) ──────
export async function handleV4NewsFeed(_request, env, cors) {
  const url   = new URL(_request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 100);

  const db = await getDb(env);
  if (!db) return json({ error: 'Firestore not configured', articles: [] }, 500, cors);

  const articles = await db.query('aiNews', [], 'publishedAt', limit);
  return json({ articles, count: articles.length, ts: Date.now() }, 200, cors);
}

// ── HTTP: POST /api/v4/news/cleanup — 구형 RSS 기사 일괄 삭제 ─────────
// _engine !== 'ai_synthesized' 인 문서를 모두 삭제 (500건씩 배치)
export async function handleV4NewsCleanup(_request, env, cors) {
  const db = await getDb(env);
  if (!db) return json({ error: 'Firestore not configured' }, 500, cors);

  let totalDeleted = 0;
  let round = 0;

  while (true) {
    // 전체 문서 100건씩 스캔 (정렬 없이)
    const docs = await db.query('aiNews', [], null, 100);
    if (!docs.length) break;

    // ai_synthesized 가 아닌 것만 추출
    const toDelete = docs
      .filter(d => d._engine !== 'ai_synthesized')
      .map(d => d._id)
      .filter(Boolean);

    if (!toDelete.length) break;  // 더 이상 구형 기사 없음

    const deleted = await db.batchDelete('aiNews', toDelete);
    totalDeleted += deleted;
    round++;
    console.log(`[Cleanup] Round ${round}: deleted ${deleted}`);

    if (toDelete.length < 100) break; // 마지막 배치
  }

  return json({ status: 'done', deleted: totalDeleted }, 200, cors);
}

// ── HTTP: POST /api/v4/news/generate — 관리자 수동 트리거 (동기 실행) ─
// Body (optional): { "topicId": 0-11 }  — 미지정 시 시간 기반 자동 선택
export async function handleV4NewsGenerate(request, env, cors, _ctx) {
  let topicOverride = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.topicId === 'number' && body.topicId >= 0 && body.topicId < CRAWL_TOPICS.length) {
      topicOverride = CRAWL_TOPICS[body.topicId];
    }
  } catch (_) {}
  const result = await runNewsPipeline(env, topicOverride);
  return json(result, 200, cors);
}
