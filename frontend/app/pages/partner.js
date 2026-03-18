// ① Client Layer — Partner News 페이지
// 7개 파트너 매체 RSS 기사 목록 표시 + ANN Verify 버튼으로 실시간 팩트체크

var _partnerLoading = false;

function loadPartner() {
  if (_partnerLoading) return;
  _partnerLoading = true;

  state.activePartner = 'all';

  // 로딩 스켈레톤
  document.getElementById('partner-articles').innerHTML =
    Array(6).fill('<div class="skeleton rounded-xl h-32"></div>').join('');

  fetch(API_URL + '/api/v4/partner/feed', {
    headers: { 'Origin': window.location.origin },
  })
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      state.partnerArticles = data.articles || [];
      state.partnerMeta     = data.partners  || [];
      renderPartners();
      renderPartnerArticles();
    })
    .catch(function(_err) {
      document.getElementById('partner-articles').innerHTML = `
        <div class="py-16 text-center text-slate-400">
          <span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>
          <p class="mb-4">Failed to load partner feed.</p>
          <button onclick="loadPartner()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>
        </div>`;
    })
    .finally(function() { _partnerLoading = false; });
}

// ── 파트너 로고 버튼 렌더링 ──────────────────────────────────────────
function renderPartners() {
  var partners = state.partnerMeta || [];
  document.getElementById('partners-row').innerHTML = partners.map(function(p) {
    var isActive = state.activePartner === p.id;
    var cls = isActive
      ? 'border-primary bg-primary/5'
      : 'border-slate-200 dark:border-slate-700 hover:border-primary/40';
    return `
    <button onclick="filterByPartner('${p.id}')"
            class="flex-shrink-0 flex flex-col items-center gap-2 px-5 py-3 rounded-2xl border-2 transition-all ${cls}">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-sm"
           style="background:${p.color}">${p.icon}</div>
      <span class="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">${escHtml(p.name)}</span>
    </button>`;
  }).join('');
}

// ── 필터 함수들 ───────────────────────────────────────────────────────
function filterByPartner(id) {
  state.activePartner = (state.activePartner === id) ? 'all' : id;
  renderPartnerArticles();
  renderPartners();
}

function setPartnerFilter(type) {
  state.partnerSortType = type;
  renderPartnerArticles();
  // 필터 버튼 활성화 스타일
  ['all', 'recent'].forEach(function(t) {
    var el = document.getElementById('pf-' + t);
    if (!el) return;
    el.className = t === type
      ? 'px-4 py-1.5 bg-primary text-white text-sm font-semibold rounded-full shadow-lg shadow-primary/20'
      : 'px-4 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors';
  });
}

function filterPartner() { renderPartnerArticles(); }

// ── 기사 시간 표시 ────────────────────────────────────────────────────
function partnerTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    var m = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  } catch (_) { return ''; }
}

// ── 기사 카드 렌더링 ──────────────────────────────────────────────────
function renderPartnerArticles() {
  var items   = (state.partnerArticles || []).filter(function(a) {
    if (state.activePartner && state.activePartner !== 'all') {
      return a.partnerId === state.activePartner;
    }
    // "Partner Exclusive" 토글은 항상 참 (RSS = 공식 매체 소스)
    return true;
  });

  // 검색 필터
  var search = ((document.getElementById('partner-search') || {}).value || '').toLowerCase();
  if (search) {
    items = items.filter(function(a) {
      return (a.title + ' ' + a.summary).toLowerCase().includes(search);
    });
  }

  // 정렬: 최신순
  if (state.partnerSortType === 'recent') {
    items = items.slice().sort(function(a, b) {
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
  }

  if (!items.length) {
    document.getElementById('partner-articles').innerHTML = `
      <div class="py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">article</span>
        <p>No articles match the current filter.</p>
      </div>`;
    return;
  }

  document.getElementById('partner-articles').innerHTML = items.map(function(a) {
    var time = partnerTimeAgo(a.pubDate);
    return `
    <article class="flex gap-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5 news-card hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <!-- 파트너 로고 -->
      <div class="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm shadow-sm"
           style="background:${a.color}">${escHtml(a.icon)}</div>
      <!-- 기사 내용 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <span class="text-xs font-bold text-slate-500">${escHtml(a.source)}</span>
          ${time ? `<span class="text-slate-300">·</span><span class="text-xs text-slate-400">${time}</span>` : ''}
          <span class="ml-auto px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold uppercase">Unverified</span>
        </div>
        <h3 class="font-bold text-slate-900 dark:text-white leading-snug mb-2 line-clamp-2">${escHtml(a.title)}</h3>
        ${a.summary ? `<p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">${escHtml(a.summary)}</p>` : ''}
        <div class="flex gap-3 mt-auto">
          <button onclick="annVerifyPartner(${JSON.stringify(a.title)}, ${JSON.stringify(a.url)})"
                  class="text-xs px-4 py-1.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:13px">fact_check</span>ANN Verify
          </button>
          <button onclick="window.open(${JSON.stringify(a.url)}, '_blank')"
                  class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary transition-all flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:13px">open_in_new</span>Original
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ── ANN Verify 버튼 → 실시간 팩트체크 실행 ────────────────────────────
function annVerifyPartner(title, url) {
  // 기사 URL을 팩트체크 입력으로 사용 (URL이 없으면 제목)
  var input = url || title;
  state.lastInput = input;
  state.imageB64  = null;
  var el = document.getElementById('home-input');
  if (el) el.value = input;
  runCheck();
}
