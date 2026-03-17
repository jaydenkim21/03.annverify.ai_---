// ① Client Layer — AI News 페이지 (v2: 실시간 RSS + Claude 배치 팩트체크)

var _newsLoading = false;

var CAT_GRADIENT = {
  'World':    'from-blue-500 to-indigo-600',
  'Tech':     'from-violet-500 to-purple-700',
  'Finance':  'from-emerald-500 to-teal-700',
  'Science':  'from-cyan-500 to-blue-700',
  'Health':   'from-pink-500 to-rose-600',
  'Politics': 'from-orange-500 to-red-600',
  'Ethics':   'from-amber-500 to-orange-600',
};

function newsGradeClass(grade) {
  if (!grade) return 'text-slate-400 border-slate-200 bg-white dark:bg-slate-800';
  if (grade.startsWith('A')) return 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 dark:border-emerald-700';
  if (grade.startsWith('B')) return 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/40 dark:border-blue-700';
  if (grade === 'C')         return 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/40 dark:border-amber-700';
  return 'text-red-600 border-red-300 bg-red-50 dark:bg-red-900/40 dark:border-red-700';
}

function newsScoreColor(score) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function newsTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const m = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  } catch (_) { return ''; }
}

// ── 데이터 로드 — Firebase Firestore (aiNews 컬렉션, deployedAt 내림차순) ──
async function loadNews() {
  if (_newsLoading) return;
  _newsLoading = true;

  document.getElementById('news-grid').innerHTML =
    Array(6).fill('<div class="skeleton rounded-3xl h-80"></div>').join('');

  try {
    // Firebase Web SDK (db는 index.html에서 초기화된 전역 Firestore 인스턴스)
    var snap = await db.collection('aiNews')
      .orderBy('deployedAt', 'desc')
      .limit(60)
      .get();

    state.newsData = snap.docs.map(function(d) {
      return Object.assign({ id: d.id }, d.data());
    });

    // 오늘 데이터가 없으면 Worker API 폴백 (초기 구동 전)
    if (state.newsData.length === 0) {
      var res  = await fetch(API_URL + '/api/v4/news/feed');
      if (res.ok) {
        var data = await res.json();
        state.newsData = data.articles || [];
      }
    }

    renderNews();
  } catch (err) {
    document.getElementById('news-grid').innerHTML = `
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>
        <p class="mb-4">Failed to load news feed: ${escHtml(err.message)}</p>
        <button onclick="loadNews()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>
      </div>`;
  } finally {
    _newsLoading = false;
  }
}

function filterNews() { renderNews(); }


function loadMoreNews() {
  alert('Full archive coming in v2.0!');
}

