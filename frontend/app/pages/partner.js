// ① Client Layer — Partner News 페이지
// 7개 파트너 매체 RSS 기사 목록 표시 + ANN Verify 버튼으로 실시간 팩트체크

var _partnerLoading = false;

// 파트너별 그라디언트 (AI News의 CAT_GRADIENT와 동일 방식)
var PARTNER_GRADIENT = {
  'reuters':   'from-orange-500 to-red-600',
  'yonhap':    'from-blue-600 to-blue-800',
  'ap':        'from-red-600 to-rose-800',
  'afp':       'from-slate-600 to-slate-800',
  'bloomberg': 'from-zinc-700 to-zinc-900',
  'bbc':       'from-red-700 to-red-900',
  'cnn':       'from-red-500 to-rose-700',
};

function loadPartner() {
  if (_partnerLoading) return;
  _partnerLoading = true;

  state.activePartner = state.activePartner || 'all';

  // 로딩 스켈레톤 (AI News와 동일)
  document.getElementById('partner-articles').innerHTML =
    Array(6).fill('<div class="skeleton rounded-3xl h-72"></div>').join('');

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
        <div class="col-span-3 py-16 text-center text-slate-400">
          <span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>
          <p class="mb-4">Failed to load partner feed.</p>
          <button onclick="_partnerLoading=false; loadPartner()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>
        </div>`;
    })
    .finally(function() { _partnerLoading = false; });
}

// ── 파트너 로고 버튼 렌더링 (헤더 안 컴팩트 버전) ─────────────────────
function renderPartners() {
  var partners = state.partnerMeta || [];
  document.getElementById('partners-row').innerHTML = partners.map(function(p) {
    var isActive = state.activePartner === p.id;
    var cls = isActive
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/50';
    return `
    <button onclick="filterByPartner('${p.id}')"
            class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 transition-all text-xs font-bold ${cls}">
      <span class="w-4 h-4 rounded flex items-center justify-center text-white text-[9px] font-black"
            style="background:${p.color}">${p.icon}</span>
      <span class="whitespace-nowrap">${escHtml(p.name)}</span>
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
  ['all', 'recent'].forEach(function(t) {
    var el = document.getElementById('pf-' + t);
    if (!el) return;
    el.className = t === type
      ? 'px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-full shadow-lg shadow-primary/20'
      : 'px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors';
  });
}

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

// ── 기사 카드 렌더링 (AI News 스타일) ────────────────────────────────
function renderPartnerArticles() {
  var items = (state.partnerArticles || []).filter(function(a) {
    if (state.activePartner && state.activePartner !== 'all') {
      return a.partnerId === state.activePartner;
    }
    return true;
  });

  // 검색 필터
  var search = ((document.getElementById('partner-search') || {}).value || '').toLowerCase();
  if (search) {
    items = items.filter(function(a) {
      return (a.title + ' ' + (a.summary || '')).toLowerCase().includes(search);
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
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">article</span>
        <p>No articles match the current filter.</p>
      </div>`;
    return;
  }

  document.getElementById('partner-articles').innerHTML = items.map(function(a) {
    var grad = PARTNER_GRADIENT[a.partnerId] || 'from-slate-500 to-slate-700';
    var time = partnerTimeAgo(a.pubDate);
    var titleJson = JSON.stringify(a.title);
    var urlJson   = JSON.stringify(a.url);
    return `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group">

      <!-- 썸네일 영역 -->
      <div class="relative overflow-hidden h-48 bg-gradient-to-br ${grad} shrink-0 cursor-pointer"
           onclick="annVerifyPartner(${titleJson}, ${urlJson})">
        ${a.thumb
          ? `<img src="${escHtml(a.thumb)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display='none'"/>`
          : ''}
        <!-- Hover 오버레이 -->
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">
            <span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">fact_check</span>
          </div>
        </div>
        <!-- Unverified 배지 (AI News의 Grade 배지 위치) -->
        <div class="absolute top-3 right-3 px-2.5 py-1 rounded-full border-2 border-slate-300 bg-white/90 text-slate-500 text-[10px] font-black shadow-md backdrop-blur-sm uppercase tracking-wide">
          Unverified
        </div>
        <!-- 출처 배지 -->
        <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          ${escHtml(a.source)}
        </div>
      </div>

      <!-- 콘텐츠 -->
      <div class="p-5 flex flex-col flex-1">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">RSS</span>
          <span class="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase">Not Verified</span>
          ${time ? `<span class="ml-auto text-xs text-slate-400 shrink-0">${time}</span>` : ''}
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3"
            onclick="annVerifyPartner(${titleJson}, ${urlJson})">${escHtml(a.title)}</h3>
        ${a.summary
          ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(a.summary)}</p>`
          : ''}
        <!-- 버튼 영역 (AI News 하단 버튼과 동일 구조) -->
        <div class="flex items-center gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <button onclick="annVerifyPartner(${titleJson}, ${urlJson})"
                  class="text-xs px-4 py-1.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 mr-auto">
            <span class="material-symbols-outlined" style="font-size:14px">fact_check</span>ANN Verify
          </button>
          <button onclick="event.stopPropagation(); window.open(${urlJson}, '_blank')"
                  class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold hover:border-primary hover:text-primary transition-all flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>Source
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ── ANN Verify 버튼 → 실시간 팩트체크 실행 ────────────────────────────
function annVerifyPartner(title, url) {
  // Partner News 리포트 뷰 전환용 컨텍스트 저장
  state.reportFrom = 'partner';
  state.partnerArticleData = (state.partnerArticles || []).find(function(a) {
    return a.url === url || a.title === title;
  }) || { title: title, url: url };

  var input = url || title;
  state.lastInput = input;
  state.imageB64  = null;
  var el = document.getElementById('home-input');
  if (el) el.value = input;
  runCheck();
}
