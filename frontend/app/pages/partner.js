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

// ── 언어 감지 (한국어 문자 포함 여부 기준) ────────────────────────────
function _detectLang(text) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text || '') ? 'ko' : 'en';
}

// ── 캐시된 결과 언어 확인 (기사 언어와 불일치 시 재검증 필요) ──────────
function _resultLangOk(result, expectedLang) {
  if (!expectedLang || expectedLang === 'en') return true;
  var summary = (result && result.executive_summary) || '';
  if (expectedLang === 'ko') return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(summary);
  return true;
}

// ── LocalStorage 기반 Like 유지 ───────────────────────────────────────
function _pnHash(url) {
  var h = 0;
  for (var i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
function _getLikeCount(url)     { return parseInt(localStorage.getItem('pn_lc_' + _pnHash(url)) || '0', 10); }
function _isLiked(url)          { return localStorage.getItem('pn_ld_' + _pnHash(url)) === '1'; }
function _getCommentCount(url)  { return parseInt(localStorage.getItem('pn_cc_' + _pnHash(url)) || '0', 10); }
function _isBookmarked(h)       { return localStorage.getItem('bm_d_' + h) === '1'; }
function _getBookmarkCount(h)   { return parseInt(localStorage.getItem('bm_c_' + h) || '0', 10); }
function _getDiscussCount(h)    { return parseInt(localStorage.getItem('pn_dc_' + h) || '0', 10); }
function _capCount(n)           { return Math.min(Math.max(0, parseInt(n) || 0), 99); }

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
    // Bookmark 버튼
    if (e.target.closest('.pn-bookmark')) {
      e.stopPropagation();
      togglePartnerBookmark(url);
      return;
    }
    // Discuss 버튼
    if (e.target.closest('.pn-discuss')) {
      e.stopPropagation();
      var art = (state.partnerArticles || []).find(function(a) { return a.url === url; });
      openPartnerDiscussion(url, title, art);
      return;
    }
    // 썸네일 / 제목 클릭 → 팩트체크 or 리포트 즉시 표시
    if (e.target.closest('.pn-verify')) {
      annVerifyPartner(title, url, card.dataset.pnVerified === '1');
    }
  });
}

// ── Firestore _summary에서 verified 상태 가져오기 ──────────────────────
function _fetchFirestoreVerified() {
  try {
    db.collection('partnerVerified').doc('_summary').get().then(function(snap) {
      if (!snap.exists) return;
      var data = snap.data() || {};
      if (!state.verifiedArticles) state.verifiedArticles = {};
      var changed = false;
      Object.keys(data).forEach(function(hash) {
        var item = data[hash];
        if (item && item.url && !state.verifiedArticles[item.url]) {
          state.verifiedArticles[item.url] = {
            grade:         item.grade,
            score:         item.score,
            verdict_class: item.verdict_class,
            verifiedAt:    item.verifiedAt,
          };
          changed = true;
        }
      });
      if (changed && state.partnerArticles && state.partnerArticles.length) {
        renderPartnerArticles();
      }
    }).catch(function() {});
  } catch (_) {}
}

