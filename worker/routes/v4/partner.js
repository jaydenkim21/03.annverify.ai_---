// ③ ML Core Layer — v4 Partner News Route
// GET /api/v4/partner/feed — 7개 파트너 매체 RSS 수집 (매체별 최대 2개)

import { json } from '../../utils/cors.js';

const PARTNER_SOURCES = [
  { id: 'reuters',   name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/topNews',                 color: '#FF8000', icon: 'R'   },
  { id: 'yonhap',    name: 'Yonhap News', url: 'https://www.yonhapnewstv.co.kr/browse/feed/',              color: '#005BAA', icon: 'Y'   },
  { id: 'ap',        name: 'AP News',     url: 'https://feeds.apnews.com/rss/apf-topnews',                 color: '#CC0000', icon: 'AP'  },
  { id: 'afp',       name: 'AFP',         url: 'https://www.afp.com/en/afp-news-agency-en/rss',            color: '#003A70', icon: 'AFP' },
  { id: 'bloomberg', name: 'Bloomberg',   url: 'https://feeds.bloomberg.com/markets/news.rss',             color: '#1D1D1B', icon: 'B'   },
  { id: 'bbc',       name: 'BBC News',    url: 'https://feeds.bbci.co.uk/news/rss.xml',                   color: '#BB1919', icon: 'BBC' },
  { id: 'cnn',       name: 'CNN',         url: 'http://rss.cnn.com/rss/edition.rss',                      color: '#CC0000', icon: 'CNN' },
];

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
      .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0, 250);
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
        thumb:     extractThumb(item),
        pubDate,
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

// ── HTTP: GET /api/v4/partner/feed ────────────────────────────────────
export async function handleV4PartnerFeed(request, env, cors) {
  const settled  = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));

  const articles = [];
  const errors   = [];

  settled.forEach((r, i) => {
    const src = PARTNER_SOURCES[i];
    if (r.status === 'fulfilled') {
      if (r.value.articles.length > 0) {
        articles.push(...r.value.articles);
      } else if (r.value.error) {
        errors.push({ source: src.name, error: r.value.error });
      }
    } else {
      errors.push({ source: src.name, error: r.reason?.message || 'Unknown' });
    }
  });

  // 파트너 메타 목록도 함께 반환 (프론트에서 로고 렌더링에 사용)
  const partners = PARTNER_SOURCES.map(s => ({
    id: s.id, name: s.name, color: s.color, icon: s.icon,
  }));

  return json({ articles, partners, count: articles.length, errors }, 200, cors);
}
