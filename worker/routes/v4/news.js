// ③ ML Core Layer — v4 News Route
// GET  /api/v4/news/feed          — Firebase에서 배포된 뉴스 조회
// POST /api/v4/news/generate      — 수동 생성 트리거 (테스트용)
// Scheduled: 09:00 각국 기준 생성, 10:00 배포

import { json }                                from '../../utils/cors.js';
import { callAnthropic }                       from '../../utils/anthropic.js';
import { getAccessToken, FirestoreClient, fsFilter } from '../../utils/firestore.js';

const PROJECT_ID = 'annverify-8d680';

// ── 미국 RSS 20개 ────────────────────────────────────────────────────
const RSS_US = [
  { name: 'BBC News',        url: 'https://feeds.bbci.co.uk/news/rss.xml',                    cat: 'World'   },
  { name: 'Reuters',         url: 'https://feeds.reuters.com/reuters/topNews',                  cat: 'World'   },
  { name: 'AP News',         url: 'https://feeds.apnews.com/rss/apf-topnews',                  cat: 'World'   },
  { name: 'NPR News',        url: 'https://feeds.npr.org/1001/rss.xml',                         cat: 'World'   },
  { name: 'The Guardian',    url: 'https://www.theguardian.com/world/rss',                      cat: 'World'   },
  { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',                  cat: 'World'   },
  { name: 'CNN',             url: 'http://rss.cnn.com/rss/edition.rss',                         cat: 'World'   },
  { name: 'ABC News',        url: 'https://feeds.abcnews.com/abcnews/topstories',               cat: 'World'   },
  { name: 'Time',            url: 'https://time.com/feed/',                                     cat: 'World'   },
  { name: 'NYT',             url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',  cat: 'World'   },
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/',                               cat: 'Tech'    },
  { name: 'The Verge',       url: 'https://www.theverge.com/rss/index.xml',                     cat: 'Tech'    },
  { name: 'Wired',           url: 'https://www.wired.com/feed/rss',                             cat: 'Tech'    },
  { name: 'Ars Technica',    url: 'https://feeds.arstechnica.com/arstechnica/index',            cat: 'Tech'    },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/',                     cat: 'Tech'    },
  { name: 'CNBC',            url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',      cat: 'Finance' },
  { name: 'Forbes',          url: 'https://www.forbes.com/innovation/feed2',                    cat: 'Finance' },
  { name: 'Science Daily',   url: 'https://www.sciencedaily.com/rss/all.xml',                   cat: 'Science' },
  { name: 'NASA',            url: 'https://www.nasa.gov/news-release/feed/',                    cat: 'Science' },
  { name: 'Wash. Post',      url: 'https://feeds.washingtonpost.com/rss/world',                 cat: 'World'   },
];

// ── 한국 RSS 20개 ────────────────────────────────────────────────────
const RSS_KR = [
  { name: '연합뉴스',   url: 'https://www.yonhapnewstv.co.kr/browse/feed/',                     cat: 'World'   },
  { name: 'KBS 뉴스',   url: 'https://news.kbs.co.kr/rss/rss.xml',                             cat: 'World'   },
  { name: 'MBC 뉴스',   url: 'https://imnews.imbc.com/rss/news/news_00.xml',                   cat: 'World'   },
  { name: 'SBS 뉴스',   url: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01',     cat: 'World'   },
  { name: 'YTN',        url: 'https://www.ytn.co.kr/rss/0101.xml',                             cat: 'World'   },
  { name: 'JTBC',       url: 'https://fs.jtbc.co.kr/RSS/newsflash.xml',                        cat: 'World'   },
  { name: '조선일보',   url: 'https://www.chosun.com/arc/outboundfeeds/rss/',                   cat: 'World'   },
  { name: '중앙일보',   url: 'https://rss.joins.com/joins_news_list.xml',                       cat: 'World'   },
  { name: '동아일보',   url: 'https://rss.donga.com/total.xml',                                 cat: 'World'   },
  { name: '한겨레',     url: 'https://www.hani.co.kr/rss/',                                     cat: 'World'   },
  { name: '경향신문',   url: 'https://www.khan.co.kr/rss/rssdata/total_news.xml',               cat: 'World'   },
  { name: '한국경제',   url: 'https://www.hankyung.com/feed/all-news',                          cat: 'Finance' },
  { name: '매일경제',   url: 'https://www.mk.co.kr/rss/40300001/',                              cat: 'Finance' },
  { name: '서울경제',   url: 'https://www.sedaily.com/RSSFeed/RSS_Itnews.asp',                  cat: 'Tech'    },
  { name: '아시아경제', url: 'https://www.asiae.co.kr/rss/all.htm',                             cat: 'Finance' },
  { name: '뉴시스',     url: 'https://www.newsis.com/RSS/',                                     cat: 'World'   },
  { name: '뉴스1',      url: 'https://www.news1.kr/rss/allnews.xml',                            cat: 'World'   },
  { name: '머니투데이', url: 'https://rss.mt.co.kr/mt_news2.xml',                               cat: 'Finance' },
  { name: '이데일리',   url: 'https://www.edaily.co.kr/RSS/NEWS/Edaily_News_RSS.asp',           cat: 'Finance' },
  { name: '파이낸셜뉴스', url: 'https://www.fnnews.com/rss/fn_realnews.xml',                  cat: 'Finance' },
];

// ── RSS XML 파싱 유틸 ────────────────────────────────────────────────
function extractXML(tag, xml) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m  = re.exec(xml);
  return (m ? (m[1] || m[2] || '') : '').trim();
}

function extractThumb(itemXml) {
  let m = /media:(?:content|thumbnail)[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+url="([^"]+)"[^>]+type="image[^"]*"/.exec(itemXml);
  if (m) return m[1];
  const desc = extractXML('description', itemXml);
  m = /<img[^>]+src="([^"]+)"/.exec(desc);
  return (m && m[1].startsWith('http')) ? m[1] : null;
}

function parseRSS(xml, source, limit = 2) {
  const items = [];
  const re    = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const item    = m[1];
    const title   = extractXML('title', item)
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
    const link    = extractXML('link', item) || extractXML('guid', item);
    const desc    = extractXML('description', item)
      .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,250);
    const pubDate = extractXML('pubDate', item) || extractXML('dc:date', item) || extractXML('published', item);
    if (title && link && link.startsWith('http')) {
      items.push({ title: title.slice(0,200), url: link.trim(), summary: desc, thumb: extractThumb(item), source: source.name, cat: source.cat, pubDate });
    }
  }
  return items;
}

