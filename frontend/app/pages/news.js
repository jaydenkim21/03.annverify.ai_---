// ① Client Layer — AI News 페이지 (Beta v1.0)
// Firestore aiNews 컬렉션에서 Claude 합성 기사를 읽어 카드 렌더링
// 카드 클릭 → 저장된 Verification Report 즉시 표시 (재팩트체크 없음)

var _newsLoading = false;

// 카테고리별 그라디언트 (Security, Energy 추가)
var CAT_GRADIENT = {
  'World':    'from-blue-500 to-indigo-600',
  'Tech':     'from-violet-500 to-purple-700',
  'Finance':  'from-emerald-500 to-teal-700',
  'Science':  'from-cyan-500 to-blue-700',
  'Health':   'from-pink-500 to-rose-600',
  'Politics': 'from-orange-500 to-red-600',
  'Security': 'from-red-600 to-rose-800',
  'Energy':   'from-yellow-500 to-orange-600',
};

function newsGradeClass(grade) {
  if (!grade) return 'text-slate-400 border-slate-200 bg-white dark:bg-slate-800';
  if (grade.startsWith('A')) return 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 dark:border-emerald-700';
  if (grade.startsWith('B')) return 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/40 dark:border-blue-700';
  if (grade === 'C')         return 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/40 dark:border-amber-700';
  return 'text-red-600 border-red-300 bg-red-50 dark:bg-red-900/40 dark:border-red-700';
}

function newsScoreColor(score) {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 76) return 'text-blue-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function newsTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    var m = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  } catch (_) { return ''; }
}

