// ① Client Layer — Partner News 페이지
// 7개 파트너 매체 RSS 기사 목록 표시 + ANN Verify 버튼으로 실시간 팩트체크

var _partnerLoading    = false;
var _partnerEventsSet  = false;

// Today's Hot 캐러셀 상태
var _hotSlots      = [];
var _hotIndex      = 0;
var _hotTimer      = null;

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

    // Fact Check / Verify Report 버튼
    if (e.target.closest('.pn-factcheck')) {
      e.stopPropagation();
      annVerifyPartner(title, url, card.dataset.pnVerified === '1');
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
    // 썸네일 / 제목 클릭 → 새창으로 기사 열기
    if (e.target.closest('.pn-open')) {
      e.stopPropagation();
      window.open(url, '_blank');
      return;
    }
  });
}

// ── Partner 기사 메타 Firestore 저장 (partnerNews 컬렉션) ────────────────
function _savePartnerNewsToFirestore(articles) {
  if (!articles || !articles.length) return;
  var user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if (!user) return; // 로그인 사용자만 저장
  try {
    var batch = db.batch();
    var count = 0;
    articles.forEach(function(a) {
      if (!a.url || a._isTest) return; // 테스트 기사 제외
      var docId = _pnHash(a.url).toString();
      var ref = db.collection('partnerNews').doc(docId);
      batch.set(ref, {
        articleId:    docId,
        title:        a.title        || '',
        excerpt:      a.summary      || '',
        thumb:        a.thumb        || '',
        category:     a.category     || '',
        source_label: a.source       || '',
        partnerId:    a.partnerId    || '',
        url:          a.url,
        publishedAt:  a.pubDate      || '',
        savedAt:      firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      count++;
      if (count >= 20) return; // 배치 한도 제한
    });
    if (count > 0) batch.commit().catch(function() {});
  } catch (_) {}
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
  loadTodayHot();

  document.getElementById('partner-articles').innerHTML =
    Array(6).fill('<div class="skeleton rounded-2xl h-56"></div>').join('');

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
      renderRankings();
      _fetchFirestoreLikes();
      _savePartnerNewsToFirestore(state.partnerArticles);
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
    var time      = partnerTimeAgo(a.pubDate);
    var h             = _pnHash(a.url || '');
    var likeCount     = _getLikeCount(a.url || '');
    var liked         = _isLiked(a.url || '');
    var bookmarked    = _isBookmarked(h);
    var bookmarkCount = _getBookmarkCount(h);
    var discussCount  = _getDiscussCount(h);

    var feedGrade      = a.grade ? { grade: a.grade, score: a.score, verdict_class: a.verdict_class, verifiedAt: a.verifiedAt } : null;
    var verifiedResult = (state.verifiedArticles && state.verifiedArticles[a.url]) || feedGrade || a.verifiedStatus;
    var isVerified     = !!(verifiedResult || (a.verdict_class && a.verdict_class !== 'unverified'));

    if (feedGrade && a.url && !(state.verifiedArticles && state.verifiedArticles[a.url])) {
      if (!state.verifiedArticles) state.verifiedArticles = {};
      state.verifiedArticles[a.url] = feedGrade;
    }

    var DARK_INVERT = { bloomberg: true, ap: true, bbc: true };
    var partnerId   = escHtml(a.partnerId || '');
    var sourceName  = escHtml(a.source || '');
    var filterCls   = DARK_INVERT[a.partnerId] ? 'dark:brightness-0 dark:invert' : '';
    var catCls      = CAT_COLOR[a.category] || CAT_COLOR['social'];

    return (
      '<article class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden shadow-sm hover:shadow-md transition-shadow"' +
             ' data-pn-url="' + escHtml(a.url || '') + '"' +
             ' data-pn-title="' + escHtml(a.title || '') + '"' +
             (isVerified ? ' data-pn-verified="1"' : '') + '>' +

        '<!-- 카드 헤더: 파트너 로고 + 카테고리 + 시간 -->' +
        '<div class="flex items-center gap-2 px-4 pt-4 pb-3">' +
          '<img src="/assets/partners/' + partnerId + '.png" alt="' + sourceName + '"' +
               ' class="h-5 object-contain shrink-0 ' + filterCls + '"' +
               ' onerror="this.style.display=\'none\'">' +
          (a.category ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ' + catCls + '">' + escHtml(a.category) + '</span>' : '') +
          (time ? '<span class="ml-auto text-[11px] text-slate-400 shrink-0">' + time + '</span>' : '') +
        '</div>' +

        '<!-- 제목 + 요약 -->' +
        '<div class="pn-open px-4 pb-3 flex-1 cursor-pointer">' +
          '<h3 class="font-display font-bold text-slate-900 dark:text-white text-sm leading-snug mb-2 line-clamp-3 hover:text-primary transition-colors">' + escHtml(a.title || '') + '</h3>' +
          (a.summary ? '<p class="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2">' + escHtml(a.summary) + '</p>' : '') +
        '</div>' +

        '<!-- 하단 버튼 -->' +
        '<div class="flex items-center gap-1.5 px-4 py-3 border-t border-slate-100 dark:border-slate-800 mt-auto">' +
          '<button id="pn-like-' + h + '" class="pn-like flex items-center gap-1 text-xs transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500') + '">' +
            '<span class="material-symbols-outlined text-sm" style="font-variation-settings:\'FILL\' ' + (liked ? 1 : 0) + '">favorite</span>' +
            '<span id="pn-lc-' + h + '">' + _capCount(likeCount) + '</span>' +
          '</button>' +
          '<button id="pn-bm-' + h + '" class="pn-bookmark flex items-center gap-1 text-xs transition-colors ' + (bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary') + '">' +
            '<span class="material-symbols-outlined text-sm" style="font-variation-settings:\'FILL\' ' + (bookmarked ? 1 : 0) + '">bookmark</span>' +
            '<span id="pn-bmc-' + h + '">' + _capCount(bookmarkCount) + '</span>' +
          '</button>' +
          '<button class="pn-discuss flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors">' +
            '<span class="material-symbols-outlined text-sm">forum</span>' +
            '<span id="pn-dc-' + h + '">' + _capCount(discussCount) + '</span>' +
          '</button>' +
          '<button class="pn-share text-slate-400 hover:text-primary transition-colors p-0.5">' +
            '<span class="material-symbols-outlined text-sm">share</span>' +
          '</button>' +
          '<button id="pn-fc-' + h + '" class="pn-factcheck ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ' +
            (isVerified
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'
              : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20') + '">' +
            '<span class="material-symbols-outlined text-xs">' + (isVerified ? 'verified' : 'fact_check') + '</span>' +
            (isVerified ? 'Verify Report' : 'Fact Check') +
          '</button>' +
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
  // 좋아요 로드 완료 후 Rankings 갱신
  setTimeout(renderRankings, 1500);
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
  var user = auth && auth.currentUser;
  if (!user) { showToast('로그인 후 Discussion을 시작할 수 있습니다.', 'info'); return; }

  // 즉시 community-detail로 이동 + 스켈레톤 표시
  if (typeof _showCommunityDetailSkeleton === 'function') _showCommunityDetailSkeleton();
  goPage('community-detail');

  var h = _pnHash(url);
  db.collection('communityPosts').where('sourceId', '==', h).limit(1).get()
    .then(function(snap) {
      if (!snap.empty) {
        _loadCommunityDetail(snap.docs[0].id);
      } else {
        var art = articleData || {};
        var postData = {
          sourceId: h, sourceType: 'partner', sourceUrl: url,
          title: title || art.title || '',
          description: art.summary || art.excerpt || '',
          image: art.thumb || '',
          tag: art.category || 'News',
          score: art.score || 0,
          grade: art.grade || art.trust_grade || '',
          source: 'partner',
          yesCount: 0, partialCount: 0, noCount: 0,
          likeCount: 0, commentCount: 0,
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        };
        db.collection('communityPosts').add(postData)
          .then(function(ref) { _loadCommunityDetail(ref.id); })
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
  state.reportCategory = state.partnerArticleData.category || null;

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

// ══════════════════════════════════════════════════════════════════════
// TODAY'S HOT — 캐러셀
// ══════════════════════════════════════════════════════════════════════

function loadTodayHot() {
  fetch(API_URL + '/api/v4/partner/hot')
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      _hotSlots = (data.slots || []).filter(function(s) { return s && s.url; });
      _hotIndex = 0;
      renderTodayHot();
    })
    .catch(function() {
      var el = document.getElementById('partner-hot-carousel');
      if (el) el.innerHTML =
        '<div class="flex items-center justify-center h-full text-slate-400 text-sm py-16">' +
          '<span class="material-symbols-outlined mr-2">info</span>No featured articles configured.' +
        '</div>';
    });
}

function renderTodayHot() {
  var wrap = document.getElementById('partner-hot-carousel');
  if (!wrap) return;

  if (!_hotSlots.length) {
    wrap.innerHTML =
      '<div class="flex items-center justify-center text-slate-400 text-sm py-16">' +
        '<span class="material-symbols-outlined mr-2">info</span>No featured articles configured.' +
      '</div>';
    return;
  }

  // 캐러셀 슬라이드 HTML 생성
  var slidesHtml = _hotSlots.map(function(s, i) {
    var DARK_INVERT  = { bloomberg: true, ap: true, bbc: true };
    var filterCls    = DARK_INVERT[s.partnerId] ? 'brightness-0 invert' : '';
    var catCls       = CAT_COLOR[s.category] || CAT_COLOR['social'];
    var time         = partnerTimeAgo(s.pubDate);
    var h            = _pnHash(s.url || '');
    var likeCount    = _getLikeCount(s.url || '');
    var liked        = _isLiked(s.url || '');
    var bookmarked   = _isBookmarked(h);
    var bookmarkCount = _getBookmarkCount(h);
    var discussCount = _getDiscussCount(h);
    var isVerified   = !!(state.verifiedArticles && state.verifiedArticles[s.url]);
    var feedGrade    = s.grade || '';

    return (
      '<div class="partner-hot-slide absolute inset-0 transition-opacity duration-500 flex flex-col" style="opacity:' + (i === 0 ? '1' : '0') + ';pointer-events:' + (i === 0 ? 'auto' : 'none') + '" data-hot-idx="' + i + '">' +

        '<!-- 다크 이미지 영역 -->' +
        '<div class="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 cursor-pointer pn-open"' +
             ' data-pn-url="' + escHtml(s.url || '') + '" data-pn-title="' + escHtml(s.title || '') + '">' +
          (s.thumb
            ? '<img src="' + escHtml(s.thumb) + '" class="absolute inset-0 w-full h-full object-cover opacity-50" onerror="this.style.display=\'none\'">'
            : '') +
          '<div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10"></div>' +

          '<!-- 상단: 로고 + 카테고리 + 시간 -->' +
          '<div class="absolute top-4 left-4 right-4 flex items-center gap-2">' +
            '<img src="/assets/partners/' + escHtml(s.partnerId || '') + '.png" alt="' + escHtml(s.source || '') + '"' +
                 ' class="h-6 object-contain shrink-0 ' + filterCls + '"' +
                 ' onerror="this.style.display=\'none\'">' +
            (s.category ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ' + catCls + '">' + escHtml(s.category) + '</span>' : '') +
            (isVerified ? '<span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase"><span class="material-symbols-outlined" style="font-size:10px">verified</span>' + (feedGrade ? feedGrade : 'VERIFIED') + '</span>' : '') +
            (time ? '<span class="ml-auto text-white/60 text-xs shrink-0">' + time + '</span>' : '') +
          '</div>' +

          '<!-- 하단: 제목 + AI 요약 -->' +
          '<div class="absolute bottom-4 left-4 right-4">' +
            '<h2 class="text-white font-black text-xl sm:text-2xl leading-tight mb-2 line-clamp-3">' + escHtml(s.title || '') + '</h2>' +
            (s.summary
              ? '<p class="text-white/70 text-sm leading-relaxed line-clamp-2">' +
                  '<span class="text-cyan-400 font-bold text-xs mr-1">AI SUMMARY:</span>' + escHtml(s.summary) +
                '</p>'
              : '') +
          '</div>' +

          '<!-- 좌우 화살표 -->' +
          (_hotSlots.length > 1
            ? '<button class="hot-prev absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-all backdrop-blur-sm">' +
                '<span class="material-symbols-outlined text-lg">chevron_left</span>' +
              '</button>' +
              '<button class="hot-next absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-all backdrop-blur-sm">' +
                '<span class="material-symbols-outlined text-lg">chevron_right</span>' +
              '</button>'
            : '') +
        '</div>' +

        '<!-- 하단 액션 바 (흰 배경) -->' +
        '<div class="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0"' +
             ' data-pn-url="' + escHtml(s.url || '') + '" data-pn-title="' + escHtml(s.title || '') + '"' +
             (isVerified ? ' data-pn-verified="1"' : '') + '>' +
          '<button id="hot-like-' + h + '" class="pn-like flex items-center gap-1 text-sm transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500') + '">' +
            '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' ' + (liked ? 1 : 0) + '">favorite</span>' +
            '<span id="hot-lc-' + h + '">' + _capCount(likeCount) + '</span>' +
          '</button>' +
          '<button id="hot-bm-' + h + '" class="pn-bookmark flex items-center gap-1 text-sm transition-colors ' + (bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary') + '">' +
            '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' ' + (bookmarked ? 1 : 0) + '">bookmark</span>' +
            '<span id="hot-bmc-' + h + '">' + _capCount(bookmarkCount) + '</span>' +
          '</button>' +
          '<button class="pn-discuss flex items-center gap-1 text-sm text-slate-400 hover:text-primary transition-colors">' +
            '<span class="material-symbols-outlined text-base">forum</span>' +
            '<span id="hot-dc-' + h + '">' + _capCount(discussCount) + '</span>' +
          '</button>' +
          '<button class="pn-share text-slate-400 hover:text-primary transition-colors p-1">' +
            '<span class="material-symbols-outlined text-base">share</span>' +
          '</button>' +
          '<button class="pn-factcheck ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ' +
            (isVerified
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-200 dark:border-emerald-800'
              : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20') + '">' +
            '<span class="material-symbols-outlined text-sm">' + (isVerified ? 'verified' : 'fact_check') + '</span>' +
            (isVerified ? 'Verify Report' : 'Fact Check') +
          '</button>' +
        '</div>' +

      '</div>'
    );
  }).join('');

  // 인디케이터 점
  var dotsHtml = _hotSlots.length > 1
    ? '<div class="hot-dots absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">' +
        _hotSlots.map(function(_, i) {
          return '<button class="hot-dot w-2 h-2 rounded-full transition-all ' +
            (i === 0 ? 'bg-white w-5' : 'bg-white/40') + '" data-dot="' + i + '"></button>';
        }).join('') +
      '</div>'
    : '';

  wrap.innerHTML = '<div class="relative w-full h-full" style="min-height:380px">' + slidesHtml + dotsHtml + '</div>';

  // 이벤트: 화살표 + 인디케이터
  wrap.querySelectorAll('.hot-prev').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); _hotMove(-1); });
  });
  wrap.querySelectorAll('.hot-next').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); _hotMove(1); });
  });
  wrap.querySelectorAll('.hot-dot').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      _hotGoTo(parseInt(btn.dataset.dot));
    });
  });
  // pn-open (카드 클릭 → 새창)
  wrap.querySelectorAll('.pn-open').forEach(function(el) {
    el.addEventListener('click', function() {
      var url = el.dataset.pnUrl;
      if (url) window.open(url, '_blank');
    });
  });

  // 3초 자동 전환
  if (_hotTimer) clearInterval(_hotTimer);
  if (_hotSlots.length > 1) {
    _hotTimer = setInterval(function() { _hotMove(1); }, 3000);
  }
}