// 단일 RSS fetch (8초 타임아웃)
async function fetchFeed(source) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANNVerify/2.0; +https://annverify.ai)' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { articles: parseRSS(await res.text(), source, 2), error: null };
  } catch (err) {
    clearTimeout(tid);
    return { articles: [], error: err.message };
  }
}

// Claude 배치 스코어링 (단일 API 호출)
async function batchScore(articles, apiKey) {
  if (!articles.length || !apiKey) return articles;
  const headlines = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');
  // 컴팩트 필드명으로 토큰 절약: s=score,g=grade,v=verdict_class,t=tag,f=factual,l=logic,sq=source_quality,cv=cross_validation,re=recency
  const prompt = `Score these ${articles.length} news headlines. For each return compact JSON with fields:
s(0-100 overall), g(A+/A/B+/B/C/D/F), v(VERIFIED|LIKELY_TRUE|PARTIALLY_TRUE|UNVERIFIED|MISLEADING|FALSE), t(Trending|AI Ethics|LLM|Policy|Deepfakes|Science|Finance|Politics|Health|World), f(factual 0-100), l(logic 0-100), sq(source quality 0-100), cv(cross-validation 0-100), re(recency 0-100).
Headlines:\n${headlines}
Return ONLY: [{"i":1,"s":88,"g":"A","v":"LIKELY_TRUE","t":"World","f":90,"l":85,"sq":88,"cv":80,"re":95},...]`;
  try {
    const res  = await callAnthropic({ model:'claude-sonnet-4-5', max_tokens:5000, temperature:0, messages:[{role:'user',content:prompt}] }, apiKey, {}, 30000);
    const data = await res.json();
    if (!res.ok) return articles;
    const block  = Array.isArray(data.content) && data.content.find(b => b.type === 'text');
    const scores = JSON.parse((block?.text || '').replace(/```json|```/g,'').trim());
    if (Array.isArray(scores)) {
      scores.forEach(s => {
        const idx = (s.i || 0) - 1;
        if (idx >= 0 && idx < articles.length) {
          articles[idx].score            = s.s;
          articles[idx].grade            = s.g;
          articles[idx].verdict_class    = s.v;
          articles[idx].tag              = s.t;
          articles[idx].m_factual        = s.f;
          articles[idx].m_logic          = s.l;
          articles[idx].m_source_quality = s.sq;
          articles[idx].m_cross_val      = s.cv;
          articles[idx].m_recency        = s.re;
        }
      });
    }
  } catch (_) {}
  return articles;
}