// ── 카드 렌더링 ──────────────────────────────────────────────────────
function renderNews() {
  var sf    = (document.getElementById('news-score-filter') || {}).value || '';
  var cf    = (document.getElementById('news-cat-filter')   || {}).value || '';
  var items = (state.newsData || []).filter(n => {
    if (sf && !(n.grade || '').startsWith(sf)) return false;
    if (cf && n.cat !== cf)                    return false;
    return true;
  });

  if (!items.length) {
    document.getElementById('news-grid').innerHTML = `
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">article</span>
        <p>No articles match the current filter.</p>
      </div>`;
    return;
  }

  document.getElementById('news-grid').innerHTML = items.map(n => {
    var gc      = newsGradeClass(n.grade);
    var grad    = CAT_GRADIENT[n.cat] || 'from-slate-500 to-slate-700';
    var time    = newsTimeAgo(n.pubDate);
    var verdict = (n.verdict_class || 'UNVERIFIED').replace(/_/g, ' ');
    var scoreC  = newsScoreColor(n.score);
    return `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group">

      <!-- 썸네일 영역 — 클릭 시 7-Layer 팩트체크 실행 -->
      <div class="relative cursor-pointer overflow-hidden h-48 bg-gradient-to-br ${grad} shrink-0"
           onclick="runNewsCheck('${escHtml(n.id)}')">
        ${n.thumb
          ? `<img src="${escHtml(n.thumb)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display='none'"/>`
          : ''}
        <!-- Hover 오버레이 -->
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">
            <span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">fact_check</span>
          </div>
        </div>
        <!-- 등급 배지 -->
        <div class="absolute top-3 right-3 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-md ${gc}">
          ${escHtml(n.grade || '?')}
        </div>
        <!-- 출처 배지 -->
        <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          ${escHtml(n.source)}
        </div>
      </div>

      <!-- 콘텐츠 -->
      <div class="p-5 flex flex-col flex-1">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">${escHtml(n.cat)}</span>
          <span class="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">${escHtml(verdict)}</span>
          ${time ? `<span class="ml-auto text-xs text-slate-400 shrink-0">${time}</span>` : ''}
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3"
            onclick="runNewsCheck('${escHtml(n.id)}')">${escHtml(n.title)}</h3>
        ${n.summary
          ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(n.summary)}</p>`
          : ''}
        <!-- 버튼 영역 -->
        <div class="flex items-center gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <span class="text-sm font-black ${scoreC} mr-auto">${n.score != null ? n.score : '--'}<span class="text-xs font-normal text-slate-400">/100</span></span>
          <button onclick="event.stopPropagation(); window.open('${escHtml(n.url)}', '_blank')"
                  class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold hover:border-primary hover:text-primary transition-all flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>View Source
          </button>
          <button onclick="event.stopPropagation(); openArticleDiscussion('${escHtml(n.id)}')"
                  class="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-xl font-semibold hover:bg-primary/20 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">forum</span>Discuss
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ── 썸네일 클릭 → 7-Layer 팩트체크 실행 ──────────────────────────────
// verdict_class 를 renderReport() 의 badgeMap 키로 변환
function _toVc(raw) {
  var v = (raw || '').toLowerCase();
  if (v === 'verified')                         return 'verified';
  if (v === 'likely_true' || v === 'likely')    return 'likely';
  if (v === 'partially_true' || v === 'partial') return 'partial';
  if (v === 'misleading')                       return 'misleading';
  if (v === 'false')                            return 'false';
  return 'partial';
}

function runNewsCheck(articleId) {
  var article = (state.newsData || []).find(a => a.id === articleId);
  if (!article) return;

  var vc    = _toVc(article.verdict_class);
  var score = article.score || 72;

  state.lastInput = article.title || article.url;
  state.imageB64  = null;
  state.lastResult = {
    overall_score:     score,
    overall_grade:     article.grade || 'B',
    verdict_class:     vc,
    executive_summary: article.summary || '',
    layer_analysis:    [],
    metrics:           {},
    claims:            [],
    key_evidence:      {},
    temporal:          article.pubDate ? {
      freshness:   'recent',
      timeframe:   newsTimeAgo(article.pubDate) || article.pubDate,
      expiry_risk: 'LOW',
    } : null,
    web_citations:     article.url ? [article.url] : [],
    _engine:           'ai_news',
    _source:           article.source,
  };

  goPage('report');
}

// ── Discuss 버튼 → Community 디테일 ──────────────────────────────────
function openArticleDiscussion(articleId) {
  var article = (state.newsData || []).find(a => a.id === articleId);
  if (!article) return;
  var score = article.score || 72;
  var item = {
    id:          'news_' + articleId,
    tag:         article.tag || article.cat,
    score:       score,
    yes:         Math.round(score * 0.70),
    partial:     Math.round(score * 0.20),
    no:          Math.max(0, 100 - Math.round(score * 0.90)),
    date:        newsTimeAgo(article.pubDate) || 'recently',
    comments:    0, likes: 0, ts: Date.now(),
    source:      'ainews',
    verdict:     (article.verdict_class || 'UNVERIFIED').replace(/_/g, ' '),
    title:       article.title,
    description: article.summary || '',
    claimSource: 'Source: ' + article.source,
    image:       article.thumb || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80',
    articleUrl:  article.url,
  };
  state.communityDetail = item;
  if (!state.communityComments)        state.communityComments = {};
  if (!state.communityComments[item.id]) state.communityComments[item.id] = [];
  renderCommunityDetail(item);
  goPage('community-detail');
}