// ── 로드 ─────────────────────────────────────────────────────────────
function loadPartner() {
  if (_partnerLoading) return;
  _partnerLoading = true;
  _restoreVerified();
  _setupPartnerEvents();
  _fetchFirestoreVerified();

  document.getElementById('partner-articles').innerHTML =
    Array(6).fill('<div class="skeleton rounded-3xl h-72"></div>').join('');

  fetch(API_URL + '/api/v4/partner/feed', {
    headers: { 'Origin': window.location.origin },
  })
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      state.partnerArticles = data.articles || [];
      state.partnerMeta     = data.partners  || [];

      // ── 테스트 기사 주입 (개발/QA용 — 연합뉴스 RSS 실제 기사) ──────────
      var testArticle = {
        partnerId:  'yonhap',
        source:     'Yonhap News',
        color:      '#005BAA',
        icon:       'Y',
        title:      '\'다시 석탄으로\'…중동발 에너지 대란에 아시아 각국 \'잰걸음\'',
        url:        'https://www.yonhapnewstv.co.kr/news/AKR20260320154617E1f',
        summary:    '중동 전쟁으로 인한 호르무즈 해협 봉쇄와 에너지 시설 파괴로 세계 석유·가스 공급에 차질이 빚어진 가운데 인도, 인도네시아 등 아시아 주요국이 석탄 발전과 석탄 생산량을 늘리려는 움직임을 보이고 있습니다.',
        thumb:      'https://d2k5miyk6y5zf0.cloudfront.net/article/AKR/20260320/AKR20260320154617E1f_01_i.jpg',
        pubDate:    'Fri, 20 Mar 2026 15:46:19 +0900',
        category:   'economy',
        _isTest:    true,
      };
      // 테스트 기사가 이미 있으면 중복 추가 방지
      var hasTest = state.partnerArticles.some(function(a) { return a._isTest; });
      if (!hasTest) state.partnerArticles.unshift(testArticle);

      renderPartners();
      renderPartnerArticles();
      _fetchFirestoreLikes();
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
    var h             = _pnHash(a.url || '');
    var likeCount     = _getLikeCount(a.url || '');
    var liked         = _isLiked(a.url || '');
    var bookmarked    = _isBookmarked(h);
    var bookmarkCount = _getBookmarkCount(h);
    var discussCount  = _getDiscussCount(h);

    // 등급 우선순위: 메모리 캐시 > 피드에서 온 Firestore 등급 > verifiedStatus
    var feedGrade      = a.grade ? { grade: a.grade, score: a.score, verdict_class: a.verdict_class, verifiedAt: a.verifiedAt } : null;
    var verifiedResult = (state.verifiedArticles && state.verifiedArticles[a.url]) || feedGrade || a.verifiedStatus;
    var isVerified     = !!(verifiedResult || (a.verdict_class && a.verdict_class !== 'unverified'));
    var grade          = isVerified ? (verifiedResult && (verifiedResult.grade || verifiedResult.overall_grade)) || a.grade || '' : '';

    // 피드에서 등급이 내려오면 메모리 캐시에도 동기화
    if (feedGrade && a.url && !(state.verifiedArticles && state.verifiedArticles[a.url])) {
      if (!state.verifiedArticles) state.verifiedArticles = {};
      state.verifiedArticles[a.url] = feedGrade;
    }

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

    var hoverIcon = isVerified ? 'article' : 'fact_check';

    return (
      '<article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group"' +
             ' data-pn-url="' + escHtml(a.url || '') + '"' +
             ' data-pn-title="' + escHtml(a.title || '') + '"' +
             (isVerified ? ' data-pn-verified="1"' : '') + '>' +

        '<!-- 썸네일 -->' +
        '<div class="pn-verify relative overflow-hidden h-48 bg-gradient-to-br ' + grad + ' shrink-0 cursor-pointer">' +
          thumbHtml +
          '<div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">' +
            '<div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">' +
              '<span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">' + hoverIcon + '</span>' +
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

            '<button id="pn-like-' + h + '" class="pn-like flex items-center gap-1 text-sm transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500') + '">' +
              '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' ' + (liked ? 1 : 0) + '">favorite</span>' +
              '<span id="pn-lc-' + h + '">' + _capCount(likeCount) + '</span>' +
            '</button>' +

            '<button id="pn-bm-' + h + '" class="pn-bookmark flex items-center gap-1 text-sm transition-colors ' + (bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary') + '">' +
              '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' ' + (bookmarked ? 1 : 0) + '">bookmark</span>' +
              '<span id="pn-bmc-' + h + '">' + _capCount(bookmarkCount) + '</span>' +
            '</button>' +

            '<button class="pn-discuss flex items-center gap-1 text-sm text-slate-400 hover:text-primary transition-colors">' +
              '<span class="material-symbols-outlined text-base">forum</span>' +
              '<span id="pn-dc-' + h + '">' + _capCount(discussCount) + '</span>' +
            '</button>' +

            '<button class="pn-share ml-auto text-slate-400 hover:text-primary transition-colors p-1" title="Share">' +
              '<span class="material-symbols-outlined text-base">share</span>' +
            '</button>' +

            '<button class="pn-source text-slate-400 hover:text-primary transition-colors p-1" title="Source">' +
              '<span class="material-symbols-outlined text-base">open_in_new</span>' +
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
  var uid   = (typeof firebase !== 'undefined' && firebase.auth().currentUser)
              ? firebase.auth().currentUser.uid : null;

  if (liked) {
    count = Math.max(0, count - 1);
    localStorage.removeItem('pn_ld_' + h);
    try {
      var undoUpdate = { likeCount: firebase.firestore.FieldValue.increment(-1) };
      if (uid) undoUpdate.likedBy = firebase.firestore.FieldValue.arrayRemove(uid);
      db.collection('partnerLikes').doc(h).set(undoUpdate, { merge: true }).catch(function() {});
    } catch (_) {}
  } else {
    count = count + 1;
    localStorage.setItem('pn_ld_' + h, '1');
    try {
      var addUpdate = { likeCount: firebase.firestore.FieldValue.increment(1) };
      if (uid) addUpdate.likedBy = firebase.firestore.FieldValue.arrayUnion(uid);
      db.collection('partnerLikes').doc(h).set(addUpdate, { merge: true }).catch(function() {});
    } catch (_) {}
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

// ── Firestore에서 Like/Comment 수 로드 ──────────────────────────────
function _fetchFirestoreLikes() {
  var uid = (typeof firebase !== 'undefined' && firebase.auth().currentUser)
            ? firebase.auth().currentUser.uid : null;
  (state.partnerArticles || []).forEach(function(a) {
    if (!a.url) return;
    var h = _pnHash(a.url);
    // Like 수 로드
    try {
      db.collection('partnerLikes').doc(h).get().then(function(snap) {
        if (!snap.exists) return;
        var data  = snap.data();
        var count = data.likeCount || 0;
        localStorage.setItem('pn_lc_' + h, count);
        var countEl = document.getElementById('pn-lc-' + h);
        if (countEl) countEl.textContent = count;
        // 로그인 사용자가 좋아요 눌렀는지 Firestore 기준으로 동기화
        if (uid && data.likedBy && data.likedBy.indexOf(uid) !== -1) {
          localStorage.setItem('pn_ld_' + h, '1');
          var btn = document.getElementById('pn-like-' + h);
          if (btn) {
            btn.className = 'pn-like flex items-center gap-1.5 text-sm transition-colors text-rose-500';
            var icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
          }
        }
      }).catch(function() {});
    } catch (_) {}
    // Bookmark 수 로드
    try {
      db.collection('bookmarks').doc(h).get().then(function(snap) {
        if (!snap.exists) return;
        var d = snap.data(); var c = _capCount(d.bookmarkCount || 0);
        localStorage.setItem('bm_c_' + h, c);
        var el = document.getElementById('pn-bmc-' + h); if (el) el.textContent = c;
        if (uid && d.bookmarkedBy && d.bookmarkedBy.indexOf(uid) !== -1) {
          localStorage.setItem('bm_d_' + h, '1');
          var btn = document.getElementById('pn-bm-' + h);
          if (btn) {
            btn.className = 'pn-bookmark flex items-center gap-1 text-sm transition-colors text-primary';
            var icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
          }
        }
      }).catch(function() {});
    } catch (_) {}
    // Discuss count 로드 (communityPosts sourceId 기준)
    try {
      db.collection('communityPosts').where('sourceId', '==', h).where('sourceType', '==', 'partner').limit(1).get().then(function(snap) {
        if (snap.empty) return;
        var c = _capCount(snap.docs[0].data().commentCount || 0);
        localStorage.setItem('pn_dc_' + h, c);
        var el = document.getElementById('pn-dc-' + h); if (el) el.textContent = c;
      }).catch(function() {});
    } catch (_) {}
  });
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

// ── Bookmark 토글 ─────────────────────────────────────────────────────
function togglePartnerBookmark(url) {
  var user = typeof firebase !== 'undefined' && firebase.auth().currentUser;
  if (!user) { showToast('로그인 후 북마크할 수 있습니다.', 'info'); return; }
  var h          = _pnHash(url);
  var bookmarked = _isBookmarked(h);
  var count      = _getBookmarkCount(h);
  var uid        = user.uid;

  if (bookmarked) {
    count = Math.max(0, count - 1);
    localStorage.removeItem('bm_d_' + h);
    localStorage.setItem('bm_c_' + h, count);
    db.collection('bookmarks').doc(h).set({
      bookmarkCount: firebase.firestore.FieldValue.increment(-1),
      bookmarkedBy:  firebase.firestore.FieldValue.arrayRemove(uid),
    }, { merge: true }).catch(function() {});
  } else {
    count++;
    localStorage.setItem('bm_d_' + h, '1');
    localStorage.setItem('bm_c_' + h, count);
    db.collection('bookmarks').doc(h).set({
      bookmarkCount: firebase.firestore.FieldValue.increment(1),
      bookmarkedBy:  firebase.firestore.FieldValue.arrayUnion(uid),
      type: 'partner', url: url,
    }, { merge: true }).catch(function() {});
  }

  var newBm = !bookmarked;
  var btn = document.getElementById('pn-bm-' + h);
  if (btn) {
    btn.className = 'pn-bookmark flex items-center gap-1 text-sm transition-colors ' + (newBm ? 'text-primary' : 'text-slate-400 hover:text-primary');
    var icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.style.fontVariationSettings = "'FILL' " + (newBm ? 1 : 0);
    var el = document.getElementById('pn-bmc-' + h);
    if (el) el.textContent = _capCount(count);
  }
  // 상세 뷰 동기화
  var dBtn = document.getElementById('pnr-detail-bm');
  if (dBtn && state.partnerArticleData && _pnHash(state.partnerArticleData.url || '') === h) {
    dBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (newBm ? 'text-primary' : 'text-slate-400 hover:text-primary');
    var dIcon = dBtn.querySelector('.material-symbols-outlined');
    if (dIcon) dIcon.style.fontVariationSettings = "'FILL' " + (newBm ? 1 : 0);
    var dBmc = document.getElementById('pnr-detail-bmc');
    if (dBmc) dBmc.textContent = _capCount(count);
  }
}

// ── Discussion 이동 (없으면 자동 생성) ──────────────────────────────────
function openPartnerDiscussion(url, title, articleData) {
  var h = _pnHash(url);
  db.collection('communityPosts').where('sourceId', '==', h).limit(1).get()
    .then(function(snap) {
      if (!snap.empty) {
        openCommunityDetail(snap.docs[0].id);
      } else {
        var user = auth && auth.currentUser;
        if (!user) { showToast('로그인 후 Discussion을 시작할 수 있습니다.', 'info'); return; }
        var art = articleData || {};
        var postData = {
          sourceId: h, sourceType: 'partner', sourceUrl: url,
          title: title || art.title || '',
          description: art.summary || '',
          image: art.thumb || '',
          tag: art.category || 'News',
          source: 'partner',
          yesCount: 0, partialCount: 0, noCount: 0,
          likeCount: 0, commentCount: 0,
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        };
        db.collection('communityPosts').add(postData)
          .then(function(ref) { openCommunityDetail(ref.id); })
          .catch(function(e) { console.error('Discussion 생성 실패:', e); showToast('Discussion을 만들지 못했습니다.', 'error'); });
      }
    })
    .catch(function(e) { console.error('Discussion 조회 실패:', e); showToast('Discussion을 불러오지 못했습니다.', 'error'); });
}

function openPartnerDiscussionDetail() {
  var art = state.partnerArticleData;
  if (!art || !art.url) return;
  var articleData = (state.partnerArticles || []).find(function(a) { return a.url === art.url; });
  openPartnerDiscussion(art.url, art.title, articleData);
}

// ── 상세 페이지 아이콘 상태 업데이트 ─────────────────────────────────────
function _updatePartnerDetailIcons(url) {
  if (!url) return;
  var h          = _pnHash(url);
  var liked      = _isLiked(url);
  var bookmarked = _isBookmarked(h);

  var likeBtn = document.getElementById('pnr-detail-like');
  if (likeBtn) {
    likeBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500');
    var icon = likeBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.style.fontVariationSettings = "'FILL' " + (liked ? 1 : 0);
    var lc = document.getElementById('pnr-detail-lc');
    if (lc) lc.textContent = _capCount(_getLikeCount(url));
  }
  var bmBtn = document.getElementById('pnr-detail-bm');
  if (bmBtn) {
    bmBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary');
    var icon = bmBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.style.fontVariationSettings = "'FILL' " + (bookmarked ? 1 : 0);
    var bmc = document.getElementById('pnr-detail-bmc');
    if (bmc) bmc.textContent = _capCount(_getBookmarkCount(h));
  }
  var dc = document.getElementById('pnr-detail-dc');
  if (dc) dc.textContent = _capCount(_getDiscussCount(h));

  // Firestore 비동기 동기화
  try {
    db.collection('partnerLikes').doc(h).get().then(function(snap) {
      if (!snap.exists) return;
      var d = snap.data(); var c = _capCount(d.likeCount || 0);
      localStorage.setItem('pn_lc_' + h, c);
      var el = document.getElementById('pnr-detail-lc'); if (el) el.textContent = c;
      var uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (uid && d.likedBy && d.likedBy.indexOf(uid) !== -1) {
        localStorage.setItem('pn_ld_' + h, '1');
        var b = document.getElementById('pnr-detail-like');
        if (b) { b.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-rose-500'; var ic = b.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' 1"; }
      }
    }).catch(function() {});
  } catch (_) {}
  try {
    db.collection('bookmarks').doc(h).get().then(function(snap) {
      if (!snap.exists) return;
      var d = snap.data(); var c = _capCount(d.bookmarkCount || 0);
      localStorage.setItem('bm_c_' + h, c);
      var el = document.getElementById('pnr-detail-bmc'); if (el) el.textContent = c;
      var uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (uid && d.bookmarkedBy && d.bookmarkedBy.indexOf(uid) !== -1) {
        localStorage.setItem('bm_d_' + h, '1');
        var b = document.getElementById('pnr-detail-bm');
        if (b) { b.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-primary'; var ic = b.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' 1"; }
      }
    }).catch(function() {});
  } catch (_) {}
  try {
    db.collection('communityPosts').where('sourceId', '==', h).where('sourceType', '==', 'partner').limit(1).get().then(function(snap) {
      if (snap.empty) return;
      var c = _capCount(snap.docs[0].data().commentCount || 0);
      localStorage.setItem('pn_dc_' + h, c);
      var el = document.getElementById('pnr-detail-dc'); if (el) el.textContent = c;
    }).catch(function() {});
  } catch (_) {}
}

// ── ANN Verify → 팩트체크 or 저장된 리포트 즉시 표시 ──────────────────
// isVerified: 카드 DOM의 data-pn-verified="1" 기준 (state 로딩 race condition 방지)
var _PN_REFRESH_MS = 12 * 60 * 60 * 1000; // 12시간

function _isPnExpired(url) {
  var cached = state.verifiedArticles && state.verifiedArticles[url];
  if (!cached || !cached.verifiedAt) return false;
  return (Date.now() - new Date(cached.verifiedAt).getTime()) > _PN_REFRESH_MS;
}

function annVerifyPartner(title, url, isVerified) {
  state.reportFrom = 'partner';
  state.partnerArticleData = (state.partnerArticles || []).find(function(a) {
    return a.url === url || a.title === title;
  }) || { title: title, url: url };

  // 기사 언어 감지 (팩트체크 결과 언어 결정)
  var art0 = state.partnerArticleData;
  state.partnerArticleLang = _detectLang((art0.title || '') + ' ' + (art0.summary || ''));

  // 12시간 경과 시 캐시 무효화 → 강제 재팩트체크
  if (_isPnExpired(url)) {
    if (state.verifiedFull) delete state.verifiedFull[url];
    showToast('12시간이 경과하여 최신 팩트체크를 진행합니다.', 'info');
    _runVerifyAPI(url, title);
    return;
  }

  // ① 메모리 캐시에 전체 결과 있으면 즉시 표시 (언어 일치 시에만)
  var cachedFull = state.verifiedFull && state.verifiedFull[url];
  if (cachedFull && _resultLangOk(cachedFull, state.partnerArticleLang)) {
    state.lastResult = cachedFull;
    state.lastInput  = url || title;
    goPage('report');
    return;
  }

  // ② VERIFIED 기사: Firestore에서 전체 결과 가져오기 (API 재호출 없음)
  if (isVerified || (state.verifiedArticles && state.verifiedArticles[url])) {
    showToast('Loading verified report…', 'info');
    try {
      var urlHash = _pnHash(url);
      db.collection('partnerVerified').doc(urlHash).get().then(function(snap) {
        if (snap.exists && snap.data().fullResult) {
          var full = snap.data().fullResult;
          // 기사 언어와 캐시 결과 언어가 다르면 재검증 (예: 한국어 기사인데 영문 결과)
          if (!_resultLangOk(full, state.partnerArticleLang)) {
            _runVerifyAPI(url, title);
            return;
          }
          if (!state.verifiedFull) state.verifiedFull = {};
          state.verifiedFull[url] = full;
          if (snap.data().verifiedAt && !(state.verifiedArticles && state.verifiedArticles[url])) {
            if (!state.verifiedArticles) state.verifiedArticles = {};
            state.verifiedArticles[url] = { verifiedAt: snap.data().verifiedAt };
          }
          // Firestore history 로드 → state + localStorage 동기화
          if (snap.data().history && snap.data().history.length) {
            var fsHist = snap.data().history.slice().sort(function(a, b) {
              return new Date(b.verifiedAt) - new Date(a.verifiedAt);
            });
            if (!state.verifiedHistory) state.verifiedHistory = {};
            state.verifiedHistory[url] = fsHist;
            try { localStorage.setItem('pn_history_' + _pnHash(url), JSON.stringify(fsHist)); } catch (_) {}
          }
          state.lastResult = full;
          state.lastInput  = url || title;
          goPage('report');
        } else {
          _runVerifyAPI(url, title);
        }
      }).catch(function() { _runVerifyAPI(url, title); });
    } catch (_) { _runVerifyAPI(url, title); }
    return;
  }

  // ③ UNVERIFIED 기사: 새 팩트체크 실행
  _runVerifyAPI(url, title);
}

function _runVerifyAPI(url, title) {
  var input = url || title;
  state.lastInput = input;
  state.imageB64  = null;
  var el = document.getElementById('home-input');
  if (el) el.value = input;
  runCheck();
}