// 10개씩 병렬로 상세 팩트체크 분석
async function batchDetail(articles, apiKey) {
  if (!articles.length || !apiKey) return articles;
  const BATCH = 10;
  const batches = [];
  for (let i = 0; i < articles.length; i += BATCH) batches.push({ start: i, items: articles.slice(i, i + BATCH) });

  await Promise.all(batches.map(async ({ start, items }) => {
    const lines = items.map((a, j) => `${j + 1}. [${a.source}] ${a.title}`).join('\n');
    const prompt = `Fact-check these ${items.length} news headlines in detail.
For each return JSON with:
- i: index (1-based)
- sum: executive summary (2-3 sentences analyzing factual accuracy)
- claims: array of 3 key claims [{t:"claim text",s:"CONFIRMED|PARTIAL|DISPUTED",v:"one sentence verdict"}]
- sup: array of 2-3 supporting evidence strings
- con: array of 1-2 contradicting evidence strings (empty array if none)
- fresh: "current"|"recent"|"dated"
- tf: timeframe description (e.g. "Article from March 2026")
- er: "LOW"|"MEDIUM"|"HIGH" (expiry risk)
- rc: true|false (recheck recommended)
- cit: array of 2-3 relevant source/reference descriptions

Headlines:
${lines}

Return ONLY JSON array: [{"i":1,"sum":"...","claims":[...],"sup":[...],"con":[...],"fresh":"recent","tf":"...","er":"LOW","rc":false,"cit":["..."]},...]`;

    try {
      const res  = await callAnthropic({ model: 'claude-sonnet-4-5', max_tokens: 5000, temperature: 0, messages: [{ role: 'user', content: prompt }] }, apiKey, {}, 35000);
      const data = await res.json();
      if (!res.ok) { console.error('[Detail] API error', res.status, JSON.stringify(data).slice(0, 200)); return; }
      const block   = Array.isArray(data.content) && data.content.find(b => b.type === 'text');
      const raw     = (block?.text || '').replace(/```json|```/g, '').trim();
      console.log('[Detail] raw start=' + start, raw.slice(0, 200));
      const parsed  = JSON.parse(raw);
      const details = Array.isArray(parsed) ? parsed : (Object.values(parsed).find(v => Array.isArray(v)) || []);
      console.log('[Detail] details.length=' + details.length + ' start=' + start);
      if (details.length > 0) {
        details.forEach(d => {
          const idx = start + (d.i || 0) - 1;
          if (idx >= 0 && idx < articles.length) {
            articles[idx].d_sum    = d.sum;
            articles[idx].d_claims = d.claims;
            articles[idx].d_sup    = d.sup;
            articles[idx].d_con    = d.con;
            articles[idx].d_fresh  = d.fresh;
            articles[idx].d_tf     = d.tf;
            articles[idx].d_er     = d.er;
            articles[idx].d_rc     = d.rc;
            articles[idx].d_cit    = d.cit;
          }
        });
      }
    } catch (e) { console.error('[Detail] batch error start=' + start, e.message, e.stack?.slice(0, 300)); }
  }));
  return articles;
}

// Firestore 클라이언트 초기화 헬퍼
async function getDb(env) {
  const saJson = env.FIREBASE_SA_JSON;
  if (!saJson) { console.warn('[News] FIREBASE_SA_JSON not set'); return { error: 'SA_JSON_MISSING' }; }
  const token = await getAccessToken(saJson);
  if (!token || typeof token !== 'string') { console.warn('[News] Failed to get access token'); return { error: 'TOKEN_FAILED' }; }
  return new FirestoreClient(PROJECT_ID, token);
}

