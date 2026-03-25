// ③ ML Core Layer — v4 Partner News Route
// Pipeline: RSS Fetch → Category 분류 → Dedup by URL → Firestore partnerNews 저장
//
// 운영 정책:
//   - 파트너사별 최신 2건 수집, 본문 발췌 140자 이하 (저작권)
//   - 카테고리: international / politics / economy / science / health / social
//   - 갱신주기: UTC 00:00 / 13:00 (하루 2회)
//   - 기사 유효기간: 72시간 후 자동 삭제
//   - 중복 제거: URL 해시 기준
//
// Endpoints:
//   GET  /api/v4/partner/feed    — Firestore partnerNews 조회 (프론트엔드 서빙)
//   POST /api/v4/partner/refresh — 관리자 수동 RSS 갱신 트리거

import { json }                                          from '../../utils/cors.js';
import { getAccessToken, FirestoreClient, fsFilter }    from '../../utils/firestore.js';

const PROJECT_ID  = 'annverify-8d680';
const TTL_HOURS   = 72; // 기사 유효기간

const PARTNER_SOURCES = [
  { id: 'reuters',   name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/topNews',           color: '#FF8000', icon: 'R'   },
  { id: 'yonhap',    name: 'Yonhap News', url: 'https://www.yonhapnewstv.co.kr/browse/feed/',        color: '#005BAA', icon: 'Y'   },
  { id: 'ap',        name: 'AP News',     url: 'https://feeds.apnews.com/rss/apf-topnews',           color: '#CC0000', icon: 'AP'  },
  { id: 'afp',       name: 'AFP',         url: 'https://www.afp.com/en/afp-news-agency-en/rss',      color: '#003A70', icon: 'AFP' },
  { id: 'bloomberg', name: 'Bloomberg',   url: 'https://feeds.bloomberg.com/markets/news.rss',       color: '#1D1D1B', icon: 'B'   },
  { id: 'bbc',       name: 'BBC News',    url: 'https://feeds.bbci.co.uk/news/rss.xml',              color: '#BB1919', icon: 'BBC' },
  { id: 'cnn',       name: 'CNN',         url: 'http://rss.cnn.com/rss/edition.rss',                 color: '#CC0000', icon: 'CNN' },
];

// ── 카테고리 자동 분류 ────────────────────────────────────────────────
// international / politics / economy / science / health / social

function detectCategory(title, summary) {
  const text = ((title || '') + ' ' + (summary || '')).toLowerCase();
  if (/\b(war|conflict|nato|united nations|\bun\b|treaty|diplomat|sanction|invasion|military|troops|bilateral|foreign minister|ceasefire|refugee|asylum|border dispute|summit|alliance)\b/.test(text))
    return 'international';
  if (/\b(election|senate|congress|parliament|president|prime minister|vote|voting|ballot|democrat|republican|labour|conservative|legislation|white house|cabinet|party|minister|poll|inaugur)\b/.test(text))
    return 'politics';
  if (/\b(gdp|inflation|trade|stock|market|economy|financial|bank|currency|interest rate|recession|federal reserve|\bfed\b|imf|debt|fiscal|monetary|tariff|export|import|oil price|invest|earnings|revenue|profit)\b/.test(text))
    return 'economy';
  if (/\b(climate|space|nasa|research|study|discovery|\bai\b|artificial intelligence|technology|innovation|science|carbon|emission|renewable|physics|biology|chemistry|robot|quantum|satellite|asteroid)\b/.test(text))
    return 'science';
  if (/\b(health|vaccine|disease|medical|hospital|\bwho\b|pandemic|drug|cancer|virus|\bfda\b|treatment|surgery|mental health|obesity|covid|outbreak|medicine|patient|clinical)\b/.test(text))
    return 'health';
  return 'social';
}

// ── RSS 파싱 유틸 ─────────────────────────────────────────────────────

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

// 파트너사별 최신 2건, 본문 발췌 140자 이하 (저작권)
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
      .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim()
      .slice(0, 140); // 저작권: 본문 발췌 140자 이하
    const pubDate = extractXML('pubDate', item) || extractXML('dc:date', item) || extractXML('published', item);
    if (title && link && link.startsWith('http')) {
      items.push({
        partnerId: source.id,
        source:    source.name,
        color:     source.color,
        icon:      source.icon,
        title:     title.slice(0, 200),
        url:       link.trim(),
        summary:   desc,
        thumb:     extractThumb(item) || null,
        pubDate:   pubDate || null,
        category:  detectCategory(title, desc), // 카테고리 자동 분류
      });
    }
  }
  return items;
}