// ── 데이터 로드 — Firestore aiNews 컬렉션 ────────────────────────────
async function loadNews() {
  if (_newsLoading) return;
  _newsLoading = true;

  document.getElementById('news-grid').innerHTML =
    Array(6).fill('<div class="skeleton rounded-3xl h-80"></div>').join('');

  try {
    var snap = await db.collection('aiNews')
      .orderBy('publishedAt', 'desc')
      .limit(60)
      .get();

    state.newsData = snap.docs.map(function(d) {
      return Object.assign({ id: d.id }, d.data());
    });

    // Firestore 데이터 없으면 Worker API 폴백
    if (state.newsData.length === 0) {
      var res = await fetch(API_URL + '/api/v4/news/feed');
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

// ── 카드 렌더링 ───────────────────────────────────────────────────────
function renderNews() {
  var sf    = (document.getElementById('news-score-filter') || {}).value || '';
  var cf    = (document.getElementById('news-cat-filter')   || {}).value || '';

  var items = (state.newsData || []).filter(function(n) {
    // 점수 필터: trust_score(신규) 또는 grade(구형) 기준
    var grade = n.trust_grade || n.grade || '';
    if (sf && !grade.startsWith(sf)) return false;
    // 카테고리 필터: category(신규) 또는 cat(구형)
    var cat = n.category || n.cat || '';
    if (cf && cat !== cf) return false;
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

  document.getElementById('news-grid').innerHTML = items.map(function(n) {
    var cat     = n.category || n.cat || 'World';
    var grade   = n.trust_grade || n.grade || '';
    var score   = n.trust_score != null ? n.trust_score : (n.score != null ? n.score : null);
    var excerpt = n.excerpt || n.summary || '';
    var source  = n.source_label || n.source || '';
    var isSynth = n._engine === 'ai_synthesized';

    var gc     = newsGradeClass(grade);
    var grad   = CAT_GRADIENT[cat] || 'from-slate-500 to-slate-700';
    var time   = newsTimeAgo(n.publishedAt || n.pubDate);
    var scoreC = score != null ? newsScoreColor(score) : 'text-slate-400';

    // 판정 배지: AI Synthesized vs 기존 verdict_class
    var verdictHtml = isSynth
      ? `<span class="px-2.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[10px] font-bold uppercase">AI Synthesized</span>`
      : `<span class="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">${escHtml((n.verdict_class || 'UNVERIFIED').replace(/_/g, ' '))}</span>`;

    var safeId = escHtml(n.id || '');

    return `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group">

      <!-- 썸네일 -->
      <div class="relative cursor-pointer overflow-hidden h-48 bg-gradient-to-br ${grad} shrink-0"
           onclick="runNewsCheck('${safeId}')">
        ${n.thumb
          ? `<img src="${escHtml(n.thumb)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display='none'"/>`
          : ''}
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">
            <span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">article</span>
          </div>
        </div>
        <!-- 등급 배지 -->
        <div class="absolute top-3 right-3 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-md ${gc}">
          ${escHtml(grade || '?')}
        </div>
        <!-- 출처 배지 -->
        <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm max-w-[70%] truncate">
          ${escHtml(isSynth ? 'ANN AI' : source)}
        </div>
        ${isSynth ? `<div class="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-violet-600/80 text-white text-[9px] font-bold backdrop-blur-sm">AI</div>` : ''}
      </div>

      <!-- 콘텐츠 -->
      <div class="p-5 flex flex-col flex-1">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">${escHtml(cat)}</span>
          ${verdictHtml}
          ${time ? `<span class="ml-auto text-xs text-slate-400 shrink-0">${time}</span>` : ''}
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3"
            onclick="runNewsCheck('${safeId}')">${escHtml(n.title || '')}</h3>
        ${excerpt
          ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(excerpt)}</p>`
          : ''}
        <!-- 하단 버튼 -->
        <div class="flex items-center gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <span class="text-sm font-black ${scoreC} mr-auto">
            ${score != null ? score : '--'}<span class="text-xs font-normal text-slate-400">/100</span>
          </span>
          ${n.url
            ? `<button onclick="event.stopPropagation(); window.open('${escHtml(n.url)}', '_blank')"
                       class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold hover:border-primary hover:text-primary transition-all flex items-center gap-1">
                 <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>Source
               </button>`
            : ''}
          <button onclick="event.stopPropagation(); openArticleDiscussion('${escHtml(n.id || '')}')"
                  class="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-xl font-semibold hover:bg-primary/20 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">forum</span>Discuss
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ── 카드 클릭 → Verification Report 즉시 표시 ────────────────────────
function runNewsCheck(articleId) {
  var article = (state.newsData || []).find(function(a) { return a.id === articleId; });
  if (!article) return;

  state.lastInput = article.title || article.url || '';
  state.imageB64  = null;

  var isSynth = article._engine === 'ai_synthesized';

  if (isSynth) {
    // ── AI Synthesized 기사: 합성 결과를 리포트로 표시 ──────────────
    var grade = article.trust_grade || 'B+';
    var vc    = grade.startsWith('A') ? 'likely' : 'partial';

    state.lastResult = {
      overall_score:     article.trust_score || 80,
      overall_grade:     grade,
      verdict_class:     vc,
      executive_summary: article.excerpt || '',
      _body:             article.body || '',          // HTML 본문 (4–5단락)
      layer_analysis:    [],                           // v2.0에서 추가 예정
      metrics:           {},                           // v2.0에서 추가 예정
      claims: (article.key_claims || []).map(function(c) {
        return { sentence: c, status: 'CONFIRMED', verdict: '' };
      }),
      key_evidence: {
        supporting:    article.crawled_from || [],
        contradicting: [],
      },
      temporal:       null,
      web_citations:  [],                              // URL 없음 — 출처명만 사용
      _engine:        'ai_news',
      _source:        article.source_label || 'AI Synthesized',
      _topic:         article.topic || '',
      _thumb:         article.thumb || null,
      _title:         article.title || '',
      _is_synth:      true,
    };
  } else {
    // ── 구형 팩트체크 저장 데이터 ────────────────────────────────────
    var f  = article.m_factual        || 0;
    var l  = article.m_logic          || 0;
    var sq = article.m_source_quality || 0;
    var cv = article.m_cross_val      || 0;
    var re = article.m_recency        || 0;
    var layers = f ? [
      { layer: 'L1', name: 'Source',      score: sq, summary: '' },
      { layer: 'L2', name: 'Language',    score: l,  summary: '' },
      { layer: 'L3', name: 'Context',     score: f,  summary: '' },
      { layer: 'L4', name: 'Statistics',  score: cv, summary: '' },
      { layer: 'L5', name: 'AI Bias',     score: l,  summary: '' },
      { layer: 'L6', name: 'Fact Check',  score: f,  summary: '' },
      { layer: 'L7', name: 'Consensus',   score: re, summary: '' },
    ] : [];

    state.lastResult = {
      overall_score:     article.score || 72,
      overall_grade:     article.grade || 'B',
      verdict_class:     _toVc(article.verdict_class),
      executive_summary: article.d_sum || article.summary || '',
      _body:             '',
      layer_analysis:    layers,
      metrics: {
        factual:          f,
        logic:            l,
        source_quality:   sq,
        cross_validation: cv,
        recency:          re,
      },
      claims: (article.d_claims || []).map(function(c) {
        return { sentence: c.t || '', status: c.s || 'PARTIAL', verdict: c.v || '' };
      }),
      key_evidence: {
        supporting:    article.d_sup || [],
        contradicting: article.d_con || [],
      },
      temporal: article.d_fresh ? {
        freshness:           article.d_fresh,
        timeframe:           article.d_tf,
        expiry_risk:         article.d_er,
        recheck_recommended: article.d_rc,
      } : null,
      web_citations: (article.d_cit || []).concat(article.url ? [article.url] : []),
      _engine: 'ai_news',
      _source: article.source || '',
    };
  }

  goPage('report');
}

// verdict_class 정규화 (구형 데이터 호환)
function _toVc(raw) {
  var v = (raw || '').toLowerCase();
  if (v === 'verified')                          return 'verified';
  if (v === 'likely_true' || v === 'likely')     return 'likely';
  if (v === 'partially_true' || v === 'partial') return 'partial';
  if (v === 'misleading')                        return 'misleading';
  if (v === 'false')                             return 'false';
  return 'partial';
}