// 국가별 오늘 날짜 문자열 (UTC 기준)
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Scheduled: 09:00 — AI News 생성 ──────────────────────────────────
export async function generateNews(country, env) {
  const sources = country === 'KR' ? RSS_KR : RSS_US;
  const date    = todayStr();
  console.log(`[News] Generating ${country} news for ${date}`);

  const db = await getDb(env);

  // RSS 병렬 fetch
  const settled = await Promise.allSettled(sources.map(s => fetchFeed(s)));
  let articles  = [];
  const failures = [];

  settled.forEach((r, i) => {
    const source = sources[i];
    if (r.status === 'fulfilled') {
      if (r.value.articles.length > 0) {
        articles.push(...r.value.articles);
      } else if (r.value.error) {
        failures.push({ source: source.name, url: source.url, error: r.value.error });
      }
    } else {
      failures.push({ source: source.name, url: source.url, error: r.reason?.message || 'Unknown error' });
    }
  });

  // Claude 배치 스코어링 (점수/등급/메트릭)
  articles = await batchScore(articles, env.ANTHROPIC_API_KEY);

  // Claude 배치 상세 분석 (요약/클레임/증거/시간/인용) — 10개씩 병렬
  articles = await batchDetail(articles, env.ANTHROPIC_API_KEY);

  // 기본값 채우기
  articles = articles.map((a) => ({
    ...a,
    country,
    date,
    score:         a.score         ?? 72,
    grade:         a.grade         ?? 'B',
    verdict_class: a.verdict_class ?? 'UNVERIFIED',
    tag:           a.tag           ?? a.cat,
    generatedAt:   new Date().toISOString(),
    deployed:      false,
    deployedAt:    null,
  }));

  if (db && !db.error) {
    // 기사 배치 저장 (newsQueue 컬렉션) — 단일 HTTP 요청
    const docsMap = Object.fromEntries(articles.map((a, idx) => [`${country}_${date}_${idx}`, a]));
    await db.batchSet('newsQueue', docsMap);

    // 실패 로그 저장
    if (failures.length > 0) {
      await db.set('newsLogs', `gen_${country}_${date}`, {
        type: 'generate', country, date,
        fetchedCount:  articles.length,
        failedCount:   failures.length,
        failedSources: JSON.stringify(failures),
        generatedAt:   new Date().toISOString(),
      });
      console.warn(`[News] ${country} generation: ${articles.length} ok, ${failures.length} failed`);
    }
  }

  const detailCount = articles.filter(a => a.d_sum).length;
  return { country, date, count: articles.length, detail_count: detailCount, failures: failures.length };
}

// ── Scheduled: 10:00 — AI News 배포 ──────────────────────────────────
export async function deployNews(country, env) {
  const date = todayStr();
  console.log(`[News] Deploying ${country} news for ${date}`);

  const db = await getDb(env);
  if (!db) return { deployed: 0 };

  // newsQueue에서 해당 국가 기사 조회 (단일 필터 → 날짜는 JS 필터)
  const all = await db.query('newsQueue', [fsFilter('country', '==', country)], null, 200);
  const articles = all.filter(a => a.date === date);

  let deployed = 0;
  const now = new Date().toISOString();

  // aiNews 컬렉션으로 배치 이동 (배포됨) — 단일 HTTP 요청
  const deployMap = {};
  articles.forEach(a => {
    const docId = a._id;
    const deployedArticle = { ...a, deployed: true, deployedAt: now };
    delete deployedArticle._id;
    deployMap[docId] = deployedArticle;
  });
  deployed = await db.batchSet('aiNews', deployMap);

  // 배포 로그
  await db.set('newsLogs', `deploy_${country}_${date}`, {
    type: 'deploy', country, date,
    deployedCount: deployed,
    deployedAt: now,
  });

  console.log(`[News] ${country} deployed ${deployed} articles`);
  return { country, date, deployed };
}

// ── HTTP: GET /api/v4/news/feed — 배포된 뉴스 조회 ──────────────────
export async function handleV4NewsFeed(request, env, cors) {
  const url     = new URL(request.url);
  const country = url.searchParams.get('country') || '';   // 'US' | 'KR' | '' (전체)
  const limit   = Math.min(parseInt(url.searchParams.get('limit') || '60'), 100);

  const db = await getDb(env);
  if (!db || db.error) {
    return json({ error: 'Firestore not configured', articles: [] }, 500, cors);
  }

  // Firestore runQuery에서 country filter + deployedAt orderBy 복합 인덱스 불필요하도록
  // 전체를 deployedAt 내림차순으로 조회 후 JS에서 country 필터
  const fetchLimit = country ? Math.min(limit * 3, 200) : limit;
  let articles = await db.query('aiNews', [], 'deployedAt', fetchLimit);
  if (country) articles = articles.filter(a => a.country === country).slice(0, limit);

  return json({ articles, count: articles.length, ts: Date.now() }, 200, cors);
}


// ── HTTP: POST /api/v4/news/generate — 수동 트리거 (관리자용) ─────────
export async function handleV4NewsGenerate(request, env, cors, ctx) {
  const body    = await request.json().catch(() => ({}));
  const country = body.country || 'US';
  const action  = body.action  || 'generate'; // 'generate' | 'deploy'

  if (action === 'deploy') {
    // deploy는 빠르므로 직접 실행
    const result = await deployNews(country, env);
    return json(result, 200, cors);
  } else {
    // generate는 오래 걸리므로 waitUntil로 백그라운드 실행 후 즉시 202 반환
    const date = new Date().toISOString().slice(0, 10);
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(generateNews(country, env));
      return json({ status: 'started', country, date, message: 'Generation running in background. Check Firestore in ~60s.' }, 202, cors);
    }
    // ctx 없는 경우 (로컬 개발 등) 직접 실행
    const result = await generateNews(country, env);
    return json(result, 200, cors);
  }
}
