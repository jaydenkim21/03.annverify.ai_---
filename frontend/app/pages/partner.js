// ① Client Layer — Partner News 페이지
// 7개 파트너 매체 RSS 기사 목록 표시 + ANN Verify 버튼으로 실시간 팩트체크

var _partnerLoading = false;

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
function _getLikeCount(url)  { return parseInt(localStorage.getItem('pn_lc_' + _pnHash(url)) || '0', 10); }
function _isLiked(url)       { return localStorage.getItem('pn_ld_' + _pnHash(url)) === '1'; }
function _getCommentCount(url) { return parseInt(localStorage.getItem('pn_cc_' + _pnHash(url)) || '0', 10); }

// ── 로드 ─────────────────────────────────────────────────────────────
function _restoreVerified() {
  // localStorage에 저장된 팩트체크 결과 복원
  try {
    var stored = JSON.parse(localStorage.getItem('pn_verified') || '{}');
    if (!state.verifiedArticles) state.verifiedArticles = {};
    Object.assign(state.verifiedArticles, stored);
  } catch (_) {}
}

function loadPartner() {
  if (_partnerLoading) return;
  _partnerLoading = true;
  _restoreVerified();

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
      document.getElementById('partner-articles').innerHTML = `
        <div class="col-span-3 py-16 text-center text-slate-400">
          <span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>
          <p class="mb-4">Failed to load partner feed.</p>
          <button onclick="_partnerLoading=false; loadPartner()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>
        </div>`;
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
  var partner = (document.getElementById('filter-partners') || {}).value || 'all';
  var period  = (document.getElementById('filter-period')   || {}).value || 'all';
  var status  = (document.getElementById('filter-status')   || {}).value || 'all';
  var search  = ((document.getElementById('partner-search') || {}).value || '').toLowerCase().trim();

  var items = (state.partnerArticles || []).slice();

  // Partners 필터
  if (partner !== 'all') {
    items = items.filter(function(a) { return a.partnerId === partner; });
  }

  // Period 필터
  if (period !== 'all') {
    var days = parseInt(period, 10);
    var cutoff = Date.now() - days * 86400000;
    items = items.filter(function(a) {
      return a.pubDate && new Date(a.pubDate).getTime() >= cutoff;
    });
  }

  // Status 필터
  if (status === 'VERIFIED') {
    items = items.filter(function(a) {
      return !!(a.verifiedStatus || (state.verifiedArticles && state.verifiedArticles[a.url]));
    });
  } else if (status === 'UNVERIFIED') {
    items = items.filter(function(a) {
      return !(a.verifiedStatus || (state.verifiedArticles && state.verifiedArticles[a.url]));
    });
  }

  // 검색 필터
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
function renderPartnerArticles(items) {
  if (!items) {
    // 필터 없이 전체 렌더링
    items = (state.partnerArticles || []).slice();
  }

  // VERIFIED 기사 먼저 정렬 (팩트체크 완료 시간 기준 내림차순, 나머지는 pubDate 기준)
  items.sort(function(a, b) {
    var va = state.verifiedArticles && state.verifiedArticles[a.url];
    var vb = state.verifiedArticles && state.verifiedArticles[b.url];
    if (va && !vb) return -1;
    if (!va && vb) return 1;
    if (va && vb) {
      return new Date(vb.verifiedAt) - new Date(va.verifiedAt);
    }
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });

  if (!items.length) {
    document.getElementById('partner-articles').innerHTML = `
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">article</span>
        <p>No articles match the current filter.</p>
      </div>`;
    return;
  }

  document.getElementById('partner-articles').innerHTML = items.map(function(a) {
    var grad       = PARTNER_GRADIENT[a.partnerId] || 'from-slate-500 to-slate-700';
    var time       = partnerTimeAgo(a.pubDate);
    var titleJson  = JSON.stringify(a.title);
    var urlJson    = JSON.stringify(a.url);
    var h          = _pnHash(a.url);
    var likeCount  = _getLikeCount(a.url);
    var liked      = _isLiked(a.url);
    var cmtCount   = _getCommentCount(a.url);

    // VERIFIED 여부 판단
    var verifiedResult = (state.verifiedArticles && state.verifiedArticles[a.url]) || a.verifiedStatus;
    var isVerified     = !!verifiedResult;
    var grade          = isVerified ? (verifiedResult.grade || verifiedResult.overall_grade || '') : '';

    // 상단 배지
    var badgeHtml = isVerified
      ? `<div class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black shadow-md uppercase tracking-wide flex items-center gap-1">
           <span class="material-symbols-outlined" style="font-size:11px">verified</span>VERIFIED ${grade ? '· ' + grade : ''}
         </div>`
      : `<div class="absolute top-3 right-3 px-2.5 py-1 rounded-full border-2 border-slate-300 bg-white/90 text-slate-500 text-[10px] font-black shadow-md backdrop-blur-sm uppercase tracking-wide">
           UNVERIFIED
         </div>`;

    return `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group">

      <!-- 썸네일 -->
      <div class="relative overflow-hidden h-48 bg-gradient-to-br ${grad} shrink-0 cursor-pointer"
           onclick="annVerifyPartner(${titleJson}, ${urlJson})">
        ${a.thumb
          ? `<img src="${escHtml(a.thumb)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display='none'"/>`
          : ''}
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">
            <span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">fact_check</span>
          </div>
        </div>
        ${badgeHtml}
        <!-- 출처 배지 -->
        <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          ${escHtml(a.source)}
        </div>
        <!-- 시간 -->
        ${time ? `<div class="absolute bottom-3 right-3 text-white/70 text-[10px]">${time}</div>` : ''}
      </div>

      <!-- 콘텐츠 -->
      <div class="p-5 flex flex-col flex-1">
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3"
            onclick="annVerifyPartner(${titleJson}, ${urlJson})">${escHtml(a.title)}</h3>
        ${a.summary
          ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(a.summary)}</p>`
          : ''}

        <!-- 하단 버튼 영역 -->
        <div class="flex items-center gap-3 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">

          <!-- Like -->
          <button id="pn-like-${h}" onclick="togglePartnerLike(${urlJson}, event)"
                  class="flex items-center gap-1.5 text-sm transition-colors ${liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}">
            <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' ${liked ? 1 : 0}">favorite</span>
            <span id="pn-lc-${h}">${likeCount}</span>
          </button>

          <!-- Comment -->
          <button onclick="openPartnerComments(${urlJson}, ${titleJson}, event)"
                  class="flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-base">chat_bubble</span>
            <span id="pn-cc-${h}">${cmtCount}</span>
          </button>

          <!-- Share -->
          <button onclick="sharePartnerArticle(${urlJson}, ${titleJson}, event)"
                  class="ml-auto text-slate-400 hover:text-primary transition-colors p-1"
                  title="Share">
            <span class="material-symbols-outlined text-base">share</span>
          </button>

          <!-- Source -->
          <button onclick="event.stopPropagation(); window.open(${urlJson}, '_blank')"
                  class="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-primary border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:border-primary transition-all">
            <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>Source
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ── Like 토글 ────────────────────────────────────────────────────────
function togglePartnerLike(url, event) {
  if (event) event.stopPropagation();
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
    btn.className = 'flex items-center gap-1.5 text-sm transition-colors ' +
      (newLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500');
    var icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.style.fontVariationSettings = "'FILL' " + (newLiked ? 1 : 0);
    var countEl = document.getElementById('pn-lc-' + h);
    if (countEl) countEl.textContent = count;
  }
}

// ── 댓글 (향후 확장) ─────────────────────────────────────────────────
function openPartnerComments(_url, _title, event) {
  if (event) event.stopPropagation();
  showToast('Comments coming soon!', 'info');
}

// ── 공유 ─────────────────────────────────────────────────────────────
function sharePartnerArticle(url, title, event) {
  if (event) event.stopPropagation();

  // 기존 공유 팝업 제거
  var existing = document.getElementById('pn-share-popup');
  if (existing) { existing.remove(); return; }

  var popup = document.createElement('div');
  popup.id = 'pn-share-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.12);min-width:180px;';

  // 다크모드 대응
  if (document.documentElement.classList.contains('dark')) {
    popup.style.background = '#1e293b';
    popup.style.borderColor = '#334155';
  }

  var items = [
    { icon: 'link', label: 'Copy Link', action: function() {
        navigator.clipboard.writeText(url).then(function() {
          showToast('Link copied!', 'success');
        }).catch(function() {
          showToast('Copy failed. Please copy the URL manually.', 'error');
        });
    }},
    { icon: 'share', label: 'Share on X', action: function() {
        window.open('https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title), '_blank');
    }},
    { icon: 'thumb_up', label: 'Share on Facebook', action: function() {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank');
    }},
  ];

  popup.innerHTML = items.map(function(item, i) {
    return '<button data-share-i="' + i + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border-radius:10px;text-align:left;font-size:13px;font-weight:600;color:' + (document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155') + ';cursor:pointer;background:transparent;border:none;">' +
      '<span class="material-symbols-outlined" style="font-size:16px">' + item.icon + '</span>' + item.label + '</button>';
  }).join('');

  document.body.appendChild(popup);

  // 버튼 이벤트
  items.forEach(function(item, i) {
    popup.querySelector('[data-share-i="' + i + '"]').addEventListener('click', function() {
      item.action(); popup.remove();
    });
  });

  // 위치: 클릭된 버튼 근처
  var btn = event && event.currentTarget;
  if (btn) {
    var rect = btn.getBoundingClientRect();
    var left = rect.left + window.scrollX;
    var top  = rect.bottom + window.scrollY + 6;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  } else {
    popup.style.left = '50%';
    popup.style.top  = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  // 외부 클릭 시 닫기
  setTimeout(function() {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 10);
}

// ── ANN Verify 버튼 → 실시간 팩트체크 실행 ────────────────────────────
function annVerifyPartner(title, url) {
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