async function fetchPartnerFeed(source) {
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

// ── Firestore 클라이언트 ──────────────────────────────────────────────

async function getDb(env) {
  const saJson = env.FIREBASE_SA_JSON;
  if (!saJson) { console.warn('[Partner] FIREBASE_SA_JSON not set'); return null; }
  const token = await getAccessToken(saJson);
  if (!token) { console.warn('[Partner] Token failed'); return null; }
  return new FirestoreClient(PROJECT_ID, token);
}

// URL → 문서 ID용 단순 해시 (중복 제거 기준)
function urlHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 33) ^ url.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

// ── 72시간 만료 기사 삭제 ─────────────────────────────────────────────
async function cleanupExpired(db) {
  try {
    const cutoff = new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();
    const oldDocs = await db.query('partnerNews', [fsFilter('fetchedAt', '<', cutoff)], null, 200);
    if (!oldDocs.length) return 0;
    const oldIds = oldDocs.map(d => d._id).filter(Boolean);
    const deleted = await db.batchDelete('partnerNews', oldIds);
    console.log(`[Partner] Expired cleanup: ${deleted} articles removed`);
    return deleted;
  } catch (e) {
    console.warn('[Partner] Cleanup error:', e.message);
    return 0;
  }
}

// ── 파이프라인: RSS 수집 → Firestore partnerNews 저장 ────────────────
export async function runPartnerPipeline(env) {
  console.log('[Partner] Pipeline start (UTC:', new Date().toISOString(), ')');

  const db = await getDb(env);
  if (!db) return { status: 'error', reason: 'db_unavailable' };

  // 만료 기사 정리 (72시간)
  await cleanupExpired(db);

  const settled = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));

  const allArticles = [];
  const errors      = [];
  settled.forEach((r, i) => {
    const src = PARTNER_SOURCES[i];
    if (r.status === 'fulfilled') {
      if (r.value.articles.length) allArticles.push(...r.value.articles);
      else if (r.value.error)      errors.push({ source: src.name, error: r.value.error });
    } else {
      errors.push({ source: src.name, error: r.reason?.message || 'Unknown' });
    }
  });

  if (!allArticles.length) {
    console.warn('[Partner] No articles fetched');
    return { status: 'skipped', reason: 'no_articles', errors };
  }

  // URL 해시를 docId로 사용 → 동일 기사 중복 저장 방지
  const fetchedAt = new Date().toISOString();
  const date      = fetchedAt.slice(0, 10);
  const docsMap   = {};

  for (const a of allArticles) {
    const docId = `partner_${urlHash(a.url)}`;
    docsMap[docId] = {
      ...a,
      fetchedAt,
      date,
      verdict_class: 'unverified',
      _engine:       'partner_rss',
    };
  }

  const stored = await db.batchSet('partnerNews', docsMap);
  console.log(`[Partner] Stored ${stored}/${allArticles.length} | errors: ${errors.length}`);
  return { status: 'published', stored, total: allArticles.length, errors };
}

