// ① Client Layer — Partner News 페이지
// 7개 파트너 매체 RSS 기사 목록 표시 + ANN Verify 버튼으로 실시간 팩트체크

var _partnerLoading    = false;
var _partnerEventsSet  = false;

// 카테고리 배지 색상
var CAT_COLOR = {
  'international': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  'politics':      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  'economy':       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  'science':       'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  'health':        'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  'social':        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

// 파트너별 그라디언트
var PARTNER_GRADIENT = {
  'reuters':   'from-orange-500 to-red-600',
  'yonhap':    'from-blue-600 to-blue-800',
  'ap':        'from-red-600 to-rose-800',
  'afp':       'from-slate-600 to-slate-800',
  'bloomberg': 'from-zinc-700 to-zinc-900',
  'bbc':       'from-red-700 to-red-900',
  'cnn':       'from-red-500 to-rose-700',
};

// ── LocalStorage 기반 Like 유지 ───────────────────────────────────────
function _pnHash(url) {
  var h = 0;
  for (var i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
function _getLikeCount(url)    { return parseInt(localStorage.getItem('pn_lc_' + _pnHash(url)) || '0', 10); }
function _isLiked(url)         { return localStorage.getItem('pn_ld_' + _pnHash(url)) === '1'; }
function _getCommentCount(url) { return parseInt(localStorage.getItem('pn_cc_' + _pnHash(url)) || '0', 10); }

// ── verified 복원 ────────────────────────────────────────────────────
function _restoreVerified() {
  try {
    var stored = JSON.parse(localStorage.getItem('pn_verified') || '{}');
    if (!state.verifiedArticles) state.verifiedArticles = {};
    Object.assign(state.verifiedArticles, stored);
    var full = JSON.parse(localStorage.getItem('pn_verified_full') || '{}');
    if (!state.verifiedFull) state.verifiedFull = {};
    Object.assign(state.verifiedFull, full);
  } catch (_) {}
}

// ── 이벤트 위임 (onclick 인라인 완전 제거 → data-* 속성 기반) ──────────
// 특수문자가 포함된 제목/URL이라도 SyntaxError 없이 안전하게 처리
function _setupPartnerEvents() {
  if (_partnerEventsSet) return;
  _partnerEventsSet = true;
  var grid = document.getElementById('partner-articles');
  if (!grid) return;

  grid.addEventListener('click', function(e) {
    var card = e.target.closest('[data-pn-url]');
    if (!card) return;
    var url   = card.dataset.pnUrl   || '';
    var title = card.dataset.pnTitle || '';

    // Source 버튼
    if (e.target.closest('.pn-source')) {
      e.stopPropagation();
      window.open(url, '_blank');
      return;
    }
    // Share 버튼
    if (e.target.closest('.pn-share')) {
      e.stopPropagation();
      var shareBtn = e.target.closest('.pn-share');
      sharePartnerArticle(url, title, shareBtn);
      return;
    }
    // Like 버튼
    if (e.target.closest('.pn-like')) {
      e.stopPropagation();
      togglePartnerLike(url);
      return;
    }
    // Comment 버튼
    if (e.target.closest('.pn-comment')) {
      e.stopPropagation();
      showToast('Comments coming soon!', 'info');
      return;
    }
    // 썸네일 / 제목 클릭 → 팩트체크
    if (e.target.closest('.pn-verify')) {
      annVerifyPartner(title, url);
    }
  });
}

// ── 로드 ─────────────────────────────────────────────────────────────
function loadPartner() {
  if (_partnerLoading) return;
  _partnerLoading = true;
  _restoreVerified();
  _setupPartnerEvents();

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
    .catch(function() {
      document.getElementById('partner-articles').innerHTML =
        '<div class="col-span-3 py-16 text-center text-slate-400">' +
          '<span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>' +
          '<p class="mb-4">Failed to load partner feed.</p>' +
          '<button class="pn-retry px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>' +
        '</div>';
      var retryBtn = document.querySelector('.pn-retry');
      if (retryBtn) retryBtn.addEventListener('click', function() {
        _partnerLoading = false; loadPartner();
      });
    })
    .finally(function() { _partnerLoading = false; });
}

// ── Partners 드롭다운 채우기 ──────────────────────────────────────────
function renderPartners() {
  var partners = state.partnerMeta || [];
  var sel = document.getElementById('filter-partners');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="all">All</option>' +
    partners.map(function(p) {
      return '<option value="' + escHtml(p.id) + '">' + escHtml(p.name) + '</option>';
    }).join('');
  if (cur && cur !== 'all') sel.value = cur;
}

// ── 필터 통합 적용 ────────────────────────────────────────────────────
function applyPartnerFilters() {
  var partner  = (document.getElementById('filter-partners') || {}).value || 'all';
  var period   = (document.getElementById('filter-period')   || {}).value || 'all';
  var status   = (document.getElementById('filter-status')   || {}).value || 'all';
  var category = (document.getElementById('filter-category') || {}).value || 'all';
  var search   = ((document.getElementById('partner-search') || {}).value || '').toLowerCase().trim();

  var items = (state.partnerArticles || []).slice();

  if (partner !== 'all') {
    items = items.filter(function(a) { return a.partnerId === partner; });
  }
  if (period !== 'all') {
    var days = parseInt(period, 10);
    var cutoff = Date.now() - days * 86400000;
    items = items.filter(function(a) {
      return a.pubDate && new Date(a.pubDate).getTime() >= cutoff;
    });
  }
  if (status === 'VERIFIED') {
    items = items.filter(function(a) {
      return !!(a.verifiedStatus || (state.verifiedArticles && state.verifiedArticles[a.url]));
    });
  } else if (status === 'UNVERIFIED') {
    items = items.filter(function(a) {
      return !(a.verifiedStatus || (state.verifiedArticles && state.verifiedArticles[a.url]));
    });
  }
  if (category !== 'all') {
    items = items.filter(function(a) { return a.category === category; });
  }
  if (search) {
    items = items.filter(function(a) {
      return (a.title + ' ' + (a.summary || '')).toLowerCase().includes(search);
    });
  }

  renderPartnerArticles(items);
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

// ── 기사 카드 렌더링 ──────────────────────────────────────────────────
// data-pn-url / data-pn-title 속성으로 데이터 전달 (inline onclick 완전 제거)
function renderPartnerArticles(items) {
  if (!items) items = (state.partnerArticles || []).slice();

  // RSS 원본 순서: pubDate 최신 우선
  items.sort(function(a, b) {
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });

  if (!items.length) {
    document.getElementById('partner-articles').innerHTML =
      '<div class="col-span-3 py-16 text-center text-slate-400">' +
        '<span class="material-symbols-outlined text-4xl mb-3 block">article</span>' +
        '<p>No articles match the current filter.</p>' +
      '</div>';
    return;
  }

  document.getElementById('partner-articles').innerHTML = items.map(function(a) {
    var grad      = PARTNER_GRADIENT[a.partnerId] || 'from-slate-500 to-slate-700';
    var time      = partnerTimeAgo(a.pubDate);
    var h         = _pnHash(a.url || '');
    var likeCount = _getLikeCount(a.url || '');
    var liked     = _isLiked(a.url || '');
    var cmtCount  = _getCommentCount(a.url || '');

    var verifiedResult = (state.verifiedArticles && state.verifiedArticles[a.url]) || a.verifiedStatus;
    var isVerified     = !!verifiedResult;
    var grade          = isVerified ? (verifiedResult.grade || verifiedResult.overall_grade || '') : '';

    var badgeHtml = isVerified
      ? '<div class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black shadow-md uppercase tracking-wide flex items-center gap-1">' +
          '<span class="material-symbols-outlined" style="font-size:11px">verified</span>VERIFIED' + (grade ? ' · ' + grade : '') +
        '</div>'
      : '<div class="absolute top-3 right-3 px-2.5 py-1 rounded-full border-2 border-slate-300 bg-white/90 text-slate-500 text-[10px] font-black shadow-md backdrop-blur-sm uppercase tracking-wide">UNVERIFIED</div>';

    var catCls  = CAT_COLOR[a.category] || CAT_COLOR['social'];
    var catHtml = a.category
      ? '<span class="inline-flex self-start mb-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ' + catCls + '">' + escHtml(a.category) + '</span>'
      : '';

    var thumbHtml = a.thumb
      ? '<img src="' + escHtml(a.thumb) + '" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display=\'none\'"/>'
      : '';

    var timeHtml = time
      ? '<div class="absolute bottom-3 right-3 text-white/70 text-[10px]">' + time + '</div>'
      : '';

    var summaryHtml = a.summary
      ? '<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">' + escHtml(a.summary) + '</p>'
      : '';

    return (
      '<article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group"' +
             ' data-pn-url="' + escHtml(a.url || '') + '"' +
             ' data-pn-title="' + escHtml(a.title || '') + '">' +

        '<!-- 썸네일 -->' +
        '<div class="pn-verify relative overflow-hidden h-48 bg-gradient-to-br ' + grad + ' shrink-0 cursor-pointer">' +
          thumbHtml +
          '<div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">' +
            '<div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">' +
              '<span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">fact_check</span>' +
            '</div>' +
          '</div>' +
          badgeHtml +
          '<div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">' + escHtml(a.source || '') + '</div>' +
          timeHtml +
        '</div>' +

        '<!-- 콘텐츠 -->' +
        '<div class="p-5 flex flex-col flex-1">' +
          catHtml +
          '<h3 class="pn-verify font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3">' + escHtml(a.title || '') + '</h3>' +
          summaryHtml +

          '<!-- 하단 버튼 -->' +
          '<div class="flex items-center gap-3 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">' +

            '<button id="pn-like-' + h + '" class="pn-like flex items-center gap-1.5 text-sm transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500') + '">' +
              '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' ' + (liked ? 1 : 0) + '">favorite</span>' +
              '<span id="pn-lc-' + h + '">' + likeCount + '</span>' +
            '</button>' +

            '<button class="pn-comment flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors">' +
              '<span class="material-symbols-outlined text-base">chat_bubble</span>' +
              '<span id="pn-cc-' + h + '">' + cmtCount + '</span>' +
            '</button>' +

            '<button class="pn-share ml-auto text-slate-400 hover:text-primary transition-colors p-1" title="Share">' +
              '<span class="material-symbols-outlined text-base">share</span>' +
            '</button>' +

            '<button class="pn-source flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-primary border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:border-primary transition-all">' +
              '<span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>Source' +
            '</button>' +

          '</div>' +
        '</div>' +
      '</article>'
    );
  }).join('');
}

// ── Like 토글 ────────────────────────────────────────────────────────
function togglePartnerLike(url) {
  var h     = _pnHash(url);
  var liked = _isLiked(url);
  var count = _getLikeCount(url);

  if (liked) {
    count = Math.max(0, count - 1);
    localStorage.removeItem('pn_ld_' + h);
  } else {
    count = count + 1;
    localStorage.setItem('pn_ld_' + h, '1');
  }
  localStorage.setItem('pn_lc_' + h, count);

  var btn = document.getElementById('pn-like-' + h);
  if (btn) {
    var newLiked = !liked;
    btn.className = 'pn-like flex items-center gap-1.5 text-sm transition-colors ' +
      (newLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500');
    var icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.style.fontVariationSettings = "'FILL' " + (newLiked ? 1 : 0);
    var countEl = document.getElementById('pn-lc-' + h);
    if (countEl) countEl.textContent = count;
  }
}

// ── 공유 (버튼 엘리먼트를 직접 받음) ─────────────────────────────────
function sharePartnerArticle(url, title, btnEl) {
  var existing = document.getElementById('pn-share-popup');
  if (existing) { existing.remove(); return; }

  var popup = document.createElement('div');
  popup.id = 'pn-share-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.12);min-width:180px;';
  if (document.documentElement.classList.contains('dark')) {
    popup.style.background = '#1e293b';
    popup.style.borderColor = '#334155';
  }

  var menuItems = [
    { icon: 'link',      label: 'Copy Link', fn: function() {
        navigator.clipboard.writeText(url).then(function() {
          showToast('Link copied!', 'success');
        }).catch(function() {
          showToast('Copy failed.', 'error');
        });
    }},
    { icon: 'share',     label: 'Share on X', fn: function() {
        window.open('https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title), '_blank');
    }},
    { icon: 'thumb_up',  label: 'Share on Facebook', fn: function() {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank');
    }},
  ];

  var isDark  = document.documentElement.classList.contains('dark');
  var textClr = isDark ? '#cbd5e1' : '#334155';

  menuItems.forEach(function(item) {
    var btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border-radius:10px;text-align:left;font-size:13px;font-weight:600;color:' + textClr + ';cursor:pointer;background:transparent;border:none;';
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">' + item.icon + '</span>' + item.label;
    btn.addEventListener('click', function() { item.fn(); popup.remove(); });
    popup.appendChild(btn);
  });

  document.body.appendChild(popup);

  if (btnEl) {
    var rect = btnEl.getBoundingClientRect();
    var left = rect.left + window.scrollX;
    var top  = rect.bottom + window.scrollY + 6;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  }

  setTimeout(function() {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 10);
}

// ── ANN Verify → 실시간 팩트체크 실행 (이미 검증된 기사는 캐시 결과 즉시 표시) ──
function annVerifyPartner(title, url) {
  state.reportFrom = 'partner';
  state.partnerArticleData = (state.partnerArticles || []).find(function(a) {
    return a.url === url || a.title === title;
  }) || { title: title, url: url };

  // 이미 검증된 기사: 캐시된 전체 결과 즉시 표시 (API 재호출 없음)
  var cachedFull = (state.verifiedFull && state.verifiedFull[url]);
  if (cachedFull) {
    state.lastResult = cachedFull;
    state.lastInput  = url || title;
    if (typeof renderPartnerReport === 'function') renderPartnerReport(cachedFull);
    goPage('partner-report');
    return;
  }

  var input = url || title;
  state.lastInput = input;
  state.imageB64  = null;
  var el = document.getElementById('home-input');
  if (el) el.value = input;
  runCheck();
}