function _hotMove(dir) {
  _hotGoTo((_hotIndex + dir + _hotSlots.length) % _hotSlots.length);
}

function _hotGoTo(idx) {
  var wrap = document.getElementById('partner-hot-carousel');
  if (!wrap) return;
  var slides = wrap.querySelectorAll('.partner-hot-slide');
  var dots   = wrap.querySelectorAll('.hot-dot');
  slides.forEach(function(s, i) {
    s.style.opacity       = i === idx ? '1' : '0';
    s.style.pointerEvents = i === idx ? 'auto' : 'none';
  });
  dots.forEach(function(d, i) {
    d.className = 'hot-dot rounded-full transition-all ' + (i === idx ? 'bg-white w-5 h-2' : 'bg-white/40 w-2 h-2');
  });
  _hotIndex = idx;
}

// ══════════════════════════════════════════════════════════════════════
// TODAY'S RANKINGS — verified 기사 중 좋아요 많은 순 상위 5개
// ══════════════════════════════════════════════════════════════════════

function renderRankings() {
  var wrap = document.getElementById('partner-rankings');
  if (!wrap) return;

  var articles = (state.partnerArticles || []).filter(function(a) {
    if (a._isTest) return false;
    var feedGrade  = a.grade ? { grade: a.grade, score: a.score } : null;
    var verResult  = (state.verifiedArticles && state.verifiedArticles[a.url]) || feedGrade || a.verifiedStatus;
    return !!(verResult || (a.verdict_class && a.verdict_class !== 'unverified'));
  });

  articles.sort(function(a, b) {
    var likeA  = _getLikeCount(a.url);
    var likeB  = _getLikeCount(b.url);
    if (likeB !== likeA) return likeB - likeA;
    var scoreA = a.score || 0;
    var scoreB = b.score || 0;
    return scoreB - scoreA;
  });

  var top5 = articles.slice(0, 5);

  if (!top5.length) {
    wrap.innerHTML =
      '<div class="flex flex-col items-center justify-center py-12 text-slate-400 text-sm gap-2">' +
        '<span class="material-symbols-outlined text-3xl">fact_check</span>' +
        '<p>No verified articles yet.</p>' +
      '</div>';
    return;
  }

  wrap.innerHTML = top5.map(function(a, i) {
    var verResult = (state.verifiedArticles && state.verifiedArticles[a.url]) || a.verifiedStatus || {};
    var score     = verResult.score || a.score || 0;
    var scoreClr  = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-400';
    var rankClr   = ['text-amber-500','text-slate-400','text-amber-700','text-slate-500','text-slate-500'][i] || 'text-slate-400';

    return (
      '<div class="flex items-center gap-3 px-4 py-3 ' + (i < top5.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : '') + ' hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer pn-open"' +
           ' data-pn-url="' + escHtml(a.url || '') + '" data-pn-title="' + escHtml(a.title || '') + '">' +
        '<span class="font-black text-lg w-7 shrink-0 ' + rankClr + '">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2">' + escHtml(a.title || '') + '</p>' +
          '<p class="text-[11px] text-slate-400 mt-0.5">' + escHtml(a.source || '') + '</p>' +
        '</div>' +
        (score
          ? '<div class="text-right shrink-0">' +
              '<span class="text-xl font-black ' + scoreClr + '">' + score + '</span>' +
              '<p class="text-[10px] text-slate-400 leading-none">TRUST</p>' +
            '</div>'
          : '') +
      '</div>'
    );
  }).join('');

  // 클릭 → 새창
  wrap.querySelectorAll('.pn-open').forEach(function(el) {
    el.addEventListener('click', function() {
      var url = el.dataset.pnUrl;
      if (url) window.open(url, '_blank');
    });
  });
}