// ── HTTP: GET /api/v4/partner/feed — Firestore partnerNews 조회 ───────
// 72시간 이내 기사만 반환, RSS 원본 순서 (최신 우선)
export async function handleV4PartnerFeed(_request, env, cors) {
  const url   = new URL(_request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 100);

  const db = await getDb(env);
  if (!db) return json({ error: 'Firestore not configured', articles: [], partners: [] }, 500, cors);

  // 72시간 TTL 필터 적용
  const cutoff   = new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();
  const articles = await db.query('partnerNews', [fsFilter('fetchedAt', '>=', cutoff)], 'fetchedAt', limit);

  // Firestore가 비어 있으면 실시간 RSS 폴백 (초기 배포 직후 대비)
  if (articles.length === 0) {
    console.warn('[Partner] Firestore empty, falling back to live RSS');
    const settled = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));
    const live = [];
    settled.forEach(r => {
      if (r.status === 'fulfilled') live.push(...r.value.articles);
    });
    const partners = PARTNER_SOURCES.map(s => ({ id: s.id, name: s.name, color: s.color, icon: s.icon }));
    return json({ articles: live, partners, count: live.length }, 200, cors);
  }

  const partners = PARTNER_SOURCES.map(s => ({ id: s.id, name: s.name, color: s.color, icon: s.icon }));
  return json({ articles, partners, count: articles.length }, 200, cors);
}

// ── HTTP: POST /api/v4/partner/refresh — 수동 RSS 갱신 트리거 ─────────
export async function handleV4PartnerRefresh(_request, env, cors) {
  const result = await runPartnerPipeline(env);
  return json(result, 200, cors);
}

// ── Fisher-Yates 셔플 ─────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Today's Hot: cron에서 24h 만료 시 전체 RSS → 랜덤 5개 교체 ─────────
// Firestore todayHot/current: { registeredAt, slots: [...5개] }
// 24h 이내면 유지, 초과 시 전체 파트너 RSS 수집 → 셔플 → 상위 5개 저장
export async function runTodayHotUpdate(env) {
  const db = await getDb(env);
  if (!db) return;

  const now     = Date.now();
  const TTL_24H = 24 * 3600 * 1000;

  // 현재 슬롯 확인
  const current    = await db.get('todayHot', 'current');
  const registeredAt = current && current.registeredAt
    ? new Date(current.registeredAt).getTime() : 0;

  if (current && (now - registeredAt) < TTL_24H) {
    console.log('[TodayHot] Still valid, skipping update');
    return;
  }

  // 전체 파트너 RSS 수집 (파트너당 최대 2건)
  const settled = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));
  const allArticles = [];
  settled.forEach((r, i) => {
    const src = PARTNER_SOURCES[i];
    if (r.status === 'fulfilled' && r.value.articles.length > 0) {
      r.value.articles.forEach(a => {
        allArticles.push({ ...a, color: src.color, icon: src.icon });
      });
    }
  });

  if (!allArticles.length) {
    console.log('[TodayHot] No articles from RSS, keeping existing slots');
    return;
  }

  // 셔플 후 5개 선정
  const picked = shuffleArray(allArticles).slice(0, 5).map(a => ({
    url:       a.url,
    title:     a.title,
    thumb:     a.thumb     || null,
    summary:   a.summary   || '',
    pubDate:   a.pubDate   || null,
    category:  a.category  || 'general',
    partnerId: a.partnerId,
    source:    a.source,
    color:     a.color,
    icon:      a.icon,
  }));

  await db.set('todayHot', 'current', {
    registeredAt: new Date().toISOString(),
    slots:        picked,
  });
  console.log(`[TodayHot] Updated: ${picked.map(p => p.partnerId).join(', ')}`);
}

// ── HTTP: GET /api/v4/partner/hot ─────────────────────────────────────
export async function handleV4PartnerHot(_request, env, cors) {
  const db = await getDb(env);
  if (!db) return json({ slots: [] }, 500, cors);

  const current = await db.get('todayHot', 'current');
  const slots   = (current && Array.isArray(current.slots)) ? current.slots : [];

  return json({ slots }, 200, cors);
}
